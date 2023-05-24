import fs from "node:fs";
import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

const dbs = {};

for (const id of ids) {
    const dbAdapter = new JSONFileSync(
        path.resolve(path.resolve("./db/"), `${id}.json`)
    );

    dbs[id] = new LowSync(dbAdapter);
    dbs[id].read();
}

(async () => {
    for (const id of ids) {
        logMsg(`Process ${id} folder`, false, id);

        const downloadFolderPath = path.resolve(
            options.directory,
            "download",
            id
        );

        if (!fs.existsSync(downloadFolderPath)) {
            logMsg(`Folder for ${id} adapter not found!`, false, id);
            continue;
        }

        const itemsFolders = fs
            .readdirSync(downloadFolderPath)
            .filter((item) =>
                fs
                    .statSync(path.resolve(downloadFolderPath, item))
                    .isDirectory()
            );

        logMsg(`Found ${itemsFolders.length} items in ${id} folder`, false, id);

        let count = 0;

        for (const itemId of itemsFolders) {
            if (!(itemId in dbs[id].data)) {
                logMsg(`Add new item ${itemId} in ${id} adapter`, false, id);

                count++;

                dbs[id].data[itemId] = {
                    id: itemId,
                    tags: [],
                    reviews: {},
                };
            }
        }

        if (count) {
            dbs[id].write();
        }

        logMsg(`Add ${count} new items in ${id} adapter`, false, id);
    }

    logMsg("End processing add existing items", false, false);
})();
