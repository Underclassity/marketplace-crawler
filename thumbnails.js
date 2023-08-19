import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { logQueue } from "./src/helpers/log-msg.js";
import createQueue from "./src/helpers/create-queue.js";
import generateThumbail from "./src/helpers/generate-thumbnail.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";
import sleep from "./src/helpers/sleep.js";

import options from "./src/options.js";

const downloadPath = path.resolve(options.directory, "download");

// Create queue for process items
const queue = createQueue();

// Get adapters IDs
const ids = getAdaptersIds();

if (!ids.length) {
    logMsg("No adapters defined");

    process.exit();
}

async function processAdapter(adapter) {
    logMsg(`Start process`, false, adapter);

    const idFolderPath = path.resolve(downloadPath, adapter);

    if (!fs.existsSync(idFolderPath)) {
        return false;
    }

    const items = fs
        .readdirSync(idFolderPath)
        .filter((item) =>
            fs.statSync(path.resolve(idFolderPath, item)).isDirectory()
        );

    for (const item of items) {
        logMsg(`Add for process ${item}`, item, adapter);

        queue.add(
            () =>
                generateThumbail(
                    path.resolve(idFolderPath, item),
                    adapter,
                    queue
                ),
            { priority: 1 }
        );
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

for (const adapter of ids) {
    await processAdapter(adapter);
}
