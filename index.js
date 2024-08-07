import fs from "node:fs";
import path from "node:path";

import makeEta from "simple-eta";

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
    }),
);

puppeteer.use(StealthPlugin());

/**
 * Log queue helper
 *
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
async function whileLog(queue) {
    if (!queue) {
        return false;
    }

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

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
        logMsg("No adapters defined");
        return false;
    }

    logMsg(`Process with adapters: ${ids.join(",")}`);

    const queue = createQueue();
    queue.min = 0;
    queue.max = 0;
    queue.eta = makeEta({ min: 0, max: 0 });

    // queue.on("completed", () => {
    //     logMsg("Completed");
    // });

    // queue.on("idle", () => {
    //     logMsg(
    //         `Queue is idle.  Size: ${queue.size}  Pending: ${queue.pending}`,
    //         false,
    //         false
    //     );
    // });

    queue.on("add", () => {
        // logMsg(
        //     `Task is added.  Size: ${queue.size}  Pending: ${queue.pending}`,
        //     false,
        //     false
        // );

        queue.max++;

        queue.eta = makeEta({ min: 0, max: queue.max });
        queue.eta.report(queue.min);
    });

    queue.on("next", () => {
        // logMsg(
        //     `Task is completed.  Size: ${queue.size}  Pending: ${queue.pending}`,
        //     false,
        //     false
        // );

        queue.min++;
        queue.eta.report(queue.min);
    });

    if (ids.includes("aliexpress") && options.cookies) {
        await processCookiesAndSession();
    }

    if (options.id) {
        logMsg(`Update item ${options.id}`);

        for (const id of ids) {
            const { getItemByID } = await import(`./src/adapters/${id}.js`);

            if (getItemByID) {
                getItemByID(options.id, queue);
            } else {
                logMsg("Update item by ID not found!", false, id);
            }
        }
    }

    if (options.reviews) {
        logMsg("Update items reviews");

        for (const id of ids) {
            const { updateReviews } = await import(`./src/adapters/${id}.js`);

            if (updateReviews) {
                updateReviews(queue);
            } else {
                logMsg("Update reviews not found!", false, id);
            }
        }
    }

    if (options.update) {
        logMsg("Update items");

        for (const id of ids) {
            const { updateItems } = await import(`./src/adapters/${id}.js`);

            if (updateItems) {
                updateItems(queue);
            } else {
                logMsg("Update items not found!", false, id);
            }
        }
    }

    if (options.info) {
        logMsg("Get info for all items");

        for (const id of ids) {
            const { updateInfo } = await import(`./src/adapters/${id}.js`);

            if (updateInfo) {
                updateInfo(queue);
            } else {
                logMsg("Get items by brand not found!", false, id);
            }
        }
    }

    if (options.brand) {
        logMsg("Get all brand items");

        for (const id of ids) {
            const { getItemsByBrand } = await import(`./src/adapters/${id}.js`);

            if (getItemsByBrand) {
                getItemsByBrand(queue);
            } else {
                logMsg("Get items by brand not found!", false, id);
            }
        }
    }

    if (options.brands) {
        logMsg("Update all items with brand");

        for (const id of ids) {
            const { updateBrands } = await import(`./src/adapters/${id}.js`);

            if (updateBrands) {
                updateBrands(queue);
            } else {
                logMsg("Update with brands not found!", false, id);
            }
        }
    }

    if (options.category) {
        logMsg(`Update items by category ${options.category}`);

        for (const id of ids) {
            const { updateItemsByCategory } = await import(
                `./src/adapters/${id}.js`
            );

            if (updateItemsByCategory) {
                updateItemsByCategory(options.category, queue);
            } else {
                logMsg("Update category not found!", false, id);
            }
        }
    }

    if (options.tags) {
        logMsg("Update all items with tags");

        for (const id of ids) {
            const { updateWithTags } = await import(`./src/adapters/${id}.js`);

            if (updateWithTags) {
                updateWithTags(queue);
            } else {
                logMsg("Update with tags not found!", false, id);
            }
        }
    }

    if (options.stats) {
        for (const id of ids) {
            const { updateItemsStats } = await import(
                `./src/adapters/${id}.js`
            );

            if (updateItemsStats) {
                updateItemsStats(queue);
            } else {
                logMsg("Log stats not found!", false, id);
            }
        }
    }

    if (options.check) {
        for (const id of ids) {
            const { checkReviews } = await import(`./src/adapters/${id}.js`);

            if (checkReviews) {
                checkReviews(queue);
            } else {
                logMsg("Check reviews not found!", false, id);
            }
        }
    }

    if (options.query) {
        logMsg(`Get items for query: ${options.query}`);

        for (const id of ids) {
            const { getItemsByQuery } = await import(`./src/adapters/${id}.js`);

            if (getItemsByQuery) {
                getItemsByQuery(queue);
            }
        }
    }

    await whileLog(queue);

    return true;
})();
