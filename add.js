import process from "node:process";

import inquirer from "inquirer";

import { addItem } from "./src/helpers/db.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

if (ids.length > 1) {
    logMsg("Define 1 adapter to add item");
    process.exit();
}

const adapter = ids[0];

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
            await addItem(adapter, answer.itemId);
        }
    }
})();
