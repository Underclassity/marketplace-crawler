import path from "node:path";
import process from "node:process";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import "dotenv/config";

// Express.js and modules
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import morgan from "morgan";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import getRandom from "./src/helpers/random.js";
import logMsg from "./src/helpers/log-msg.js";
import options from "./src/options.js";

const app = express();
const port = process.env.port || 3000;

const downloadFolderPath = path.resolve(options.directory, "download");

const dbPath = path.resolve(options.directory, "db");

const dbCache = {};

app.use(bodyParser.json());
app.use(compression());
app.use(cors());
app.use(express.static(downloadFolderPath));
app.use(morgan("combined"));

const adapters = getAdaptersIds();

for (const adapter of adapters) {
    app.use(
        `/static/${adapter}`,
        express.static(path.resolve(options.directory, "download", adapter))
    );
}

function getRandomFilesIds(adapter, itemId) {
    const dbPrefix = `${adapter}-files`;

    if (!(dbPrefix in dbCache)) {
        dbCache[dbPrefix] = new LowSync(
            new JSONFileSync(path.resolve(dbPath, `${dbPrefix}.json`))
        );
    }

    dbCache[dbPrefix].read();

    if (itemId in dbCache[dbPrefix].data) {
        const files = dbCache[dbPrefix].data[itemId].map(
            (filepath) => path.parse(filepath).base
        );

        return files.length >= 9 ? getRandom(files, 9) : files;
    } else {
        return [];
    }
}

app.get("/adapters", (req, res) => {
    return res.json({ adapters: getAdaptersIds() });
});

app.get("/adapters/:id", (req, res) => {
    const { id } = req.params;

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;
    const sortId = req.query.sort || false;

    if (!adapters.includes(id)) {
        return res.json({
            items: {},
            count: 0,
            error: `${id} not found in adapters`,
        });
    }

    const dbPrefix = `${id}-products`;
    const dbFilesPrefix = `${id}-files`;

    if (!(dbPrefix in dbCache)) {
        dbCache[dbPrefix] = new LowSync(
            new JSONFileSync(path.resolve(dbPath, `${dbPrefix}.json`))
        );
    }

    if (!(dbFilesPrefix in dbCache)) {
        dbCache[dbFilesPrefix] = new LowSync(
            new JSONFileSync(path.resolve(dbPath, `${dbFilesPrefix}.json`))
        );
    }

    dbCache[dbPrefix].read();
    dbCache[dbFilesPrefix].read();

    let allItemsIDs = Object.keys(dbCache[dbPrefix].data).filter((itemId) => {
        if (!isPhotos) {
            return true;
        }

        if (!(itemId in dbCache[dbFilesPrefix].data)) {
            return false;
        }

        return dbCache[dbFilesPrefix].data[itemId].length;
    });

    if (sortId) {
        allItemsIDs = allItemsIDs.sort((a, b) => {
            const aItem = dbCache[dbPrefix].data[a];
            const bItem = dbCache[dbPrefix].data[b];

            if (sortId == "reviewsAsc") {
                return aItem.reviews.length - bItem.reviews.length;
            }

            if (sortId == "reviewsDesc") {
                return bItem.reviews.length - aItem.reviews.length;
            }

            if (!(sortId == "filesAsc" || sortId == "filesDesc")) {
                return;
            }

            const aFilesCount =
                a in dbCache[dbFilesPrefix].data
                    ? dbCache[dbFilesPrefix].data[a].length
                    : 0;
            const bFilesCount =
                b in dbCache[dbFilesPrefix].data
                    ? dbCache[dbFilesPrefix].data[b].length
                    : 0;

            if (sortId == "filesAsc") {
                return aFilesCount - bFilesCount;
            }

            if (sortId == "filesDesc") {
                return bFilesCount - aFilesCount;
            }
        });
    }

    // cut items
    const resultItemsIDs = allItemsIDs.slice(
        (page - 1) * limit,
        (page - 1) * limit + limit
    );

    const items = {};

    for (const itemId of resultItemsIDs) {
        items[itemId] = { ...dbCache[dbPrefix].data[itemId] };
        items[itemId].reviews = dbCache[dbPrefix].data[itemId].reviews.length;
        items[itemId].images = getRandomFilesIds(id, itemId);
        items[itemId].files =
            itemId in dbCache[dbFilesPrefix].data
                ? dbCache[dbFilesPrefix].data[itemId].length
                : 0;
    }

    logMsg(
        `Get page ${page} for adapter ${id} with limit ${limit}: ${resultItemsIDs.length} items`
    );

    return res.json({ items, count: allItemsIDs.length, error: false });
});

app.get("/files/:id/:itemId", (req, res) => {
    const { id, itemId } = req.params;

    if (!adapters.includes(id)) {
        return res.json({
            files: [],
            count: 0,
            error: `${id} not found in adapters`,
        });
    }

    const dbPrefix = `${id}-files`;

    if (!(dbPrefix in dbCache)) {
        dbCache[dbPrefix] = new LowSync(
            new JSONFileSync(path.resolve(dbPath, `${dbPrefix}.json`))
        );
    }

    dbCache[dbPrefix].read();

    if (!(itemId in dbCache[dbPrefix].data)) {
        return res.json({
            files: {},
            count: 0,
            error: `${itemId} not found in database`,
        });
    }

    const files = dbCache[dbPrefix].data[itemId].map(
        (filepath) => path.parse(filepath).base
    );

    return res.json({
        files,
        count: files.length,
        error: false,
    });
});

app.listen(port, () => {
    logMsg(`Example app listening on port ${port}`);
});
