import fs from "node:fs";
import path from "node:path";

import axios from "axios";
// import cheerio from "cheerio";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import {
    addItem,
    addReview,
    getItem,
    getItems,
    getReview,
    getTags,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import { getProxy } from "../helpers/proxy-helpers.js";
import { logMsg, logQueue } from "../helpers/log-msg.js";
import autoScroll from "../helpers/auto-scroll.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import getHeaders from "../helpers/get-headers.js";
import goSettings from "../helpers/go-settings.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

const prefix = "aliexpress";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

let isStartPageReloading = false;

/**
 * Log message helper
 *
 * @param   {String}  msg     Message
 * @param   {String}  id      Item ID
 *
 * @return  {Boolean}         Result
 */
function log(msg, id = false) {
    return logMsg(msg, id, prefix);
}

/**
 * Sleep helper after end item process
 *
 * @param   {String}  itemId  Item ID
 * @param   {Number}  pageId  Optional page number
 *
 * @return  {Boolean}         Result
 */
async function sleepAfterEnd(itemId, pageId = false) {
    const sleepTime = Math.random() * options.timeout;

    let startMsg = `Wait for ${Math.round(sleepTime / 1000)} sec after end`;
    let endMsg = `End waiting for ${Math.round(sleepTime / 1000)} sec`;

    if (pageId) {
        startMsg = `Wait for ${Math.round(
            sleepTime / 1000
        )} sec on reviews page ${pageId}`;
        endMsg = `End waiting for ${Math.round(
            sleepTime / 1000
        )} sec on reviews page ${pageId}`;
    }

    log(startMsg, itemId);

    await sleep(sleepTime); // Waif random time, from 0 to 1 min

    log(endMsg, itemId);

    return true;
}

/**
 * Get user ID from string
 *
 * @param   {String}  str  User URL string
 *
 * @return  {String}       User ID
 */
export function getUserId(str) {
    return str
        .replace(
            "https://feedback.aliexpress.ru/display/detail.htm?ownerMemberId=",
            ""
        )
        .replace("&memberType=buyer", "");
}

/**
 * Get user reviews
 *
 * @param   {String}  username  User ID(username)
 * @param   {Object}  browser   Puppeteer instance
 *
 * @return  {Array}             Items array with user reviews
 */
export async function getUserReviews(username, browser) {
    log(`Get user ${username} items`);

    const page = await createPage(browser);

    let items = [];

    for (let pageNumber = 1; pageNumber < options.pages; pageNumber++) {
        log(`Process page ${pageNumber} for user ${username}`);

        try {
            await page.goto(
                `https://feedback.aliexpress.com/display/detail.htm?ownerMemberId=${username}&memberType=buyer&page=${pageNumber}`,
                goSettings
            );

            const hrefs = await page.$$eval(".product-name a", (links) => {
                return Array.from(links).map((link) =>
                    link.getAttribute("href")
                );
            });

            const pageItems = hrefs
                .filter((href) => href.includes("/item/"))
                .filter((href) => href.length)
                .map((href) =>
                    parseInt(
                        href.slice(
                            href.indexOf("/item/-/") + 8,
                            href.indexOf(".html")
                        ),
                        10
                    )
                )
                .filter((index) => index > 10)
                .filter((value, index, self) => self.indexOf(value) === index);

            items = items.concat(pageItems);

            if (!pageItems.length) {
                pageNumber = options.pages;
            }
        } catch (error) {
            log(
                `Process page ${pageNumber} for user ${username} error: ${error.message}`
            );
        }
    }

    await page.close();

    log(`Get ${items.length} for user ${username}`);

    return items;
}

/**
 * Load browser for process cache and session
 *
 * @return  {Boolean}  Result
 */
