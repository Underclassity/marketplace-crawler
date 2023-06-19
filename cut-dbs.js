import fs from "node:fs";
import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";
import walk from "./src/helpers/walk.js";

import options from "./src/options.js";

const dbPath = path.resolve(options.directory, "db");

for (const dbId of getAdaptersIds()) {
    const mainDB = new LowSync(
        new JSONFileSync(path.resolve(dbPath, `${dbId}.json`))
    );
    mainDB.read();

    const productsDB = new LowSync(
        new JSONFileSync(path.resolve(dbPath, `${dbId}-products.json`))
    );
    const reviewsDB = new LowSync(
        new JSONFileSync(path.resolve(dbPath, `${dbId}-reviews.json`))
    );
    const filesDB = new LowSync(
        new JSONFileSync(path.resolve(dbPath, `${dbId}-files.json`))
    );

    if (!productsDB.data) {
        productsDB.data = {};
        productsDB.write();
    }

    if (!reviewsDB.data) {
        reviewsDB.data = {};
        reviewsDB.write();
    }

    if (!filesDB.data) {
        filesDB.data = {};
        filesDB.write();
    }

    for (const itemId in mainDB.data) {
        logMsg("Process item", itemId, dbId);

        const item = mainDB.data[itemId];

        const reviewsCount =
            "reviews" in item ? Object.keys(item.reviews).length : 0;

        productsDB.data[itemId] = { ...item };
        productsDB.data[itemId].reviews = reviewsCount
            ? Object.keys(item.reviews)
            : [];

        if (reviewsCount) {
            for (const reviewId in item.reviews) {
                const reviewItem = item.reviews[reviewId];

                reviewsDB.data[reviewId] = reviewItem;
            }
        }

        const itemFolderPath = path.resolve(
            options.directory,
            "download",
            dbId,
            itemId
        );

        if (fs.existsSync(itemFolderPath)) {
            filesDB.data[itemId] = await walk(itemFolderPath);
            filesDB.data[itemId] = filesDB.data[itemId]
                .map((filepath) => path.basename(filepath))
                .sort();
        }
    }

    productsDB.write();
    reviewsDB.write();
    filesDB.write();
}
