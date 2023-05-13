import path from "node:path";

import inquirer from "inquirer";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

if (ids.length > 1) {
    logMsg("Define 1 adapter to add item", false, false);
    process.exit();
}

const dbAdapter = new JSONFileSync(
    path.resolve(path.resolve("./db/"), `${ids[0]}.json`)
);

const db = new LowSync(dbAdapter);

/**
 * Delete item by ID
 *
 * @param   {String}  id   Item ID
 *
 * @return  {Boolean}      Result
 */
async function addItem(id) {
    // convert id to string
    id = id.toString();

    if (id in db.data) {
        logMsg(`Item ${id} already in DB`, id, false);
    } else {
        logMsg(`Add new item ${id} to ${ids[0]}`, id, false);

        db.data[id] = {
            reviews: {},
        };
    }

    return true;
}

(async () => {
    if (options.id) {
        await addItem(options.id);
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
            await addItem(answer.itemId);
        }
    }
})();