export async function processCookiesAndSession() {
    log("Try to save cache");

    const puppeteerPath = path.resolve("./puppeteer/");

    if (!fs.existsSync(puppeteerPath)) {
        fs.mkdirSync(puppeteerPath);
    }

    const browser = await puppeteer.launch({
        headless: false,
        devtools: true,
        userDataDir: path.resolve(options.directory, "puppeteer"),
    });

    const page = await browser.newPage();

    try {
        await page.goto("https://aliexpress.ru/", goSettings);

        log("Load start page, wait for 1 min");

        await sleep(60 * 1000);
    } catch (error) {
        log(`Go to start page error: ${error.message}`);
    }

    await page.close();

    browser.close();

    return true;
}

/**
 * Process review download
 *
 * @param   {Object}  review  Review
 * @param   {Number}  id      Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function download(review, id, queue) {
    const dirPath = path.resolve(
        options.directory,
        "download",
        "aliexpress",
        id.toString()
    );

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    if (review?.images?.length) {
        log(
            `Download ${review.evaluationId || review.id} review ${
                review.images.length
            } images`,
            id
        );

        for (let url of review.images) {
            if (typeof url == "object") {
                url = url.url;
            }

            const parsePath = path.parse(url);
            const name = parsePath.base;

            const itemPath = path.resolve(dirPath, name);

            downloadItem(url, itemPath, queue);
        }
    }

    if (review?.additionalReview?.images?.length) {
        log(
            `Download ${review.evaluationId || review.id} additional review ${
                review.additionalReview.images.length
            } images`,
            id
        );

        for (let url of review.additionalReview.images) {
            if (typeof url == "object") {
                url = url.url;
            }

            const itemPath = path.resolve(dirPath, path.basename(url));

            downloadItem(url, itemPath, queue);
        }
    }

    return true;
}

/**
 * Get reviews for item from page
 *
 * @param   {Number}  itemId  Item ID
 * @param   {Number}  pageId  Reviews page number
 *
 * @return  {Object}          Reviews object
 */
export async function getItemReviewsPage(itemId, pageId) {
    let reviewsData = {};

    log(`Process page ${pageId}`, itemId);

    try {
        const config = {
            url: "https://feedback.aliexpress.com/pc/searchEvaluation.do",
            timeout: options.timeout,
            headers: getHeaders(),
            params: {
                productId: itemId,
                page: pageId,
                pageSize: 10,
                filter: "all",
            },
            method: "GET",
        };

        // const config = {
        //     url: `https://aliexpress.ru/aer-api/v1/review/filters?product_id=${itemId}`,
        //     timeout: options.timeout,
        //     headers: getHeaders(),
        //     body: {
        //         productId: itemId.toString(),
        //         starFilter: "all",
        //         sort: "default",
        //         page: pageId,
        //         pageSize: 10,
        //         translate: true,
        //         local: false,
        //     },
        //     method: "POST",
        // };

        if (options.proxy) {
            const { protocol, host, port } = getProxy();

            config.proxy = {
                protocol,
                host,
                port,
            };
        }

        const request = await axios(config);

        log(`Get data on page ${pageId}`, itemId);

        reviewsData = request.data.data;
    } catch (error) {
        log(`Error get reviews page ${pageId}: ${error.message}`, itemId);
    }

    return reviewsData;
}

