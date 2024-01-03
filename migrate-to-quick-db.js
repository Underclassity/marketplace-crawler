import path from "node:path";
import fs from "node:fs";

import json from "big-json";

import { QuickDB } from "quick.db";

import logMsg from "./src/helpers/log-msg.js";
import sleep from "./src/helpers/sleep.js";

const dbPath = path.resolve("./db");

const files = fs
    .readdirSync(dbPath)
    .filter((filename) => filename.includes(".json"))
    .filter((item) => !item.includes("proxy"));

(async () => {
    for (const filename of files) {
        const id = filename.replace(".json", "");

        logMsg(`Start read`, id);

        const filepath = path.resolve(dbPath, filename);

        const readStream = fs.createReadStream(filepath);
        const parseStream = json.createParseStream();

        const db = new QuickDB({ filePath: `db/${id}.db` });

        let isEnd = false;

        parseStream.on("data", async (data) => {
            for (const reviewId in data) {
                const review = data[reviewId];

                if (await db.get(reviewId)) {
                    // logMsg(`Already saved: ${reviewId}`, id);
                } else {
                    // logMsg(`Add new: ${reviewId}`, id);
                    await db.set(reviewId, review);
                }
            }
        });

        parseStream.on("end", () => {
            isEnd = true;
        });

        readStream.pipe(parseStream);

        while (!isEnd) {
            await sleep(100);
        }
    }

    // for (const id of ids) {
    //     const db = new QuickDB({ filePath: `db/${id}.db` });
    //     const dbData = loadDB(`${id}-reviews`);
    //     console.log(dbData.data);
    //     // for (const itemId of items) {
    //     //     const item = getItem(id, itemId);
    //     //     if (await db.get(itemId)) {
    //     //         logMsg("Item already in DB", itemId, id);
    //     //     } else {
    //     //         logMsg("Add item to DB", itemId, id);
    //     //         await db.set(itemId, item);
    //     //     }
    //     // }
    // }
})();
