import path from "node:path";
import fs from "node:fs";

import { getItem, getItems } from "./src/helpers/db.js";

import { logMsg } from "./src/helpers/log-msg.js";
import options from "./src/options.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import readDir from "./src/helpers/read-dir.js";

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

            const files = readDir(itemFolderPath);

            const size = files.reduce((prev, curr) => {
                prev += fs.statSync(curr).size;
                return prev;
            }, 0);

            cache.push([itemId, size, itemInfo]);

            cache.sort((a, b) => {
                return b[1] - a[1];
            });

            // logMsg(`Size: ${size}`, itemId, prefix);

            const result = [];

            for (const [id, size, info] of cache) {
                const obj = { id, size };

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