/**
 * Scrap item by ID helper
 *
 * @param   {Number}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function scrapeItem(itemId, queue) {
    if (!itemId) {
        log(`Item not defined`, itemId);
        return false;
    }

    const time = options.time * 60 * 60 * 1000;

    const dbReviewItem = getItem(prefix, itemId);

    if (
        dbReviewItem?.time &&
        Date.now() - dbReviewItem.time <= time &&
        !options.force
    ) {
        log(`Already updated by time`, itemId);
        return false;
    }

    log(`Try to get item`, itemId);

    let found = false;
    let reviews = [];

    try {
        let maxPages = options.pages;

        const firstPageReviews = await getItemReviewsPage(itemId, 1);

        if (firstPageReviews?.totalPage) {
            maxPages = firstPageReviews.totalPage || 1;

            if (Array.isArray(firstPageReviews.evaViewList)) {
                reviews.push(...firstPageReviews.evaViewList);
            }

            log(`Set max pages to ${maxPages}`, itemId);
        }

        if (maxPages > 1) {
            let stoped = false;

            for (let pageId = 2; pageId <= maxPages; pageId++) {
                // await queue.add(
                //     async () => {

                if (stoped) {
                    continue;
                }

                const jsonData = await getItemReviewsPage(itemId, pageId);

                if (!jsonData.evaViewList || !jsonData.evaViewList.length) {
                    pageId = options.pages;
                    stoped = true;
                } else {
                    reviews.push(...jsonData.evaViewList);
                }
                //     },
                //     { priority: priorities.item }
                // );
            }
        }

        log(`Reviews length ${reviews.length}`, itemId);

        for (const reviewItem of reviews) {
            addReview(
                prefix,
                itemId,
                reviewItem.evaluationId || reviewItem.id,
                reviewItem,
                true
            );
        }

        updateTime(prefix, itemId);
        updateTags(prefix, itemId, options.query);

        reviews = reviews
            .filter((reviewItem) => reviewItem.images)
            .filter((reviewItem) => reviewItem.images.length);

        for (const reviewItem of reviews) {
            await download(reviewItem, itemId, queue);
        }

        log(`Reviews length after filter ${reviews.length}`, itemId);

        found = true;
    } catch (error) {
        log(`Error reviews get: ${error.message}`, itemId);
        // await sleep(60000);
    }

    return found ? reviews : false;
}

/**
 * Scrape item by ID with Puppeteer
 *
 * @param   {String}  itemId      Item ID
 * @param   {Object}  browser     Browser instance
 * @param   {Object}  startPage   Home page
 * @param   {Object}  queue       Queue instance
 *
 * @return  {Boolean}             Result
 */
