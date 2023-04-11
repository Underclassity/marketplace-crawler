import fs from "node:fs";
import path from "node:path";

import PQueue from "p-queue";

import { processFile } from "./src/helpers/download.js";
import walk from "./src/helpers/walk.js";

import options from "./src/options.js";

const queue = new PQueue({
    concurrency: options.throat,
    timeout: options.timeout,
    autoStart: true,
    carryoverConcurrencyCount: true,
});

(async () => {
    let files = await walk(path.resolve(options.directory, "download"));

    files = files
        .filter((item) => {
            return path.extname(item) != ".webp";
        })
        .filter((item) => {
            return path.extname(item) != ".json";
        })
        .filter((item) => {
            return path.extname(item) != ".mp4";
        });

    for (const filepath of files) {
        const id = parseInt(path.basename(path.dirname(filepath)), 10);
        let prefix = path.basename(path.dirname(path.resolve(filepath, "../")));
        prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

        const size = fs.statSync(filepath).size;

        if (size) {
            await processFile(filepath, queue, id, prefix);
        } else {
            fs.unlinkSync(filepath);
            continue;
        }
    }
})();
