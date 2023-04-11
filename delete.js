import fs from "node:fs";
import path from "node:path";

import inquirer from "inquirer";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import options from "./src/options.js";

const downloadPath = path.resolve(options.directory, "download");

const ids = fs
    .readdirSync(downloadPath)
    .filter((item) =>
        fs.statSync(path.resolve(downloadPath, item)).isDirectory()
    );

const dbs = {};

for (const id of ids) {
    const dbAdapter = new JSONFileSync(
        path.resolve(path.resolve("./db/"), "wildberries.json")
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
    console.log(`Try to delete ${id}`);

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
        console.log(`Found item ${id} in ${foundInIds.join(",")}`);
        console.log("Include or exclude adapters for delete");

        return false;
    }

    if (!foundInIds.length) {
        console.log(`Item ${id} not found in databases`);
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
                type: "number",
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