export async function scrapeItemByBrowser(itemId, browser, startPage, queue) {
    log("Start scrape item", itemId);

    // const page = await createPage(browser, true);

    // let isData = false;
    // let isEnded = false;
    // let pageId = 0;

    // await page.setRequestInterception(true);

    // page.on("response", async (response) => {
    //     const url = response.url();
    //     const method = response.request().method();

    //     if (!url.includes("/review/v1/")) {
    //         return false;
    //     }

    //     if (method !== "POST") {
    //         return false;
    //     }

    //     // logMsg(`[${method}] ${url}`);

    //     let data;

    //     try {
    //         const { data } = await response.json();

    //         if (data?.reviews?.length) {
    //             for (const reviewItem of data.reviews) {
    //                 addReview(
    //                     aliexpressDb,
    //                     itemId,
    //                     reviewItem.id,
    //                     reviewItem,
    //                     "Aliexpress"
    //                 );
    //             }
    //         } else {
    //             isEnded = true;
    //         }
    //     } catch (error) {
    //         logMsg(`Get respoonse data error: ${error.message}`);
    //         return false;
    //     }

    //     isData = false;

    //     if (data?.ret) {
    //         logMsg("Captcha error", itemId);
    //         isEnded = true;
    //     }
    // });

    let result = true;

    // try {
    // await page.goto(
    //     `https://aliexpress.ru/item/${itemId}.html`,
    //     goSettings
    // );

    // logMsg("Item page loaded", itemId);

    // await autoScroll(page);

    // const isCaptcha = await page.$("#baxia-punish");
    // const isCaptchaPopup = await page.$(".baxia-dialog");

    // if (isCaptcha || isCaptchaPopup) {
    //     throw new Error("Captcha found");
    // }

    let maxPages = 10;
    let ended = false;
    const pageSize = 20;

    for (let pageId = 1; pageId <= maxPages; pageId++) {
        await queue.add(
            async () => {
                if (!result) {
                    return false;
                }

                if (ended) {
                    // log("Ended page get", itemId);
                    return false;
                }

                // Wait before page in reloading state after slide check
                while (isStartPageReloading) {
                    await sleep(1000);
                }

                const isCaptcha = await startPage.$("#baxia-punish");
                const isCaptchaPopup = await startPage.$(".baxia-dialog");

                if (isCaptcha || isCaptchaPopup) {
                    // if (!options.headless) {
                    await sleep(Math.random() * 60 * 1000); // Waif random time, from 0 to 5 min
                    // }

                    pageId = maxPages;
                    ended = true;

                    log("Captcha found", itemId);

                    result = false;

                    queue.add(
                        () =>
                            scrapeItemByBrowser(
                                itemId,
                                browser,
                                startPage,
                                queue
                            ),
                        {
                            priority: priorities.item,
                        }
                    );

                    return false;
                }

                log(`Get reviews page ${pageId}`, itemId);

                const data = await startPage.evaluate(
                    async (id, pageNum, pageCount, opt) => {
                        try {
                            const request = await fetch(
                                `https://aliexpress.ru/aer-jsonapi/review/v1/desktop/product/reviews?product_id=${id}&_bx-v=2.2.3`,
                                {
                                    credentials: "include",
                                    body: `{"productId":"${id}","pageSize":${pageCount},"pageNum":${pageNum},"reviewFilters":[],"starFilter":"StarFilter_ALL_STARS","sort":"ReviewSort_USEFUL"}`,
                                    method: "POST",
                                    mode: "cors",
                                    timeout: opt.timeout,
                                }
                            );

                            return await request.json();
                        } catch (error) {
                            return error;
                        }
                    },
                    itemId,
                    pageId,
                    pageSize,
                    options
                );

                if (data?.data?.totalAmount) {
                    maxPages = Math.round(data.data.totalAmount / pageSize) + 1;
                    log(`Set reviews max page to ${maxPages}`, itemId);

                    const item = getItem(prefix, itemId);

                    const reviewsCount = item?.reviews
                        ? item.reviews.length
                        : 0;

                    if (
                        reviewsCount >= data.data.totalAmount &&
                        !options.force
                    ) {
                        pageId = maxPages;
                        ended = true;

                        log("All data already downloaded", itemId);

                        await sleepAfterEnd(itemId);

                        return true;
                    }
                }

                if (data?.data?.paginationStatusText) {
                    log(
                        `Status page ${pageId}: ${data?.data?.paginationStatusText}`,
                        itemId
                    );
                }

                if (data?.data?.reviews?.length) {
                    log(
                        `Found ${data.data.reviews.length} from ${data.data.totalAmount} reviews on reviews page ${pageId}`,
                        itemId
                    );

                    for (const reviewItem of data.data.reviews) {
                        addReview(
                            prefix,
                            itemId,
                            reviewItem.id,
                            reviewItem,
                            false
                        );
                    }

                    await sleepAfterEnd(itemId, pageId);

                    return true;
                }

                if (data?.ret || data?.url) {
                    log("Request captcha! Wait for 5 min", itemId);
                    await sleep(Math.random() * 60 * 1000);
                    result = false;

                    queue.add(
                        () =>
                            scrapeItemByBrowser(
                                itemId,
                                browser,
                                startPage,
                                queue
                            ),
                        {
                            priority: priorities.item,
                        }
                    );

                    return false;
                }

                log("No reviews found", itemId);

                pageId = maxPages;
                ended = true;

                await sleepAfterEnd(itemId);

                return true;
            },
            {
                priority: priorities.page,
            }
        );
    }

    // let count = 0;

    // while (!isEnded) {
    //     // console.log(isData, isEnded);

    //     if (isData) {
    //         if (count < 10) {
    //             logMsg("Wait 1 sec for data", itemId);
    //             await sleep(1000);
    //             count++;
    //         } else {
    //             count = 0;
    //             isData = false;
    //         }
    //     } else {
    //         const isNextButton = await page.$(
    //             'button[data-type="forward"]'
    //         );

    //         // console.log(isNextButton);

    //         if (isNextButton) {
    //             logMsg("Click next", itemId);

    //             await page.evaluate(() => {
    //                 document
    //                     .querySelector('button[data-type="forward"]')
    //                     .click();

    //                 return true;
    //             });

    //             isData = true;
    //         } else if (!isData) {
    //             logMsg("No next founded", itemId);

    //             isEnded = true;
    //         }
    //     }
    // }

    // console.log("Wait for 1 min");

    // await sleep(60000);
    // } catch (error) {
    //     logMsg(`Go to item error: ${error.message}`, itemId);
    // }

    // await page.close();

    // while (!ended) {
    //     await sleep(5000);
    // }

    log(`Get all reviews for item result ${result}`, itemId);

    if (result) {
        updateTime(prefix, itemId);
        updateTags(prefix, itemId, options.query);

        const item = getItem(prefix, itemId);

        const reviews = item.reviews
            .map((reviewId) => getReview(prefix, itemId, reviewId))
            .filter((reviewItem) => {
                return reviewItem?.images?.length ||
                    reviewItem?.additionalReview?.images?.length
                    ? true
                    : false;
            });

        for (const reviewItem of reviews) {
            download(reviewItem, itemId, queue);
        }
    }

    return true;
}

