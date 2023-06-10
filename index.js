import path from "node:path";
import fs from "node:fs";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import options from "./src/options.js";

import { logQueue, logMsg } from "./src/helpers/log-msg.js";
import createQueue from "./src/helpers/create-queue.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import sleep from "./src/helpers/sleep.js";
import updateProxies from "./src/helpers/proxy-helpers.js";

import { processCookiesAndSession } from "./src/adapters/aliexpress.js";

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

    const tempPath = path.resolve(options.directory, "temp");

    if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { recursive: true });
    }

    const ids = getAdaptersIds();

    if (!ids.length) {
        logMsg("No adapters defined", false, false);
        return false;
    }

    logMsg(`Process with adapters: ${ids.join(",")}`, false, false);

    const queue = createQueue();

    // if (options.id) {
    //     const browser = await puppeteer.launch({
    //         headless: options.headless,
    //         devtools: options.headless ? false : true,
    //     });

    //     logMsg(`Update item ${options.id}`, false, false);

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
        logMsg("Update items reviews", false, false);

        if (ids.includes("aliexpress") && options.cookies) {
            await processCookiesAndSession();
        }

        for (const id of ids) {
            const { updateReviews } = await import(`./src/adapters/${id}.js`);

            if (updateReviews) {
                updateReviews(queue);
            }
        }

        while (queue.size || queue.pending) {
            await sleep(1000);
            logQueue(queue);
        }

        return true;
    }

    if (options.update) {
        logMsg("Update items", false, false);

        if (ids.includes("aliexpress") && options.cookies) {
            await processCookiesAndSession();
        }

        for (const id of ids) {
            const { updateItems } = await import(`./src/adapters/${id}.js`);

            if (updateItems) {
                updateItems(queue);
            }
        }

        while (queue.size || queue.pending) {
            await sleep(1000);
            logQueue(queue);
        }

        return true;
    }

    if (options.brand) {
        logMsg("Get all brand items", false, false);

        if (ids.includes("aliexpress") && options.cookies) {
            await processCookiesAndSession();
        }

        for (const id of ids) {
            const { getItemsByBrand } = await import(`./src/adapters/${id}.js`);

            if (getItemsByBrand) {
                getItemsByBrand(queue);
            }
        }

        while (queue.size || queue.pending) {
            await sleep(1000);
            logQueue(queue);
        }

        return true;
    }

    if (options.brands) {
        logMsg("Update all items with brand", false, false);

        if (ids.includes("aliexpress") && options.cookies) {
            await processCookiesAndSession();
        }

        for (const id of ids) {
            const { updateBrands } = await import(`./src/adapters/${id}.js`);

            if (updateBrands) {
                updateBrands(queue);
            }
        }

        while (queue.size || queue.pending) {
            await sleep(1000);
            logQueue(queue);
        }

        return true;
    }

    if (options.tags) {
        logMsg("Update all items with tags", false, false);

        if (ids.includes("aliexpress") && options.cookies) {
            await processCookiesAndSession();
        }

        for (const id of ids) {
            const { updateWithTags } = await import(`./src/adapters/${id}.js`);

            if (updateWithTags) {
                updateWithTags(queue);
            }
        }

        while (queue.size || queue.pending) {
            await sleep(1000);
            logQueue(queue);
        }

        return true;
    }

    if (!options.query) {
        logMsg("Query not defined!", false, false);

        return false;
    }

    logMsg(`Get items for query: ${options.query}`, false, false);

    // queue.on("completed", () => {
    //     logMsg("Completed", false, false);
    // });

    // queue.on("idle", () => {
    //     logMsg(
    //         `Queue is idle.  Size: ${queue.size}  Pending: ${queue.pending}`,
    //         false,
    //         false
    //     );
    // });

    // queue.on("add", () => {
    //     logMsg(
    //         `Task is added.  Size: ${queue.size}  Pending: ${queue.pending}`,
    //         false,
    //         false
    //     );
    // });

    // queue.on("next", () => {
    //     logMsg(
    //         `Task is completed.  Size: ${queue.size}  Pending: ${queue.pending}`,
    //         false,
    //         false
    //     );
    // });

    for (const id of ids) {
        const { getItemsByQuery } = await import(`./src/adapters/${id}.js`);

        if (getItemsByQuery) {
            getItemsByQuery(queue);
        }
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
})();
