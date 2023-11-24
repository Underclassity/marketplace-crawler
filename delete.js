import fs from "node:fs";
import path from "node:path";

import inquirer from "inquirer";

import {
    getItem,
    deleteItem,
    getItems,
    updateItem,
    dbWrite,
} from "./src/helpers/db.js";
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
                deleteItem(adapter, itemId);
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

    // found db item and set delete param to true
    deleteItem(dbId, id);

    return true;
}

/**
 * Delete tag from items
 *
 * @param   {String}   tag  Tag
 *
 * @return  {Boolean}       Result
 */
async function deleteTag(tag) {
    if (!tag || !tag.length) {
        logMsg("Tag not defined!");
        return false;
    }

    for (const adapter of ids) {
        const items = getItems(adapter, true);

        for (const itemId of items) {
            let { tags } = getItem(adapter, itemId);

            if (!tags.includes(tag)) {
                continue;
            }

            tags = tags.filter((item) => item != tag);

            updateItem(adapter, itemId, { tags }, false);

            logMsg(`Delete tag ${tag} from item`, itemId, adapter);
        }

        dbWrite(`${adapter}-products`, true, adapter, false);
    }

    return true;
}

/**
 * Delete items by brand ID
 *
 * @param   {String}  brandId  Brand ID
 *
 * @return  {Boolean}          Result
 */
async function deleteBrand(brandId) {
    for (const adapter of ids) {
        let items = getItems(adapter, true);

        items = items.map((itemId) => {
            const item = getItem(adapter, itemId);

            if (item.brand == brandId && !item.deleted) {
                deleteItem(adapter, itemId);

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

    if (options.tag) {
        await deleteTag(options.tag);
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