// async function processPageByXhr(pageId, queue) {
//     if (!pageId) {
//         log("Page ID not defined!");
//         return false;
//     }

//     const pageURL = `https://www.aliexpress.com/w/wholesale-${options.query.replace(
//         /\s/g,
//         "-"
//     )}.html?page=${pageId}`;

//     try {
//         log(`Try to get items for page ${pageId}`);

//         const request = await axios(pageURL, {
//             timeout: options.timeout,
//             responseType: "document",
//             headers: getHeaders(),
//         });

//         const html = request.data;

//         const $ = cheerio.load(html);

//         let links = [];

//         $("a").each((index, image) => {
//             links.push($(image).attr("href"));
//         });

//         links = links
//             .filter((link) => link.includes("/item/"))
//             .map((link) =>
//                 parseInt(
//                     link.slice(
//                         link.indexOf("/item/") + 6,
//                         link.indexOf(".html")
//                     ),
//                     10
//                 )
//             )
//             .filter((value, index, array) => array.indexOf(value) == index);
//     } catch (error) {
//         log(`Get items from page ${pageId} error: ${error.message}`);
//         return false;
//     }

//     return true;
// }

/**
 * Process page for query
 * @param   {Number}  pageId       Page number
 * @param   {String}  query        Query string
 * @param   {Object}  browser      Puppeteer browser instance
 * @param   {Number}  totalFound   Total items found number
 * @param   {Object}  queue        Queue instance
 *
 * @return  {Number}               Pages count
 */
export async function processPage(
    pageId,
    query = "",
    browser,
    totalFound,
    queue
) {
    if (!pageId) {
        log("Page ID not defined!");
        return false;
    }

    log(`Process page ${pageId}`);

    const page = await createPage(browser, false);

    if (options.url?.length) {
        let url = options.url;

        url = url.replace(/&page=\d+/g, "");

        await page.goto(`${url}&page=${pageId}`, goSettings);
    } else {
        // const pageUrl = `https://aliexpress.com/wholesale?trafficChannel=main&d=y&CatId=0&SearchText=${query.replace(
        //     /\s/g,
        //     "+"
        // )}&ltype=wholesale&SortType=total_tranpro_desc&page=${pageId}`;

        const pageUrl = `https://aliexpress.ru/wholesale?SearchText=${query.replace(
            /\s/g,
            "+"
        )}&g=y&page=${pageId}`;

        await page.goto(pageUrl, goSettings);
    }

    const isCaptcha = await page.evaluate(() => {
        return document.querySelector(".captcha-tips") ? true : false;
    });

    if (isCaptcha) {
        log("CAPTCHA!!!");
        await sleep(10 * 1000);
        // await page.waitFor(60 * 1000);
        await page.close();
        return 0;
    }

    await autoScroll(page);

    const items = await page.$$eval("a", (links) => {
        return links
            .map((link) => link.href)
            .filter((link) => link.includes("/item/"))
            .map((link) =>
                parseInt(
                    link.slice(
                        link.indexOf("/item/") + 6,
                        link.indexOf(".html")
                    ),
                    10
                )
            )
            .filter((value, index, array) => array.indexOf(value) == index);
    });

    log(`Found ${items.length} on page ${pageId}`);

    for (const item of items) {
        addItem(prefix, item);
        updateTags(prefix, item, query);

        queue.add(() => scrapeItem(item, queue), { priority: priorities.item });
    }

    let pagesCount = 0;

    if (!totalFound && !options.pages) {
        try {
            pagesCount = await page.$eval(
                ".total-page",
                (el) => el.textContent
            );
        } catch (error) {
            log(
                `Total pages not found on page ${pageId} error: ${error.message}`
            );
            pagesCount = 0;
        }

        const pagesRegex = /\d+/gi;

        pagesCount = parseInt(pagesRegex.exec(pagesCount), 10);

        log(`Total pages count: ${pagesCount}`);
    }

    await page.close();

    return pagesCount;
}

