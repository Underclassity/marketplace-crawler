import path from "node:path";
import fs from "node:fs";

import { getItem, getItems } from "./src/helpers/db.js";

import { logMsg } from "./src/helpers/log-msg.js";
import options from "./src/options.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import readDirStats from "./src/helpers/read-dir-stats.js";

const ids = getAdaptersIds();

(async () => {
    for (const prefix of ids) {
        const items = await getItems(prefix, true);

        const cache = [];

        for (const itemId of items) {
            const itemFolderPath = path.resolve(
                options.directory,
                "download",
                prefix,
                itemId.toString()
            );

            const itemInfo = await getItem(prefix, itemId);

            if (itemInfo.deleted) {
                continue;
            }

            if (!itemInfo.reviews.length) {
                logMsg("No reviews found", itemId, prefix);
                continue;
            }

            if (!fs.existsSync(itemFolderPath)) {
                logMsg("Folder not found", itemId, prefix);
                continue;
            }

            logMsg("Get size", itemId, prefix);

            const { files, size } = readDirStats(itemFolderPath);

            cache.push([itemId, size, itemInfo, files]);

            cache.sort((a, b) => {
                return b[1] - a[1];
            });

            // logMsg(`Size: ${size}`, itemId, prefix);

            const result = [];

            for (const [id, size, info, files] of cache) {
                const obj = { id, size, files };

                if (info?.info) {
                    obj.name = `${info.info.subj_root_name} - ${info.info.subj_name}`;
                }

                result.push(obj);
            }

            fs.writeFileSync(
                path.resolve(options.directory, "db", `${prefix}-size.json`),
                JSON.stringify(result, null, 4)
            );
        }
    }
})();
