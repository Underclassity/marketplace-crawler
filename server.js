import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";

// Express.js and modules
import { expressSharp, FsAdapter } from "express-sharp";
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import morgan from "morgan";

import { LowSync, MemorySync } from "lowdb";

import {
    deleteItem,
    getBrands,
    getFilesSize,
    getItem,
    getPredictions,
    loadDB,
} from "./src/helpers/db.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import getRandom from "./src/helpers/random.js";
import createQueue from "./src/helpers/create-queue.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const sizeDb = new LowSync(new MemorySync(), {});

sizeDb.read();

if (!sizeDb.data) {
    sizeDb.data = {};
    sizeDb.write();
}

const app = express();
const port = process.env.port || 3000;

const downloadFolderPath = path.resolve(options.directory, "download");

const queue = createQueue();

app.use(bodyParser.json());
app.use(compression());
app.use(cors());
app.use(express.static(downloadFolderPath));
app.use(morgan("combined"));

const adapters = getAdaptersIds();

for (const adapter of adapters) {
    app.use(
        `/static/${adapter}`,
        expressSharp({
            imageAdapter: new FsAdapter(
                path.resolve(options.directory, "download", adapter)
            ),
        })
    );
}

function getRandomFilesIds(adapter, itemId) {
    const dbPrefix = `${adapter}-files`;

    const db = loadDB(dbPrefix);

    if (itemId in db.data) {
        let files = db.data[itemId];

        files = files.filter((filename) => path.extname(filename) != ".mp4");

        if (!Array.isArray(files)) {
            return [];
        }

        return files.length >= 9 ? getRandom(files, 9) : files;
    } else {
        return [];
    }
}

app.get("/adapters", (req, res) => {
    return res.json({ adapters: getAdaptersIds() });
});

app.get("/adapters/:id", (req, res) => {
    const { id: adapter } = req.params;

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;
    const sortId = req.query.sort || false;
    let brand = req.query.brand || false;

    if (brand == "false" || brand == "true") {
        brand = false;
    }

    if (!adapters.includes(adapter)) {
        return res.json({
            items: {},
            count: 0,
            error: `${adapter} not found in adapters`,
        });
    }

    const dbPrefix = `${adapter}-products`;
    const dbFilesPrefix = `${adapter}-files`;

    const db = loadDB(dbPrefix);
    const dbFiles = loadDB(dbFilesPrefix);

    const count = Object.keys(db.data).length;

    let allItemsIDs = Object.keys(db.data)
        .filter((itemId) => !db.data[itemId]?.deleted)
        .filter((itemId) => {
            if (!isPhotos) {
                return true;
            }

            if (!(itemId in dbFiles.data)) {
                return false;
            }

            return dbFiles.data[itemId].length;
        });

    if (brand) {
        allItemsIDs = allItemsIDs.filter((itemId) => {
            if (brand == "no-brand") {
                return !("brand" in db.data[itemId]);
            }

            return db.data[itemId]?.brand == brand;
        });
    }

    if (sortId) {
        allItemsIDs = allItemsIDs.sort((a, b) => {
            const aItem = db.data[a];
            const bItem = db.data[b];

            if (!(`${adapter}-${a}` in sizeDb.data)) {
                sizeDb.data[`${adapter}-${a}`] = getFilesSize(adapter, a);
                sizeDb.write();
            }

            if (!(`${adapter}-${b}` in sizeDb.data)) {
                sizeDb.data[`${adapter}-${b}`] = getFilesSize(adapter, b);
                sizeDb.write();
            }

            if (sortId == "reviewsAsc") {
                return aItem.reviews.length - bItem.reviews.length;
            }

            if (sortId == "reviewsDesc") {
                return bItem.reviews.length - aItem.reviews.length;
            }

            if (sortId == "sizeAsc" || sortId == "sizeDesc") {
                const aSize = sizeDb.data[`${adapter}-${a}`];
                const bSize = sizeDb.data[`${adapter}-${b}`];

                if (sortId == "sizeAsc") {
                    return aSize - bSize;
                }

                if (sortId == "sizeDesc") {
                    return bSize - aSize;
                }
            }

            if (!(sortId == "filesAsc" || sortId == "filesDesc")) {
                return false;
            }

            const aFilesCount = a in dbFiles.data ? dbFiles.data[a].length : 0;
            const bFilesCount = b in dbFiles.data ? dbFiles.data[b].length : 0;

            if (sortId == "filesAsc") {
                return aFilesCount - bFilesCount;
            }

            if (sortId == "filesDesc") {
                return bFilesCount - aFilesCount;
            }
        });
    }

    // Cut items
    const resultItemsIDs = allItemsIDs.slice(
        (page - 1) * limit,
        (page - 1) * limit + limit
    );

    const items = [];

    for (const itemId of resultItemsIDs) {
        const resultItem = { ...db.data[itemId] };

        resultItem.id = itemId;
        resultItem.reviews = db.data[itemId].reviews.length;
        resultItem.images = getRandomFilesIds(adapter, itemId).sort();
        resultItem.files =
            itemId in dbFiles.data ? dbFiles.data[itemId].length : 0;

        resultItem.size = sizeDb.data[`${adapter}-${itemId}`];

        items.push(resultItem);
    }

    logMsg(
        `Get page ${page} for adapter ${adapter} with limit ${limit}: ${resultItemsIDs.length} items from ${count}`
    );

    return res.json({ items, count: allItemsIDs.length, error: false });
});

