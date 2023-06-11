import fs from "node:fs";
import path from "node:path";

import createQueue from "./src/helpers/create-queue.js";
import generateThumbail from "./src/helpers/generate-thumbnail.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const downloadPath = path.resolve(options.directory, "download");

// Create queue for process items
const queue = createQueue();

// Get adapters IDs
const ids = getAdaptersIds();

if (ids.length) {
    for (const adapater of ids) {
        logMsg(`Start process`, false, adapater);

        const idFolderPath = path.resolve(downloadPath, adapater);

        if (!fs.existsSync(idFolderPath)) {
            continue;
        }

        const items = fs
            .readdirSync(idFolderPath)
            .filter((item) =>
                fs.statSync(path.resolve(idFolderPath, item)).isDirectory()
            );

        for (const item of items) {
            logMsg(`Add for process ${item}`, item, adapater);

            queue.add(
                () =>
                    generateThumbail(
                        path.resolve(idFolderPath, item),
                        adapater,
                        queue
                    ),
                { priority: 1 }
            );
        }
    }
} else {
    logMsg("No adapters defined");
}
