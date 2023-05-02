import path from "node:path";
import fs from "node:fs";

import PQueue from "p-queue";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import options from "./src/options.js";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import sleep from "./src/helpers/sleep.js";
import updateProxies from "./src/helpers/proxy-helpers.js";

// import {
//     getItemsByQuery as getItemsByQueryFromAliexpress,
//     updateItems as updateItemsFromAliexpress,
//     updateReviews as updateReviewsFromAliexpress,
// } from "./src/adapters/aliexpress.js";

// import {
//     getItemsByQuery as getItemsByQueryFromAmazon,
//     updateItems as updateItemsFromAmazon,
//     updateReviews as updateReviewsFromAmazon,
// } from "./src/adapters/amazon.js";

// import {
//     getItemsByQuery as getItemsByQueryFromEbay,
//     updateItems as updateItemsFromEbay,
//     updateReviews as updateReviewsFromEbay,
// } from "./src/adapters/ebay.js";

// import {
//     getItemsByQuery as getItemsByQueryFromOzon,
//     updateItems as updateItemsFromOzon,
//     updateReviews as updateReviewsFromOzon,
// } from "./src/adapters/ozon.js";

// import {
//     getItemsByQuery as getItemsByQueryFromWildberries,
//     updateItems as updateItemsFromWildberries,
//     updateReviews as updateReviewsFromWildberries,
// } from "./src/adapters/wildberries.js";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

(async () => {
    if (options.proxy && options.force) {
        await updateProxies();
    }

    // const tempPath = path.resolve(options.directory, "temp");

    // if (fs.existsSync(tempPath)) {
    //     fs.rmSync(tempPath, { recursive: true });
    // }

    const ids = getAdaptersIds();

    if (!ids.length) {
        console.log("No adapters defined");
        return false;
    }

    console.log(`Process with adapters: ${ids.join(",")}`);

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

    if (options.reviews) {
        console.log("Update items reviews");

        for (const id of ids) {
            const { updateReviews } = await import(`./src/adapters/${id}.js`);

            updateReviews(queue);
        }

        while (queue.size) {
            await sleep(100);
        }

        // updateReviewsFromAliexpress(queue);
        // updateReviewsFromAmazon(queue);
        // updateReviewsFromEbay(queue);
        // updateReviewsFromOzon(queue);
        // updateReviewsFromWildberries(queue);

        return false;
    }

    if (options.update) {
        console.log("Update items");

        for (const id of ids) {
            const { updateItems } = await import(`./src/adapters/${id}.js`);

            updateItems(queue);
        }

        while (queue.size) {
            await sleep(100);
        }

        // updateItemsFromAliexpress(queue);
        // updateItemsFromAmazon(queue);
        // updateItemsFromEbay(queue);
        // updateItemsFromOzon(queue);
        // updateItemsFromWildberries(queue);

        return false;
    }

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

    for (const id of ids) {
        const { getItemsByQuery } = await import(`./src/adapters/${id}.js`);

        getItemsByQuery(queue);
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
    }

    // getItemsByQueryFromAliexpress(options.query, queue);
    // getItemsByQueryFromAmazon(options.query, queue);
    // getItemsByQueryFromEbay(options.query, queue);
    // getItemsByQueryFromOzon(options.query, queue);
    // getItemsByQueryFromWildberries(options.query, queue);

    return true;
})();
