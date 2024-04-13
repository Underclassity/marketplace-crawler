import fs from "node:fs";
import path from "node:path";

import { convertVideoItem } from "./src/helpers/image-process.js";
import { getItems } from "./src/helpers/db.js";
import createQueue from "./src/helpers/create-queue.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";
import priorities from "./src/helpers/priorities.js";
import sleep from "./src/helpers/sleep.js";
import walk from "./src/helpers/walk.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

const queue = createQueue();

(async () => {
    for (const dbId of ids) {
        const dbIds = await getItems(dbId, true);

        for (const itemId of dbIds) {
            const itemFolderPath = path.resolve(
                options.directory,
                "download",
                dbId,
                itemId
            );

            if (!fs.existsSync(itemFolderPath)) {
                continue;
            }

            let files = await walk(itemFolderPath);

            files = files.filter((filepath) => filepath.includes(".mp4"));

            if (!files.length) {
                continue;
            }

            logMsg(`Found ${files.length} video files`, itemId, dbId);

            for (const filepath of files) {
                queue.add(() => convertVideoItem(filepath, itemId, dbId), {
                    priority: priorities.download,
                });
            }
        }
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
    }
})();
