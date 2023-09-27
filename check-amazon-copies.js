import path from "node:path";
import fs from "node:fs";

import { getItems } from "./src/helpers/db.js";

import readDir from "./src/helpers/read-dir.js";

const prefix = "amazon";

const amazonFolderPath = path.resolve("download", prefix);

const cache = {};

(async () => {
    const items = getItems(prefix, true);

    const allFiles = [];

    for (const asin of items) {
        const itemFolderPath = path.resolve(amazonFolderPath, asin);

        if (!fs.existsSync(itemFolderPath)) {
            continue;
        }

        const files = readDir(itemFolderPath).map((filepath) =>
            path.basename(filepath)
        );

        cache[asin] = files;

        allFiles.push(...files);
    }

    console.log(allFiles[0]);

    console.log(`Found ${allFiles.length} files`);

    const afterFilterFiles = allFiles.filter(
        (element, index, array) => array.indexOf(element) === index
    );

    console.log(`After filter ${afterFilterFiles.length} files`);

    const equalCache = {};

    if (afterFilterFiles.length != allFiles.length) {
        for (const firstAsin in cache) {
            const firstFiles = cache[firstAsin];

            for (const secondAsin in cache) {
                const cacheId = [firstAsin, secondAsin].sort().join("-");

                if (cacheId in equalCache) {
                    continue;
                }

                const secondFiles = cache[secondAsin];

                secondFiles.forEach((filename) => {
                    if (firstFiles.includes(filename)) {
                        if (cacheId in equalCache) {
                            equalCache[cacheId].push(filename);
                        } else {
                            equalCache[cacheId] = [filename];
                        }
                    }
                });

                if (!(cacheId in equalCache)) {
                    equalCache[cacheId] = [];
                }
            }
        }
    }

    for (const cacheId in equalCache) {
        if (!equalCache[cacheId].length) {
            delete equalCache[cacheId];
        }
    }

    console.log(equalCache);
})();
