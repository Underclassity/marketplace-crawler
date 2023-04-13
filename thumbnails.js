import fs from "node:fs";
import path from "node:path";

import PQueue from "p-queue";

import options from "./src/options.js";
import generateThumbail from "./src/helpers/generate-thumbnail.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";

const downloadPath = path.resolve(options.directory, "download");

const queue = new PQueue({
    concurrency: options.throat,
    timeout: options.timeout,
    autoStart: true,
    carryoverConcurrencyCount: true,
});

const ids = getAdaptersIds();

if (ids.length) {
    for (const id of ids) {
        // console.log(`[${id}] Start process`);

        const idFolderPath = path.resolve(downloadPath, id);

        const items = fs
            .readdirSync(idFolderPath)
            .filter((item) =>
                fs.statSync(path.resolve(idFolderPath, item)).isDirectory()
            );

        for (const item of items) {
            // console.log(`[${id}] Add for process ${item}`);

            queue.add(
                () =>
                    generateThumbail(
                        path.resolve(idFolderPath, item),
                        id,
                        queue
                    ),
                { priority: 1 }
            );
        }
    }
} else {
    console.log("No adapters defined");
}
