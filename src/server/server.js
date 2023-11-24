import path from "node:path";
import process from "node:process";

// import ViteExpress from "vite-express";

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
    getBrands,
    getItem,
    getItems,
    getPredictions,
    getTags,
    loadDB,
} from "../helpers/db.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";
import logMsg from "../helpers/log-msg.js";

import options from "../options.js";

import adapterRouter from "./adapters.js";
import favoriteRouter from "./favorite.js";
import queueRouter from "./queue.js";

const sizeDb = new LowSync(new MemorySync(), {});

sizeDb.read();

if (!sizeDb.data) {
    sizeDb.data = {};
    sizeDb.write();
}

const app = express();
const port = process.env.port || 3000;

const downloadFolderPath = path.resolve(options.directory, "download");
const modelsFolder = path.resolve(options.directory, "models");

app.use(bodyParser.json());
app.use(compression());
app.use(cors());
app.use(express.static(downloadFolderPath));
app.use(express.static(modelsFolder));
app.use("/queue", queueRouter);
app.use("/adapters", adapterRouter);
app.use("/favorite", favoriteRouter);
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

app.get("/files/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            info: {},
            files: [],
            count: 0,
            error: `${adapter} not found in adapters`,
        });
    }

    const dbFilesPrefix = `${adapter}-files`;

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

    const brands = getBrands(adapter, true);

    return res.json({
        brands,
        error: false,
    });
});

app.get("/tags/:adapter", (req, res) => {
    const { adapter } = req.params;

    const tags = getTags(adapter);

    return res.json({
        tags,
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

app.get("/categories/:adapter", (req, res) => {
    const { adapter } = req.params;

    const items = getItems(adapter, true);

    if (adapter != "wildberries" || !items.length) {
        return res.json({ categories: {} });
    }

    const cache = {};

    for (const itemId of items) {
        const product = getItem(adapter, itemId);

        if (!product.info) {
            continue;
        }

        const { info } = product;

        if (!cache[info.subj_root_name]) {
            cache[info.subj_root_name] = {};
        }

        if (!cache[info.subj_root_name][info.subj_name]) {
            cache[info.subj_root_name][info.subj_name] = {
                count: 0,
                subject_id: info.data.subject_id,
                subject_root_id: info.data.subject_root_id,
            };
        }

        cache[info.subj_root_name][info.subj_name].count++;

        if (
            info.data.subject_id !=
            cache[info.subj_root_name][info.subj_name].subject_id
        ) {
            console.log(info);
        }

        if (
            info.data.subject_root_id !=
            cache[info.subj_root_name][info.subj_name].subject_root_id
        ) {
            console.log(info);
        }
    }

    return res.json({ categories: cache });
});

app.listen(port, () => {
    logMsg(`Example app listening on port ${port}`);
});

// ViteExpress.listen(app, port, () => {
//     logMsg(`Example app listening on port ${port}`);
// });
