import path from "node:path";

import "dotenv/config";

// Express.js and modules
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import morgan from "morgan";

import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const app = express();
const port = process.env.port || 3000;

const downloadFolderPath = path.resolve(options.directory, "download");

app.use(bodyParser.json());
app.use(compression());
app.use(cors());
app.use(express.static(downloadFolderPath));
app.use(morgan("combined"));

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    logMsg(`Example app listening on port ${port}`);
});
