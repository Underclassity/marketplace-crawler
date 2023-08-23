import path from "node:path";

import axios from "axios";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import {
    addItem,
    addReview,
    dbWrite,
    getItem,
    getItems,
    getReview,
    getTags,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import { logQueue } from "../helpers/log-msg.js";
import autoScroll from "../helpers/auto-scroll.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import getHeaders from "../helpers/get-headers.js";
import goSettings from "../helpers/go-settings.js";
import logMsg from "../helpers/log-msg.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

const prefix = "trendyol";

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
 * @param   {String}  query       Query
 * @param   {Object}  browser     Puppeteer instance
 *
 * @return  {Object}              Results
 */
async function processPage(query = options.query, browser) {
    if (!query || !query.length) {
        log("Query not defined!");
        return false;
    }

    log(`Process page for query ${query}`);

    const page = await createPage(browser, false);

    const url = `https://www.trendyol.com/en/sr?q=${query}`;

    await page.goto(url, goSettings);

    await sleep(10 * 1000); // wait 10 sec

    try {
        await autoScroll(page, 250);
    } catch (error) {
        log(`Process page for query auto scroll error: ${error}`);
    }

    const links = await page.evaluate(() => {
        return Array.from(
            document.querySelectorAll('div[data-testid="product-card"]')
        ).map((item) => {
            return {
                href: item.querySelector("a").href,
                id: item.getAttribute("data-contentid"),
            };
        });
    });

    await page.close();

    return links;
}

/**
 * Process review item
 *
 * @param   {Number}  itemId    Item ID
 * @param   {Number}  reviewId  Review ID
 * @param   {Object}  queue     Queue instance
 *
 * @return  {Boolean}           Result
 */
function processReview(itemId, reviewId, queue) {
    if (!itemId || !itemId.length) {
        log("Item ID not defined!");
        return false;
    }

    if (!reviewId) {
        log("Review ID not defined!");
        return false;
    }

    const reviewItem = getReview(prefix, itemId, reviewId);

    if (!reviewItem) {
        log(`Review ${reviewId} not found in DB!`, itemId);
        return false;
    }

    const { mediaFile } = reviewItem;
    const { mediaType, url } = mediaFile;

    const filepath = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId,
        path.basename(url)
    );

    downloadItem(url, filepath, queue, mediaType != "IMAGE");

    return true;
}

/**
 * Get item reviews
 *
 * @param   {Number}  itemId      Item ID
 * @param   {Number}  pageNumber  Reviews page number
 *
 * @return  {Object}              Results
 */
async function getItemReviews(itemId, pageNumber = 0) {
    const result = { totalPages: 0, totalElements: 0, images: [] };

    // let getData = false;

    // await queue.add(
    //     async () => {
    try {
        log(`Get page ${pageNumber} reviews`, itemId);

        const pageRequest = await axios(
            `https://public-mdc.trendyol.com/discovery-sfint-social-service/api/review/reviews/${itemId}/images?page=${pageNumber}&pageSize=20`,
            {
                method: "GET",
                headers: {
                    ...getHeaders(),
                    Cookie: "platform=web; storefrontId=26; language=en; countryCode=NL; functionalConsent=false; performanceConsent=false; targetingConsent=false; navbarGenderId=1; iapd=1;",
                },
                timeout: options.timeout,
            }
        );

        const { totalPages, totalElements, images } = pageRequest.data;

        result.totalPages = totalPages;
        result.totalElements = totalElements;
        result.images = images;
    } catch (error) {
        log(`Get page ${pageNumber} reviews error: ${error.message}`, itemId);
    }

    //         getData = true;

    //         return { totalPages: 0, totalElements: 0, images: [] };
    //     },
    //     { priority: priorities.review }
    // );

    // while (!getData) {
    //     await sleep(100);
    // }

    return result;
}

/**
 * Scrapte item by item ID
 *
 * @param   {String}  itemId   Item ID
 * @param   {Object}  browser  Puppeteer instance
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Boolean}          Result
 */
