import path from "node:path";
import process from "node:process";

import ViteExpress from "vite-express";

import "dotenv/config";

// Express.js and modules
import { expressSharp, FsAdapter } from "express-sharp";
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
// import morgan from "morgan";

import { LowSync, MemorySync } from "lowdb";

import { getBrands, getPredictions, getTags, loadDB } from "../helpers/db.js";
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

app.use(bodyParser.json());
app.use(compression());
app.use(cors());
app.use(express.static(downloadFolderPath));
app.use("/queue", queueRouter);
app.use("/adapters", adapterRouter);
app.use("/favorite", favoriteRouter);
// app.use(morgan("combined"));

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

// app.listen(port, () => {
//     logMsg(`Example app listening on port ${port}`);
// });

ViteExpress.listen(app, port, () => {
    logMsg(`Example app listening on port ${port}`);
});
