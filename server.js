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

import logMsg from "./src/helpers/log-msg.js";
import options from "./src/options.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";

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

app.get("/adapters", (req, res) => {
    return res.json({ adapters: getAdaptersIds() });
});

app.get("/adapters/:id", (req, res) => {
    const { id } = req.params;

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;

    if (!adapters.includes(id)) {
        return res.json({
            items: {},
            count: 0,
            error: `${id} not found in adapters`,
        });
    }

    const dbPrefix = `${id}-products`;

    if (!(dbPrefix in dbCache)) {
        dbCache[dbPrefix] = new LowSync(
            new JSONFileSync(path.resolve(dbPath, `${dbPrefix}.json`))
        );
    }

    dbCache[dbPrefix].read();

    const allItemsIDs = Object.keys(dbCache[dbPrefix].data).filter((itemId) => {
        if (!isPhotos) {
            return true;
        }

        return Object.keys(dbCache[dbPrefix].data[itemId].reviews).length;
    });

    // cut items
    const resultItemsIDs = allItemsIDs.slice(
        (page - 1) * limit,
        (page - 1) * limit + limit
    );

    const items = {};

    for (const itemId of resultItemsIDs) {
        items[itemId] = { ...dbCache[dbPrefix].data[itemId] };
        items[itemId].reviews = dbCache[dbPrefix].data[itemId].reviews.length;
    }

    console.log(
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
