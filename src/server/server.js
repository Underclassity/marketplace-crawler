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

import { getBrands, getPredictions, getTags, loadDB } from "../helpers/db.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";
import logMsg from "../helpers/log-msg.js";

import options from "../options.js";

import adapterRouter from "./adapters.js";
import favoriteRouter from "./favorite.js";
import queueRouter from "./queue.js";
import usersRouter from "./users.js";
import predictionsRouter from "./predictions.js";
import categoriesRouter from "./categories.js";

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
app.use("/users", usersRouter);
app.use("/predictions", predictionsRouter);
app.use("/categories", categoriesRouter);
app.use(morgan("combined"));

const adapters = getAdaptersIds();

for (const adapter of adapters) {
    app.use(
        `/static/${adapter}`,
        expressSharp({
            imageAdapter: new FsAdapter(
                path.resolve(options.directory, "download", adapter),
            ),
        }),
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

app.get("/brands/:adapter", async (req, res) => {
    const { adapter } = req.params;

    const brands = await getBrands(adapter, true);

    return res.json({
        brands,
        error: false,
    });
});

app.get("/tags/:adapter", async (req, res) => {
    const { adapter } = req.params;

    const tags = await getTags(adapter);

    return res.json({
        tags,
        error: false,
    });
});

app.get("/predictions/:adapter", async (req, res) => {
    const { adapter } = req.params;

    const predictions = await getPredictions(adapter);

    return res.json({
        predictions,
        error: false,
    });
});

app.listen(port, () => {
    logMsg(`Example app listening on port ${port}`);
});
