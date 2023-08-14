import fs from "node:fs";
import path from "node:path";

import inquirer from "inquirer";

import { getItem, deleteItem, getItems } from "./src/helpers/db.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

/**
 * Check and delete items
 *
 * @return  {Boolean}  Result
 */
async function checkDeleted() {
    for (const adapter of ids) {
        const items = getItems(adapter, true, true);

        for (const itemId of items) {
            const item = getItem(adapter, itemId);

            if (item?.deleted) {
                const thumbnailFilePath = path.resolve(
                    options.directory,
                    "thumbnails",
                    adapter,
                    `${itemId}.webp`
                );

                const itemDownloadFolder = path.resolve(
                    options.directory,
                    "download",
                    adapter,
                    itemId
                );

                // delete thumbnail
                if (fs.existsSync(thumbnailFilePath)) {
                    logMsg("Delete thumbnail", itemId, adapter);
                    fs.unlinkSync(thumbnailFilePath);
                }

                // delete item dir if exist
                if (fs.existsSync(itemDownloadFolder)) {
                    logMsg("Delete folder", itemId, adapter);
                    fs.rmSync(itemDownloadFolder, { recursive: true });
                }
            }
        }
    }

    return true;
}

/**
 * Delete item by ID
 *
 * @param   {String}  id   Item ID
 *
 * @return  {Boolean}      Result
 */
async function deleteItemFromDBs(id) {
    logMsg("Try to delete", id, false);

    // convert id to string
    id = id.toString();

    const foundInIds = [];

    for (const dbId in ids) {
        const item = getItem(dbId, id);

        if (item) {
            foundInIds.push(dbId);
            continue;
        }

        const thumbnailFilePath = path.resolve(
            options.directory,
            "thumbnails",
            dbId,
            `${id}.webp`
        );

        const itemDownloadFolder = path.resolve(
            options.directory,
            "download",
            dbId,
            id
        );

        // check for folder exist, but not in db
        if (
            fs.existsSync(thumbnailFilePath) ||
            fs.existsSync(itemDownloadFolder)
        ) {
            foundInIds.push(dbId);
        }
    }

    if (foundInIds.length > 1) {
        logMsg(`Found item ${id} in ${foundInIds.join(",")}`, id, false);
        logMsg("Include or exclude adapters for delete", id, false);

        return false;
    }

    if (!foundInIds.length) {
        logMsg(`Item ${id} not found in databases`, id, false);
        return false;
    }

    const dbId = foundInIds[0];

    const thumbnailFilePath = path.resolve(
        options.directory,
        "thumbnails",
        dbId,
        `${id}.webp`
    );

    const itemDownloadFolder = path.resolve(
        options.directory,
        "download",
        dbId,
        id
    );

    // found db item and set delete param to true
    deleteItem(dbId, id);

    // delete thumbnail
    if (fs.existsSync(thumbnailFilePath)) {
        fs.unlinkSync(thumbnailFilePath);
    }

    // delete item dir if exist
    if (fs.existsSync(itemDownloadFolder)) {
        fs.rmSync(itemDownloadFolder, { recursive: true });
    }

    return true;
}

async function deleteBrand(brandId) {
    for (const adapter of ids) {
        let items = getItems(adapter, true);

        items = items.map((itemId) => {
            const item = getItem(adapter, itemId);

            if (item.brand == brandId && !item.deleted) {
                const thumbnailFilePath = path.resolve(
                    options.directory,
                    "thumbnails",
                    adapter,
                    `${itemId}.webp`
                );

                const itemDownloadFolder = path.resolve(
                    options.directory,
                    "download",
                    adapter,
                    itemId
                );

                // delete thumbnail
                if (fs.existsSync(thumbnailFilePath)) {
                    logMsg("Delete thumbnail", itemId, adapter);
                    fs.unlinkSync(thumbnailFilePath);
                }

                // delete item dir if exist
                if (fs.existsSync(itemDownloadFolder)) {
                    logMsg("Delete folder", itemId, adapter);
                    fs.rmSync(itemDownloadFolder, { recursive: true });
                }

                return true;
            }

            return true;
        });
    }
}

(async () => {
    await checkDeleted();

    if (options.id) {
        await deleteItemFromDBs(options.id);
        return true;
    }

    if (options.brand) {
        await deleteBrand(options.id);
        return true;
    }

    let stoped = false;

    while (!stoped) {
        const answer = await inquirer.prompt([
            {
                type: "string",
                name: "itemId",
                message: "Item ID?",
                default: false,
            },
        ]);

        if (answer.itemId == 0) {
            stoped = true;
        } else {
            await deleteItemFromDBs(answer.itemId);
        }
    }
})();
