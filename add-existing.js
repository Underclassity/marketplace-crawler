import fs from "node:fs";
import path from "node:path";

import { addItem, getItem } from "./src/helpers/db.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const adapters = getAdaptersIds();

(async () => {
    for (const adapter of adapters) {
        logMsg(`Process adapter ${adapter} folder`, false, adapter);

        const downloadFolderPath = path.resolve(
            options.directory,
            "download",
            adapter
        );

        if (!fs.existsSync(downloadFolderPath)) {
            logMsg(`Folder for ${adapter} adapter not found!`, false, adapter);
            continue;
        }

        const itemsFolders = fs
            .readdirSync(downloadFolderPath)
            .filter((item) =>
                fs
                    .statSync(path.resolve(downloadFolderPath, item))
                    .isDirectory()
            );

        logMsg(
            `Found ${itemsFolders.length} items in ${adapter} folder`,
            false,
            adapter
        );

        let count = 0;

        for (const itemId of itemsFolders) {
            if (!getItem(adapter, itemId)) {
                logMsg(
                    `Add new item ${itemId} in ${adapter} adapter`,
                    false,
                    adapter
                );

                addItem(adapter, itemId);

                count++;
            }
        }

        logMsg(`Add ${count} new items in ${adapter} adapter`, false, adapter);
    }

    logMsg("End processing add existing items");
})();