/**
 * Update items
 *
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function updateItems(queue) {
    const puppeteerPath = path.resolve("./puppeteer/");

    if (!fs.existsSync(puppeteerPath)) {
        fs.mkdirSync(puppeteerPath);
    }

    const browser = await puppeteer.launch(browserConfig);

    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    const startPage = await createPage(browser, false);

    await startPage.goto(`https://aliexpress.ru/`, goSettings);

    await startPage.setRequestInterception(true);

    startPage.on("response", async (response) => {
        const url = response.url();
        const method = response.request().method();

        if (!url.includes("slide?slidedata")) {
            return false;
        }

        log(`[${method}] ${url}`);

        try {
            const { success } = await response.json();

            if (success) {
                log("Reload page after slide");
                isStartPageReloading = true;
                await startPage.reload(goSettings);
                isStartPageReloading = false;
            }
        } catch (error) {
            log(`Get respoonse data error: ${error.message}`);
            return false;
        }
    });

    log("Start page loaded");

    // await autoScroll(startPage);

    // const isCaptcha = await startPage.$("#baxia-punish");
    // const isCaptchaPopup = await startPage.$(".baxia-dialog");

    // if (isCaptcha || isCaptchaPopup) {
    //     if (!options.headless) {
    //         await sleep(1 * 60000); // wait 1 min
    //     }

    //     throw new Error("Captcha found");
    // }

    items.forEach((itemId) =>
        queue.add(
            () => scrapeItemByBrowser(itemId, browser, startPage, queue),
            {
                priority: priorities.item,
            }
        )
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
 * Update items reviews
 *
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function updateReviews(queue) {
    const items = getItems(prefix);

    log(`Update ${items.length} reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item || !item?.reviews?.length) {
            // logMsg("Reviews not found!", itemId);
            return false;
        }

        for (const reviewId of item.reviews) {
            const reviewItem = getReview(prefix, itemId, reviewId);

            // if ("video" in reviewItem || "videos" in reviewItem) {
            //     console.log(reviewItem);
            // }

            if (!reviewItem?.images?.length) {
                continue;
            }

            download(reviewItem, itemId, queue);
        }
    });

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    log("End reviews update");

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
 * Get items by query helper
 *
 * @param   {Object}  queue   Queue instance
 * @param   {String}  query   Query
 *
 * @return  {Boolean}         Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log("Get items call");

    let totalFound = false;

    const browser = await puppeteer.launch(browserConfig);

    for (let page = options.start; page <= options.pages; page++) {
        // await queue.add(
        //     async () => {
        //         await processPageByXhr(page, queue);
        //     },
        //     { priority: priorities.page }
        // );

        await queue.add(
            async () => {
                const pagesCount = await processPage(
                    page,
                    query,
                    browser,
                    totalFound,
                    queue
                );

                if (!(pagesCount > 0 && pagesCount < options.pages)) {
                    return;
                }
                log(`Set total pages to ${pagesCount}`);
                totalFound = true;
                options.pages = pagesCount;
            },
            { priority: priorities.page }
        );
    }

    while (queue.size || queue.pending || !queue.isPaused) {
        await sleep(5 * 1000); // wait for 5 sec for queue process
    }

    const pages = await browser.pages();

    await Promise.all(pages.map((page) => page.close()));

    await browser.close();

    return true;
}

export default getItemsByQuery;
