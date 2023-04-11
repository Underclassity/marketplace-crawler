import PQueue from "p-queue";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import fs from "node:fs";
import path from "node:path";

import options from "./src/options.js";

import { getFeedback } from "./src/adapters/wildberries.js";

(async () => {
    // const ebayDirPath = path.resolve("./download/ebay/");

    // const dirs = fs
    //     .readdirSync(ebayDirPath)
    //     .filter((item) =>
    //         fs.statSync(path.resolve(ebayDirPath, item)).isDirectory()
    //     )
    //     .map((item) => path.resolve(ebayDirPath, item));

    // for (const dirPath of dirs) {
    //     const filesCount = fs
    //         .readdirSync(dirPath)
    //         .filter((item) =>
    //             fs.statSync(path.resolve(dirPath, item)).isFile()
    //         ).length;

    //     console.log(dirPath, " -- ", filesCount);

    //     if (!filesCount) {
    //         fs.rmSync(dirPath, { recursive: true });
    //     }
    // }

    const queue = new PQueue({
        concurrency: options.throat,
        timeout: options.timeout,
        autoStart: true,
        carryoverConcurrencyCount: true,
    });

    const wildberriesAdapter = new JSONFileSync(
        path.resolve(path.resolve("./db/"), "wildberries.json")
    );
    const wildberriesDb = new LowSync(wildberriesAdapter);

    wildberriesDb.read();

    for (const itemId in wildberriesDb.data) {
        const item = wildberriesDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const reviewitem = item.reviews[reviewId];
            await getFeedback(itemId, reviewitem, options.query, queue);
        }
    }
})();
