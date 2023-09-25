import fs from "node:fs";
import path from "node:path";
import { Url } from "node:url";

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
import { logQueue } from "../helpers/log-msg.js";
import autoScroll from "../helpers/auto-scroll.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import goSettings from "../helpers/go-settings.js";
import logMsg from "../helpers/log-msg.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

const prefix = "tokopedia";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

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
 * Process page with query or brand ID
 *
 * @param   {Number}  pageNumber  Page number
 * @param   {String}  query       Query
 * @param   {Object}  browser     Puppeteer instance
 *
 * @return  {Object}              Results
 */
async function processPage(pageNumber, query = options.query, browser) {
    if (pageNumber == undefined) {
        log("Page ID not defined!");
        return false;
    }

    if (!query || !query.length) {
        log("Query not defined!");
        return false;
    }

    log(`Process page ${pageNumber}`);

    const page = await createPage(browser, true);

    const url = `https://www.tokopedia.com/search?page=${pageNumber}&q=${query}`;

    await page.goto(url, goSettings);

    await sleep(10 * 1000); // wait 10 sec

    await autoScroll(page);

    const links = await page.evaluate(() => {
        return Array.from(
            document.querySelectorAll(
                'div[data-testid="divSRPContentProducts"] a'
            )
        )
            .map((item) => item.href)
            .sort()
            .filter((href) => !href.includes("/promo/"))
            .filter(
                (element, index, array) => array.indexOf(element) === index
            );
    });

    const isNextPage = await page.$('nav[data-unify="Pagination"]');

    await page.close();

    return {
        links,
        next: isNextPage ? true : false,
    };
}

/**
 * Process links from page
 *
 * @param   {Array}   links     Links array
 * @param   {Object}  browser   Puppeteer instance
 * @param   {Object}  queue     Queue instance
 *
 * @return  {Boolean}           Result
 */
async function processLinks(links, browser, queue) {
    if (!Array.isArray(links) || !links.length) {
        log("Links not found");
        return false;
    }

    log(`Process ${links.length} links`);

    for (const link of links) {
        const url = Url.parse(url);
        const itemId = link.replace("https://www.tokopedia.com/", "");

        console.log(url);

        //     let dbItem = getItem(prefix, itemId);

        //     if (!dbItem) {
        //         addItem(prefix, itemId, {
        //             link,
        //         });

        //         dbItem = getItem(prefix, itemId);
        //     }

        //     const time = options.time * 60 * 60 * 1000;

        //     if (
        //         dbItem?.time &&
        //         Date.now() - dbItem.time <= time &&
        //         !options.force
        //     ) {
        //         log(`Already updated by time`, itemId);
        //         continue;
        //     }

        //     if (dbItem.deleted) {
        //         logMsg("Deleted item", itemId);
        //         continue;
        //     }

        //     queue.add(() => scrapeItem(itemId, browser, queue), {
        //         priority: priorities.item,
        //     });
    }

    return true;
}

/**
 * Update items with brands helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateBrands(queue) {}

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
 * Get brand items by brand ID
 *
 * @param   {String}  brandID  Brand ID
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Array}            Brand IDs array
 */
export async function getBrandItemsByID(brandID, queue) {}

/**
 * Get items by brand
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  brand  Brand ID
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByBrand(queue, brand = options.brand) {}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log("Get items call");

    const browser = await puppeteer.launch(browserConfig);

    let count = 0;
    let ended = false;

    for (let page = options.start; page <= options.pages; page++) {
        await queue.add(
            async () => {
                if (ended) {
                    return false;
                }

                const { links, next } = await processPage(page, query, browser);

                log(`Found ${links.length} on page ${page}`);

                count += links.length;

                await processLinks(links, browser, queue);

                if (!next) {
                    page = options.pages + 1;
                    ended = true;
                }
            },
            { priority: priorities.page }
        );
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    log(`Found ${count} items for ${query}`);

    const pages = await browser.pages();

    await Promise.all(pages.map((page) => page.close()));

    await browser.close();

    return true;
}

export default getItemsByQuery;
