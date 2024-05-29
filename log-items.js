import path from "node:path";
import fs from "node:fs";

import cli from "cli";

import { getItemsData } from "./src/helpers/db.js";

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
        const items = await getItemsData(prefix);

        const cache = [];

        counter = 0;

        for (const { id: itemId, value: itemInfo } of items) {
            const itemFolderPath = path.resolve(
                options.directory,
                "download",
                prefix,
                itemId.toString()
            );

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

        const result = { root_categories: {}, categories: {}, items: [] };

        for (const [id, size, info, files] of cache) {
            const obj = { id, size, files };

            if (info?.info) {
                obj.subj_root_name = info.info.subj_root_name;
                obj.subj_name = info.info.subj_name;

                obj.subject_root_id = info.info.data.subject_root_id;
                obj.subject_id = info.info.data.subject_id;

                if (result.root_categories[obj.subject_root_id]) {
                    result.root_categories[obj.subject_root_id].count++;
                    result.root_categories[obj.subject_root_id].size += size;
                } else {
                    result.root_categories[obj.subject_root_id] = {
                        count: 1,
                        name: obj.subj_root_name,
                        size: +size,
                    };
                }

                if (result.categories[obj.subject_id]) {
                    result.categories[obj.subject_id].count++;
                    result.categories[obj.subject_id].size += size;
                } else {
                    result.categories[obj.subject_id] = {
                        count: 1,
                        name: obj.subj_name,
                        size: +size,
                    };
                }
            }

            result.items.push(obj);
        }

        const infoResults = [];
        const infoRootResults = [];

        for (const id in result.categories) {
            const item = result.categories[id];
            item.id = id;
            infoResults.push(item);
        }

        for (const id in result.root_categories) {
            const item = result.root_categories[id];
            item.id = id;
            infoRootResults.push(item);
        }

        infoResults.sort((a, b) => b.size - a.size);
        infoRootResults.sort((a, b) => b.size - a.size);

        result.categories = infoResults;
        result.root_categories = infoRootResults;

        fs.writeFileSync(
            path.resolve(options.directory, "db", `${prefix}-size.json`),
            JSON.stringify(result, null, 4)
        );
    }
})();
