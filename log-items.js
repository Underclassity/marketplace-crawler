import path from "node:path";
import fs from "node:fs";

import cli from "cli";

import { getItem, getItems } from "./src/helpers/db.js";

// import { logMsg } from "./src/helpers/log-msg.js";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import readDirStats from "./src/helpers/read-dir-stats.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

let counter = 0;

function logProgress(length) {
    counter++;
    cli.progress(counter / length);
}

(async () => {
    for (const prefix of ids) {
        const items = await getItems(prefix, true);

        const cache = [];

        counter = 0;

        for (const itemId of items) {
            const itemFolderPath = path.resolve(
                options.directory,
                "download",
                prefix,
                itemId.toString()
            );

            const itemInfo = await getItem(prefix, itemId);

            if (itemInfo.deleted) {
                logProgress(items.length);
                continue;
            }

            if (!itemInfo.reviews.length) {
                logProgress(items.length);
                // logMsg("No reviews found", itemId, prefix);
                continue;
            }

            if (!fs.existsSync(itemFolderPath)) {
                // logMsg("Folder not found", itemId, prefix);
                logProgress(items.length);
                continue;
            }

            // logMsg("Get size", itemId, prefix);

            const { files, size } = readDirStats(itemFolderPath);

            cache.push([itemId, size, itemInfo, files]);

            logProgress(items.length);
        }

        cache.sort((a, b) => {
            return b[1] - a[1];
        });

        // logMsg(`Size: ${size}`, itemId, prefix);

        const result = [];

        for (const [id, size, info, files] of cache) {
            const obj = { id, size, files };

            if (info?.info) {
                obj.subj_root_name = info.info.subj_root_name;
                obj.subj_name = info.info.subj_name;

                obj.subject_root_id = info.info.data.subject_root_id;
                obj.subject_id = info.info.data.subject_id;
            }

            result.push(obj);
        }

        fs.writeFileSync(
            path.resolve(options.directory, "db", `${prefix}-size.json`),
            JSON.stringify(result, null, 4)
        );
    }
})();