app.get("/adapters/:id/:itemId", (req, res) => {
    const { id, itemId } = req.params;

    if (!adapters.includes(id)) {
        return res.json({
            info: {},
            files: [],
            count: 0,
            size: 0,
            error: `${id} not found in adapters`,
        });
    }

    const dbPrefix = `${id}-products`;
    const dbFilesPrefix = `${id}-files`;

    const db = loadDB(dbPrefix);
    const dbFiles = loadDB(dbFilesPrefix);

    const info = db.data[itemId];

    const files = itemId in dbFiles.data ? dbFiles.data[itemId].sort() : [];

    const size = files.reduce((previous, current) => {
        previous += fs.statSync(
            path.resolve(options.directory, "download", id, itemId, current)
        ).size;
        return previous;
    }, 0);

    return res.json({
        info,
        files,
        count: files.length,
        size,
        error: false,
    });
});

app.delete("/adapters/:id/:itemId", (req, res) => {
    const { id, itemId } = req.params;

    const item = getItem(id, itemId);

    if (!item || item.deleted) {
        return res.json({
            result: true,
            error: false,
        });
    }

    const thumbnailFilePath = path.resolve(
        options.directory,
        "thumbnails",
        id,
        `${id}.webp`
    );

    const itemDownloadFolder = path.resolve(
        options.directory,
        "download",
        id,
        id
    );

    // found db item and set delete param to true
    const { result } = deleteItem(id, itemId);

    // delete thumbnail
    if (fs.existsSync(thumbnailFilePath) && result) {
        fs.unlinkSync(thumbnailFilePath);
    }

    // delete item dir if exist
    if (fs.existsSync(itemDownloadFolder) && result) {
        fs.rmSync(itemDownloadFolder, { recursive: true });
    }

    return res.json({
        result,
        error: false,
    });
});

app.get("/files/:id/:itemId", (req, res) => {
    const { id, itemId } = req.params;

    if (!adapters.includes(id)) {
        return res.json({
            info: {},
            files: [],
            count: 0,
            error: `${id} not found in adapters`,
        });
    }

    const dbFilesPrefix = `${id}-files`;

    const dbFiles = loadDB(dbFilesPrefix);

    if (!(itemId in dbFiles.data)) {
        return res.json({
            files: {},
            count: 0,
            error: `${itemId} not found in database`,
        });
    }

    const files = itemId in dbFiles.data ? dbFiles.data[itemId].sort() : [];

    return res.json({
        files,
        count: files.length,
        error: false,
    });
});

app.get("/brands/:adapter", (req, res) => {
    const { adapter } = req.params;

    const brands = getBrands(adapter);

    return res.json({
        brands,
        error: false,
    });
});

app.get("/predictions/:adapter", (req, res) => {
    const { adapter } = req.params;

    const predictions = getPredictions(adapter);

    return res.json({
        predictions,
        error: false,
    });
});

app.get("/queue", (req, res) => {
    return res.json({
        queue,
        error: false,
    });
});

app.listen(port, () => {
    logMsg(`Example app listening on port ${port}`);
});
