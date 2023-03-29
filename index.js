import PQueue from "p-queue";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import options from "./src/options.js";

// import { getItemsByQuery as getItemsByQueryFromWildberries } from "./src/adapters/wildberries.js";
import { getItemsByQuery as getItemsByQueryFromAliexpress } from "./src/adapters/aliexpress.js";
// import { getItemsByQuery as getItemsByQueryFromEbay } from "./src/adapters/ebay.js";
// import {
//     getItemsByQuery as getItemsByQueryFromOzon,
//     getOzonItem,
// } from "./src/adapters/ozon.js";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

(async () => {
    const queue = new PQueue({
        concurrency: options.throat,
        timeout: options.timeout,
        autoStart: true,
        carryoverConcurrencyCount: true,
    });

    // if (options.id) {
    //     const browser = await puppeteer.launch({
    //         headless: options.headless,
    //         devtools: options.headless ? false : true,
    //     });

    //     console.log(`Update item ${options.id}`);

    //     queue.add(
    //         () =>
    //             getOzonItem(
    //                 null,
    //                 options.id,
    //                 options.query || "ID",
    //                 queue,
    //                 browser
    //             ),
    //         {
    //             priority: 9,
    //         }
    //     );

    //     return true;
    // }

    if (!options.query) {
        console.log("Query not defined!");
        return false;
    }

    console.log(`Get items for query: ${options.query}`);

    // queue.on("completed", () => {
    //     console.log("Completed");
    //     // console.log(result);
    // });

    // queue.on("idle", () => {
    //     console.log(
    //         `Queue is idle.  Size: ${queue.size}  Pending: ${queue.pending}`
    //     );
    // });

    // queue.on("add", () => {
    //     console.log(
    //         `Task is added.  Size: ${queue.size}  Pending: ${queue.pending}`
    //     );
    // });

    // queue.on("next", () => {
    //     console.log(
    //         `Task is completed.  Size: ${queue.size}  Pending: ${queue.pending}`
    //     );
    // });

    // getItemsByQueryFromWildberries(options.query, queue);
    getItemsByQueryFromAliexpress(options.query, queue);
    // getItemsByQueryFromEbay(options.query, queue);
    // getItemsByQueryFromOzon(options.query, queue);

    return true;
})();
