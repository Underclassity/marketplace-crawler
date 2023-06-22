import fs from "node:fs";
import path from "node:path";

import { logQueue, logMsg } from "./src/helpers/log-msg.js";
import { processFile } from "./src/helpers/image-process.js";
import createQueue from "./src/helpers/create-queue.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import sleep from "./src/helpers/sleep.js";
import walk from "./src/helpers/walk.js";

import options from "./src/options.js";

const queue = createQueue();

(async () => {
    const ids = getAdaptersIds();

    logMsg(`Process convert for adapter: ${ids.join(", ")}`);

    for (const adapter of ids) {
        logMsg("Start process images", false, adapter);

        const adapterFolderPath = path.resolve(
            options.directory,
            "download",
            adapter
        );

        if (!fs.existsSync(adapterFolderPath)) {
            continue;
        }

        let files = await walk(adapterFolderPath);

        // filter only jpeg or jpg
        files = files.filter((item) => {
            return (
                path.extname(item) == ".jpeg" || path.extname(item) == ".jpg"
            );
        });

        for (const filepath of files) {
            const id = parseInt(path.basename(path.dirname(filepath)), 10);

            let prefix = path.basename(
                path.dirname(path.resolve(filepath, "../"))
            );

            prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

            const size = fs.statSync(filepath).size;

            if (size) {
                processFile(filepath, queue, id, prefix);
            } else {
                fs.unlinkSync(filepath);
                continue;
            }
        }
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    logMsg("End convert images");
})();
