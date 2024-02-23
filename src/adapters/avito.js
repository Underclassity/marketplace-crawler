import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import {
    addItem,
    addReview,
    dbWrite,
    getBrands,
    getItem,
    getItems,
    getReview,
    getTags,
    updateBrand,
    updateItem,
    updateTags,
    updateTime,
} from "../helpers/db.js";

import { logMsg, logQueue } from "../helpers/log-msg.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import getHeaders from "../helpers/get-headers.js";
import goSettings from "../helpers/go-settings.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

const prefix = "avito";

/**
 * Log helper
 *
 * @param   {String}  msg             Message
 * @param   {String}  [itemId=false]  Item ID
 *
 * @return  {Boolean}                 Result
 */
function log(msg, itemId = false) {
    return logMsg(msg, itemId, prefix);
}

/**
 * Get items from search page by query
 *
 * @param   {Object}  queue             Queue instance
 * @param   {String}  query             Query
 * @param   {Object}  browser           Puppeteer instance
 * @param   {Number}  [pageNumber=1]    Page number
 *
 * @return  {Array}                     Items array
 */
export async function getItemsFromPageByQuery(
    queue,
    query,
    browser,
    pageNumber = 1
) {
    log(`Get items for ${query} on page ${pageNumber}`);

    let result = false;

    await queue.add(
        async () => {
            try {
                const page = await createPage(browser, true);

                await page.goto(
                    `https://www.avito.ru/all?q=${query}&p=${pageNumber}`,
                    goSettings
                );

                result = await page.evaluate(() => {
                    return Array.from(
                        document.querySelectorAll('[data-marker="item"]')
                    ).map((item) => {
                        const link = item
                            .querySelector("a")
                            .getAttribute("href");

                        return {
                            id: item.getAttribute("data-item-id"),
                            link,
                        };
                    });
                });

                await page.close();

                return true;
            } catch (error) {
                log(
                    `Error get items for ${query} on page ${pageNumber}: ${error.message}`
                );

                return false;
            }
        },
        { priority: priorities.item }
    );

    return result;
}

export async function getItemReview(itemId, browser) {
    const item = getItem(prefix, itemId);

    if (item.info) {
        return true;
    }

    log("Try to get item info", itemId);

    try {
        const page = await createPage(browser);

        await page.goto(`https://avito.ru${item.link}`);

        const data = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("[data-marker]"))
                .filter((item) =>
                    item.getAttribute("data-marker").includes("item")
                )
                .map((item) => {
                    return {
                        marker: item.getAttribute("data-marker"),
                        // content: item.textContent,
                        html: item.outerHTML,
                    };
                });
        });

        await page.close();

        console.log(data);

        return true;
    } catch (error) {
        log(`Get item info error: ${error.message}`, itemId);
    }

    return true;
}

/**
 * Update items with tags
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateWithTags(queue) {}

/**
 * Update item by ID
 *
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function updateItemById(itemId, queue) {}

/**
 * Update items helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateItems(queue) {}

/**
 * Update reviews helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateReviews(queue) {}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log(`Get items call for ${query}`);

    const browser = await puppeteer.launch(browserConfig);

    for (let pageNumber = 1; pageNumber <= options.pages; pageNumber++) {
        const data = await getItemsFromPageByQuery(
            queue,
            query,
            browser,
            pageNumber
        );

        if (data?.length) {
            const itemsLength = data.length;

            log(`Found ${itemsLength} items on page ${pageNumber}`);

            // if (!options.force) {
            //     data = data.filter((item) => {
            //         return getItem(prefix, item.id) ? false : true;
            //     });
            // }

            if (data.length) {
                log(
                    `Items after filter on page ${pageNumber}: ${data.length}/${itemsLength}`
                );

                for (const item of data) {
                    addItem(prefix, item.id, {
                        link: item.link,
                    });

                    await getItemReview(item.id, browser);
                }
            } else {
                log(`No items found after filter on page ${pageNumber}`);

                pageNumber = options.pages + 1;
            }
        } else {
            log(`No items found on page ${pageNumber}`);

            pageNumber = options.pages + 1;
        }
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    const pages = await browser.pages();

    await Promise.all(pages.map((page) => page.close()));

    await browser.close();

    return true;
}

export default getItemsByQuery;