async function scrapeItem(itemId, queue) {
    if (!itemId || !itemId.length) {
        log("Item ID not defined!");
        return false;
    }

    log("Try to update", itemId);

    let results = [];
    let totalCount = 0;

    const { totalPages, totalElements, images } = await getItemReviews(
        itemId,
        0,
        queue
    );

    totalCount = totalElements;

    results.push(...images);

    if (totalPages > 1) {
        for (let page = 1; page <= totalPages; page++) {
            const { images } = await getItemReviews(itemId, page, queue);

            results.push(...images);
        }
    }

    // await queue.add(
    //     async () => {
    //         try {
    //             const request = await axios(
    //                 `https://public-mdc.trendyol.com/discovery-sfint-social-service/api/review/reviews/${itemId}/images?page=0&pageSize=20`,
    //                 {
    //                     method: "GET",
    //                     headers: {
    //                         ...getHeaders(),
    //                         Cookie: "platform=web; storefrontId=26; language=en; countryCode=NL; functionalConsent=false; performanceConsent=false; targetingConsent=false; navbarGenderId=1; iapd=1;",
    //                     },
    //                     timeout: options.timeout,
    //                 }
    //             );

    //             const { totalPages, totalElements, images } = request.data;

    //             totalCount = totalElements;

    //             results.push(...images);

    //             if (totalPages > 1) {
    //                 for (let page = 1; page <= totalPages; page++) {
    //                     await queue.add(
    //                         async () => {
    //                             try {
    //                                 log(`Get page ${page} reviews`, itemId);

    //                                 const pageRequest = await axios(
    //                                     `https://public-mdc.trendyol.com/discovery-sfint-social-service/api/review/reviews/${itemId}/images?page=${page}&pageSize=20`,
    //                                     {
    //                                         method: "GET",
    //                                         headers: {
    //                                             ...getHeaders(),
    //                                             Cookie: "platform=web; storefrontId=26; language=en; countryCode=NL; functionalConsent=false; performanceConsent=false; targetingConsent=false; navbarGenderId=1; iapd=1;",
    //                                         },
    //                                         timeout: options.timeout,
    //                                     }
    //                                 );

    //                                 const { images } = pageRequest.data;

    //                                 results.push(...images);
    //                             } catch (error) {
    //                                 log(
    //                                     `Get page ${page} reviews error: ${error.message}`,
    //                                     itemId
    //                                 );
    //                             }
    //                         },
    //                         { priority: priorities.review }
    //                     );
    //                 }
    //             }
    //         } catch (error) {
    //             log(`Get item info error: ${error.message}`, itemId);
    //         }
    //     },
    //     { priority: priorities.review }
    // );

    results = results
        .sort((a, b) => a.reviewId - b.reviewId)
        .filter((element, index, array) => array.indexOf(element) === index);

    // const reviewsIds = results
    //     .map((item) => item.reviewId)
    //     .filter((element, index, array) => array.indexOf(element) === index);

    // if (
    //     results.length &&
    //     reviewsIds.length &&
    //     reviewsIds.length != results.length
    // ) {
    //     throw Error(
    //         `Item reviews count ${results.length} dont equal to reviews IDs count ${reviewsIds.length}`
    //     );
    // }

    log(`Get ${results.length}(${totalCount}) reviews`);

    for (const result of results) {
        addReview(prefix, itemId, result.id, result, false);
    }

    dbWrite(`${prefix}-reviews`, true, prefix, false);

    updateTime(prefix, itemId);
    updateTags(prefix, itemId, options.query);

    for (const result of results) {
        processReview(itemId, result.id, queue);
    }

    return true;
}

/**
 * Process links from page
 *
 * @param   {Array}   links     Links array
 * @param   {Object}  queue     Queue instance
 *
 * @return  {Boolean}           Result
 */
async function processLinks(links, queue) {
    if (!Array.isArray(links) || !links.length) {
        log("Links not found");
        return false;
    }

    log(`Process ${links.length} links`);

    for (const link of links) {
        const dbItem = getItem(prefix, link.id);

        if (!dbItem) {
            addItem(prefix, link.id, {
                link: link.href,
            });
        }

        const time = options.time * 60 * 60 * 1000;

        if (
            dbItem?.time &&
            Date.now() - dbItem.time <= time &&
            !options.force
        ) {
            log(`Already updated by time`, link.id);
            continue;
        }

        if (dbItem.deleted) {
            logMsg("Deleted item", link.id);
            continue;
        }

        queue.add(() => scrapeItem(link.id, queue), {
            priority: priorities.item,
        });
    }

    // Wait 5 sec for DB write
    await sleep(5000);

    return true;
}

/**
 * Update items with tags
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateWithTags(queue) {
    const tags = await getTags(prefix);

    for (const tag of tags) {
        await getItemsByQuery(queue, tag);
    }

    return true;
}

/**
 * Update item by ID
 *
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function updateItemById(itemId, queue) {
    if (!itemId || !itemId.length) {
        log("Item ID not defined!");
        return false;
    }

    scrapeItem(itemId, queue);

    return true;
}

/**
 * Update items helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    const browser = await puppeteer.launch(browserConfig);

    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) =>
        queue.add(() => scrapeItem(itemId, queue), {
            priority: priorities.item,
        })
    );

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    log("End items update");

    await browser.close();

    return true;
}

/**
 * Update reviews helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateReviews(queue) {
    const items = getItems(prefix, true);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item?.reviews?.length) {
            return false;
        }

        for (const reviewId of item.reviews) {
            processReview(itemId, reviewId, queue);
        }
    });

    return true;
}

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

    const links = await processPage(query, browser);

    const pages = await browser.pages();

    await Promise.all(pages.map((page) => page.close()));

    await browser.close();

    log(`Found ${links.length} items`);

    await processLinks(links, queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

export default getItemsByQuery;
