import path from "node:path";

import axios from "axios";
import cheerio from "cheerio";
import is from "is_js";

// import {
//     products as amazonProducts,
//     reviews as amazonReviews,
// } from "amazon-buddy";

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
    getReviews,
    getTags,
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

const prefix = "amazon";

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
 * Get product items from page
 *
 * @param   {Number}  pageNumber  Page number
 * @param   {String}  query       Query
 *
 * @return  {Array}               Products IDs array
 */
async function processPage(pageNumber, query) {
    if (!is.number(pageNumber)) {
        log(`Input page number ${pageNumber} is not a number!`);
        return false;
    }

    if (!is.string(query)) {
        log(`Input query ${query} is not a string!`);
        return false;
    }

    log(`Try to get page ${pageNumber}`);

    try {
        const request = await axios(
            `https://www.amazon.com/s?k=${encodeURI(query)}&page=${pageNumber}`,
            {
                responseType: "document",
                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        const $ = cheerio.load(request.data);

        const searchResults = $(
            'span[data-component-type="s-search-results"] a'
        );

        let ids = [];

        searchResults.each((index, element) => {
            ids.push($(element).attr("href"));
        });

        ids = ids
            .filter((element) => element.includes("/dp/"))
            .map((element) => element.slice(0, element.indexOf("/ref")))
            .map((element) => {
                if (element.length > 10) {
                    return element.slice(0, element.indexOf("/"));
                }

                return element;
            })
            .filter((element, index, array) => array.indexOf(element) === index)
            .map((element) => {
                return {
                    asin: element.slice(element.indexOf("/dp/") + 4),
                    link: element,
                };
            });

        log(`Found ${ids.length} items on page ${pageNumber}`);

        return ids;
    } catch (error) {
        log(`Get page ${pageNumber} error: ${error.message}`);
    }

    return false;
}

/**
 * Download product images helper
 *
 * @param   {Number}  asin    Product asin
 * @param   {Object}  queue   Queue
 *
 * @return  {Boolean}         Result
 */
async function downloadImages(asin, queue) {
    if (!asin) {
        log(`ASIN not defined!`);
        return false;
    }

    let dbItem = getItem(prefix, asin);

    if (!dbItem) {
        log("DB item not found!", asin);
        return false;
    }

    if (!dbItem.reviews.length) {
        const reviews = getReviews(prefix, { asin });

        if (reviews.length) {
            updateItem(
                prefix,
                asin,
                {
                    reviews: reviews.map((item) => item.id),
                },
                true
            );

            dbItem = getItem(prefix, asin);
        } else {
            log(`Reviews not found`, asin);
            return true;
        }
    }

    const dirPath = path.resolve(options.directory, "download", prefix, asin);

    log(`Process reviews`, asin);

    for (const reviewId of dbItem.reviews) {
        const reviewItem = getReview(prefix, asin, reviewId);

        if (!reviewItem) {
            continue;
        }

        for (const photo of reviewItem.photos) {
            const filename = path.basename(photo);
            const imagePath = path.resolve(dirPath, filename);

            downloadItem(photo, imagePath, queue);
        }
    }

    return true;
}

/**
 * Process item
 *
 * @param   {String}  asin       Item ASIN ID
 * @param   {Object}  browser    Puppeteer instance
 * @param   {Object}  queue      Queue
 * @param   {String}  query      Query
 *
 * @return  {Boolean}            Result
 */
export async function processItem(asin, browser, queue, query = false) {
    const time = options.time * 60 * 60 * 1000;

    const dbItem = getItem(prefix, asin);

    if (!dbItem) {
        log("DB item not found!", asin);
        return false;
    }

    if (dbItem?.time && Date.now() - dbItem.time <= time && !options.force) {
        log(`Already updated by time`, asin);
        return false;
    }

    log("Try to get reviews", asin);

    let ended = false;

    for (let pageNumber = 1; pageNumber <= options.pages; pageNumber++) {
        await queue.add(
            async () => {
                if (ended) {
                    return false;
                }

                log(`Try to get page ${pageNumber} reviews`, asin);

                try {
                    // const pageRequest = await axios(
                    //     `https://www.amazon.com/dp/product-reviews/${asin}/?reviewerType=all_reviews&pageNumber=${pageNumber}`,
                    //     {
                    //         responseType: "document",
                    //         timeout: options.timeout,
                    //         headers: getHeaders(),
                    //     }
                    // );

                    // const $ = cheerio.load(pageRequest.data);

                    // if (
                    //     pageRequest.data.includes(
                    //         ">Enter the characters you see below<"
                    //     )
                    // ) {
                    //     console.log(pageRequest.data);

                    //     log(`Captcha found!`, asin);
                    //     return false;
                    // }

                    // log(`Page ${pageNumber} reviews loaded`, asin);

                    // $(
                    //     'div[data-hook="review"]'
                    //     // 'div[data-cel-widget="cm_cr-review_list"] > div[data-hook="review"]'
                    // ).each((index, element) => {
                    //     console.log(element);
                    // });

                    const page = await createPage(browser, true);

                    await page.goto(
                        `https://www.amazon.com/dp/product-reviews/${asin}/?reviewerType=all_reviews&pageNumber=${pageNumber}`,
                        goSettings
                    );

                    // const reviews = await page.evaluate(() => {
                    //     return Array.from(
                    //         document.querySelectorAll('div[data-hook="review"]')
                    //     ).map((item) => item.textContent);
                    // });

                    // console.log(reviews);

                    const reviewItems = await page.$$(
                        'div[data-hook="review"]'
                    );

                    const { totalCount, reviewsCount } = await page.evaluate(
                        () => {
                            const element = document.querySelector(
                                '[data-hook="cr-filter-info-review-rating-count"]'
                            );

                            if (!element) {
                                return false;
                            }

                            const resultString = element.textContent.trim();

                            const [totalCount, reviewsCount] = resultString
                                .split(",")
                                .map((item) => parseInt(item, 10));

                            return {
                                totalCount,
                                reviewsCount,
                            };
                        }
                    );

                    if (!reviewItems || !reviewItems.length) {
                        log(`No reviews found on page ${pageNumber}`, asin);

                        ended = true;
                        pageNumber = options.pages + 1;

                        await page.close();

                        return false;
                    }

                    log(
                        `Found ${reviewItems.length}(${totalCount}/${reviewsCount}) reviews on reviews page ${pageNumber}`,
                        asin
                    );

                    for (const reviewItem of reviewItems) {
                        const id = await page.evaluate(
                            (item) => item.getAttribute("id"),
                            reviewItem
                        );

                        const name = await page.evaluate(
                            (item) =>
                                item
                                    .querySelector(".a-profile-name")
                                    .textContent.trim(),
                            reviewItem
                        );

                        const rating = await page.evaluate(
                            (item) =>
                                item
                                    .querySelector(".review-rating")
                                    .textContent.trim(),
                            reviewItem
                        );

                        const review_data = await page.evaluate(
                            (item) =>
                                item
                                    .querySelector("[data-hook='review-date']")
                                    .textContent.trim(),
                            reviewItem
                        );

                        let review = await page.evaluate(
                            (item) =>
                                item
                                    .querySelector("[data-hook='review-body']")
                                    .textContent.trim(),
                            reviewItem
                        );

                        review = review
                            .replace("\n\n\n\n\n\n\n\n  \n  \n    ", "")
                            .replace(rating, "");

                        const title = await page.evaluate(
                            (item) =>
                                item
                                    .querySelector("[data-hook='review-title'")
                                    .textContent.trim(),
                            reviewItem
                        );

                        const photos = await page.evaluate(
                            (item) =>
                                Array.from(item.querySelectorAll("img"))
                                    .map((img) => img.src)
                                    .filter((link) => link.includes("_SY88"))
                                    .map((link) =>
                                        link.replace("_SY88", "_SL1600_")
                                    ),
                            reviewItem
                        );

                        const dbItem = {
                            id,
                            asin,
                            name,
                            rating,
                            review_data,
                            review,
                            photos,
                            title,
                        };

                        addReview(prefix, asin, id, dbItem, false);

                        if (photos.length) {
                            downloadImages(asin, queue);
                        }
                    }

                    dbWrite(`${prefix}-reviews`, true, prefix);

                    await page.close();
                } catch (error) {
                    log(
                        `Page ${pageNumber} reviews error: ${error.message}`,
                        asin
                    );
                }
            },
            { priority: priorities.review }
        );
    }

    log("Get all reviews", asin);

    updateTime(prefix, asin);

    if (query) {
        updateTags(prefix, asin, query);
    }

    // await queue.add(
    //     async () => {
    //         log("Try to get reviews", asin);

    //         let reviews;

    //         try {
    //             reviews = await amazonReviews({
    //                 asin: product.asin,
    //                 number: product?.reviews?.total_reviews || 2000,
    //                 timeout: options.timeout,
    //             });
    //         } catch (error) {
    //             reviews = false;
    //             log(`Error get reviews: ${error.message}`, product.asin);
    //         }

    //         if (!reviews) {
    //             log("Reviews not found", product.asin);
    //             updateTime(prefix, product.asin);
    //             updateTags(prefix, product.asin, options.query);
    //             return false;
    //         }

    //         log(`Found ${reviews.result.length}`, product.asin);

    //         for (const reviewItem of reviews.result) {
    //             addReview(
    //                 prefix,
    //                 product.asin,
    //                 reviewItem.id,
    //                 reviewItem,
    //                 true
    //             );

    //             if (reviewItem?.photos?.length) {
    //                 downloadImages(product.asin, queue);
    //             }
    //         }

    //         updateTime(prefix, product.asin);

    //         if (query) {
    //             updateTags(prefix, product.asin, query);
    //         }
    //     },
    //     { priority: priorities.item }
    // );

    return true;
}

/**
 * Process given items
 *
 * @param   {Array}    products    Products array
 * @param   {Object}   browser     Puppeteer instance
 * @param   {Object}   queue       Queue
 * @param   {String}   query       Query
 *
 * @return  {Boolean}              Result
 */
export async function processItems(products, browser, queue, query) {
    for (const product of products) {
        const dbItem = getItem(prefix, product.asin);

        if (!dbItem) {
            addItem(prefix, product.asin, product);
        }

        processItem(product.asin, browser, queue, query);
    }

    return true;
}

/**
 * Update items
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    const browser = await puppeteer.launch(browserConfig);

    for (const itemId of items) {
        await processItem(itemId, browser, queue);
        // queue.add(() => processItem(itemId, browser, queue), {
        //     priority: priorities.item,
        // });
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

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

    items.forEach((itemId) => {
        downloadImages(itemId, queue);
    });

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
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

    if (!tags || !tags.length) {
        log("Tags not found!");
        return false;
    }

    log(`Get items with tags ${tags.join("-")}`);

    for (const tag of tags) {
        await getItemsByQuery(queue, tag);
    }

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}   queue  Queue
 * @param   {String}   query  Query
 *
 * @return  {Boolean}         Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log("Get items call");

    const browser = await puppeteer.launch(browserConfig);

    for (
        let pageNumber = options.start;
        pageNumber < options.pages;
        pageNumber++
    ) {
        let results;

        await queue.add(
            async () => {
                results = await processPage(pageNumber, query);

                if (!results.length || !results) {
                    pageNumber = options.pages + 1;
                }

                // try {
                //     results = await amazonProducts({
                //         keyword: query,
                //         bulk: false,
                //         page,
                //         queue,
                //         timeout: options.timeout,
                //     });
                // } catch (error) {
                //     results = false;
                //     log(`Error get from page ${page}: ${error.message}`);

                //     if (error.message == "No more products") {
                //         page = options.pages;
                //     }
                // }
            },
            { priority: priorities.item }
        );

        if (!results) {
            continue;
        }

        // const products = results.result;
        // const total = results.totalProducts;

        // if (!products.length) {
        //     pageNumber = options.pages;
        //     continue;
        // }

        log(`Total products found ${results.length} on page ${pageNumber}`);

        await processItems(results, browser, queue, query);
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

export default getItemsByQuery;
