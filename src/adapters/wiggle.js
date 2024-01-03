import path from "node:path";

import is from "is_js";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import {
    addItem,
    addReview,
    getBrands,
    getItem,
    getItems,
    getReview,
    getTags,
    updateItem,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import { logMsg, logQueue } from "../helpers/log-msg.js";
import autoScroll from "../helpers/auto-scroll.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import goSettings from "../helpers/go-settings.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

const prefix = "wiggle";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

/**
 * Log message helper
 *
 * @param   {String}  msg      Message
 * @param   {String}  itemI    Item ID
 *
 * @return  {Boolean}          Result
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
 * @param   {String}  brandID     Brand ID
 *
 * @return  {Object}              Results
 */
async function processPage(
    pageNumber,
    query = options.query,
    browser,
    brandID
) {
    if (pageNumber == undefined) {
        log("Page ID not defined!");
        return false;
    }

    if ((!query || !query.length) && !brandID) {
        log("Query not defined!");
        return false;
    }

    log(`Process page ${pageNumber}`);

    const page = await createPage(browser, true);

    const url = brandID
        ? `https://www.wiggle.com/b/${brandID}&page=${pageNumber}`
        : `https://www.wiggle.com/search?query=${query}&page=${pageNumber}`;

    await page.goto(url, goSettings);

    await sleep(10 * 1000); // wait 10 sec

    await autoScroll(page);

    const links = await page.evaluate(() => {
        return Array.from(
            document.querySelectorAll('li[data-testid="ProductCard"] a')
        )
            .map((item) => item.href)
            .sort()
            .filter(
                (element, index, array) => array.indexOf(element) === index
            );
    });

    const isNextPage = await page.$('a[data-testid="pagination-next"]');

    await page.close();

    return {
        links,
        next: isNextPage ? true : false,
    };
}

/**
 * Process review data
 *
 * @param   {Object}  review  Review data
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
async function processReview(review, itemId, queue) {
    if (review.Photos && Array.isArray(review.Photos) && review.Photos.length) {
        log(`Try to download ${review.Photos.length} photos`, itemId);

        for (const photo of review.Photos) {
            const url = photo.Sizes.large.Url;
            const filepath = path.resolve(
                options.directory,
                "download",
                prefix,
                itemId,
                `${photo.Id}.jpeg`
            );

            downloadItem(url, filepath, queue);
        }
    }

    return true;
}

/**
 * Add review
 *
 * @param   {Object}  review  Review data
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
async function addReviewItem(review, itemId, queue) {
    if (!is.object(review)) {
        log("Input data is not an object", itemId);
        return false;
    }

    const { Id } = review;

    const dbReviewItem = await getReview(prefix, itemId, Id);

    if (dbReviewItem) {
        log(`Review ${Id} already saved in DB`, itemId);
    } else {
        await addReview(prefix, itemId, Id, review, true);
        log(`Add review ${Id}`, itemId);
    }

    processReview(review, itemId, queue);

    return true;
}

/**
 * Update summary data
 *
 * @param   {Object}  data    Input data
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
async function updateSummary(data, itemId) {
    if (!("reviewSummary" in data) || !("questionSummary" in data)) {
        log("Summary data not found in input data", itemId);
        return false;
    }

    log("Update summary", itemId);

    updateItem(prefix, itemId, {
        ...data,
    });

    return true;
}

/**
 * Update item statistics
 *
 * @param   {Object}  data    Input data
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
async function updateStatistics(data, itemId) {
    log("Update statistics", itemId);

    const { Results } = data;

    if (!Results || !Results[0]) {
        return false;
    }

    const { ProductStatistics } = Results[0];

    if (!ProductStatistics) {
        return false;
    }

    updateItem(prefix, itemId, {
        ...ProductStatistics,
    });

    return true;
}

/**
 * Update product info
 *
 * @param   {Object}  data    Input data
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
async function updateProductInfo(data, itemId, queue) {
    log("Update product info", itemId);

    const dbItem = getItem(prefix, itemId);

    const { BatchedResultsOrder, HasErrors, BatchedResults, Results } = data;

    if (HasErrors) {
        return false;
    }

    if (BatchedResultsOrder) {
        for (const order of BatchedResultsOrder) {
            const batchData = BatchedResults[order].Results;

            for (const item of batchData) {
                if (item.Id && item.Id == "wiggle-gift-voucher-gbp") {
                    continue;
                }

                if (item.Id && item.CID) {
                    addReviewItem(item, itemId, queue);
                } else if (item.Description && item.Name) {
                    updateItem(
                        prefix,
                        itemId,
                        {
                            info: item,
                            brand: item.Brand.Name,
                        },
                        true
                    );
                } else if (item.Results) {
                    updateStatistics(item, itemId);
                } else {
                    console.log(item);
                }
            }
        }
    }

    if (Results && !dbItem.info) {
        addItem(prefix, itemId, {
            info: Results[0],
        });
    }

    return true;
}

/**
 * Get reviews from input data
 *
 * @param   {Object}  data    Input data
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
async function updateReviewsInfo(data, itemId, queue) {
    log("Update reviews", itemId);

    const {
        BatchedResultsOrder,
        HasErrors,
        BatchedResults,
        // TotalRequests
    } = data;

    if (HasErrors) {
        return false;
    }

    for (const order of BatchedResultsOrder) {
        const {
            Results,
            HasErrors,
            // TotalResults
        } = BatchedResults[order];

        if (HasErrors) {
            continue;
        }

        for (const item of Results) {
            if (item.Id && item.Id == "wiggle-gift-voucher-gbp") {
                continue;
            }

            addReviewItem(item, itemId, queue);
        }
    }

    return true;
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
async function scrapeItem(itemId, browser, queue) {
    if (!itemId || !itemId.length) {
        log("Item ID not defined!");
        return false;
    }

    const dbItem = getItem(prefix, itemId);

    const { link } = dbItem;

    logMsg("Start item process", itemId);

    const page = await createPage(browser, true);
    await page.setRequestInterception(true);

    await page.goto(link, goSettings);

    page.on("response", async (response) => {
        const url = response.url();
        // const method = response.request().method();

        if (!url.includes("api.bazaarvoice.com")) {
            return false;
        }

        // log(`[${method}] ${url}`);

        let text;

        try {
            text = await response.text();
        } catch (error) {
            log(error.message, itemId);
            return false;
        }

        if (text.includes("BV._internal.dataHandler0(")) {
            text = text.replace("BV._internal.dataHandler0(", "");
            text = text.slice(0, -1);
        }

        const data = JSON.parse(text);

        if (url.includes("summary")) {
            await updateSummary(data, itemId);
        }

        if (url.includes("products")) {
            await updateProductInfo(data, itemId, queue);
        }

        if (url.includes("statistics")) {
            await updateStatistics(data, itemId);
        }

        if (url.includes("batch")) {
            await updateReviewsInfo(data, itemId, queue);
        }
    });

    await autoScroll(page);

    const isReviews = await page.$('div[data-bv-show="rating_summary"]');

    if (isReviews) {
        log("No reviews found", itemId);

        updateTags(prefix, itemId, options.query);
        updateTime(prefix, itemId);

        return false;
    }

    let isNext = await page.$(
        ".bv-content-pagination-buttons-item-next button"
    );

    while (isNext) {
        const isNextButtonDisabled = await page.$(
            ".bv-content-pagination-buttons-item-next button[disabled]"
        );

        if (isNextButtonDisabled) {
            isNext = false;
            log("Next button is disabled");
        } else {
            log("Click next button", itemId);

            await page.click(".bv-content-pagination-buttons-item-next button");
        }

        await sleep(10 * 1000); // wait 10 sec
    }

    // const ratings = await page.evaluate(() => {
    //     const ratingsElement = document.querySelector(
    //         'div[data-bv-show="rating_summary"]'
    //     );

    //     if (!ratingsElement) {
    //         return false;
    //     }

    //     const id = parseInt(
    //         ratingsElement.getAttribute("data-bv-product-id"),
    //         10
    //     );

    //     const avg = parseFloat(
    //         document.querySelector(".bv_avgRating_component_container")
    //             .textContent
    //     );

    //     const reviews = parseInt(
    //         document.querySelector(".bv_numReviews_text").textContent,
    //         10
    //     );

    //     return {
    //         id,
    //         avg,
    //         reviews,
    //     };
    // });

    // const { id, avg, reviews } = ratings;

    // log(`Found ${reviews} reviews with avg ${avg}`, itemId);

    // // Add id if not defined
    // if (!("id" in dbItem)) {
    //     updateItem(prefix, itemId, {
    //         id,
    //     });
    // }

    updateTags(prefix, itemId, options.query);
    updateTime(prefix, itemId);

    return true;
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
        const itemId = link.replace("https://www.wiggle.com/p/", "");

        let dbItem = getItem(prefix, itemId);

        if (!dbItem) {
            addItem(prefix, itemId, {
                link,
            });

            dbItem = getItem(prefix, itemId);
        }

        const time = options.time * 60 * 60 * 1000;

        if (
            dbItem?.time &&
            Date.now() - dbItem.time <= time &&
            !options.force
        ) {
            log(`Already updated by time`, itemId);
            continue;
        }

        if (dbItem.deleted) {
            logMsg("Deleted item", itemId);
            continue;
        }

        queue.add(() => scrapeItem(itemId, browser, queue), {
            priority: priorities.item,
        });
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
export async function updateBrands(queue) {
    const brands = getBrands(prefix, true);

    for (const brandId in brands) {
        const brandItem = brands[brandId];

        await getBrandItemsByID(brandItem.name, queue);
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

    const browser = await puppeteer.launch(browserConfig);

    await scrapeItem(itemId, browser, queue);

    await browser.close();

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
        queue.add(() => scrapeItem(itemId, browser, queue), {
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
export async function updateReviews(queue) {
    const items = getItems(prefix, true);

    log(`Update ${items.length} items reviews`);

    for (const itemId of items) {
        const item = getItem(prefix, itemId);

        if (!item?.reviews?.length) {
            return false;
        }

        log(`Found ${item.reviews.length} reviews`, itemId);

        for (const reviewId of item.reviews) {
            const feedback = await getReview(prefix, itemId, reviewId);

            await processReview(feedback, itemId, queue);
        }
    }

    return true;
}

/**
 * Get brand items by brand ID
 *
 * @param   {String}  brandID  Brand ID
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Array}            Brand IDs array
 */
export async function getBrandItemsByID(brandID = options.brand, queue) {
    log(`Get items call by brand ${brandID}`);

    const browser = await puppeteer.launch(browserConfig);

    let count = 0;
    let ended = false;

    for (let page = options.start; page <= options.pages; page++) {
        await queue.add(
            async () => {
                if (ended) {
                    return false;
                }

                const { links, next } = await processPage(
                    page,
                    null,
                    browser,
                    brandID
                );

                if (!links) {
                    log(`Error process page ${page}`);

                    await sleep(600000);
                    return false;
                }

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

    log(`Found ${count} items for brand ${brandID}`);

    const pages = await browser.pages();

    await Promise.all(pages.map((page) => page.close()));

    await browser.close();

    return true;
}

/**
 * Get items by brand
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  brand  Brand ID
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByBrand(queue, brand = options.brand) {
    return await getBrandItemsByID(brand, queue);
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
