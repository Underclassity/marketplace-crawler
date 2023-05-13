import fs from "node:fs";
import path from "node:path";

import inquirer from "inquirer";

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

/**
 * Delete item by ID
 *
 * @param   {String}  id   Item ID
 *
 * @return  {Boolean}      Result
 */
async function deleteItem(id) {
    logMsg("Try to delete", id, false);

    // convert id to string
    id = id.toString();

    const foundInIds = [];

    for (const dbId in dbs) {
        const dbIds = Object.keys(dbs[dbId].data);

        if (dbIds.includes(id)) {
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
    if (id in dbs[dbId].data) {
        dbs[dbId].data[id].deleted = true;
        dbs[dbId].write();
    }

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

(async () => {
    if (options.id) {
        await deleteItem(options.id);
        return false;
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
            await deleteItem(answer.itemId);
        }
    }
})();
