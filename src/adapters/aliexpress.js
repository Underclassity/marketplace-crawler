import fs from "node:fs";
import path from "node:path";

import axios from "axios";
import cheerio from "cheerio";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { getProxy } from "../helpers/proxy-helpers.js";
import { updateTags, updateTime, getItems, addReview } from "../helpers/db.js";
import autoScroll from "../helpers/auto-scroll.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/download.js";
import getHeaders from "../helpers/get-headers.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const aliexpressAdapter = new JSONFileSync(
    path.resolve(dbPath, "aliexpress.json")
);
const aliexpressDb = new LowSync(aliexpressAdapter);

aliexpressDb.read();

if (!aliexpressDb.data) {
    aliexpressDb.data = {};
    aliexpressDb.write();
}

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

function logMsg(msg, id) {
    const query = options.query || "";

    if (id) {
        return log(`[Aliexpress] ${query}: ${id} - ${msg}`);
    }

    return log(`[Aliexpress] ${query}: ${msg}`);
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
    logMsg(`Get user ${username} items`);

    const page = await createPage(browser);

    let items = [];

    for (let pageNumber = 1; pageNumber < options.pages; pageNumber++) {
        logMsg(`Process page ${pageNumber} for user ${username}`);

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
            logMsg(
                `Process page ${pageNumber} for user ${username} error: ${error.message}`
            );
        }
    }

    await page.close();

    logMsg(`Get ${items.length} for user ${username}`);

    return items;
}

/**
 * Load browser for process cache and session
 *
 * @return  {Boolean}  Result
 */
export async function processCookiesAndSession() {
    logMsg("Try to save cache");

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

        logMsg("Load start page, wait for 1 min");

        await sleep(60000);
    } catch (error) {
        logMsg(`Go to start page error: ${error.message}`);
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
        logMsg(
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
        logMsg(
            `Download ${review.evaluationId || review.id} additional review ${
                review.additionalReview.images.length
            } images`,
            id
        );

        for (let url of review.additionalReview.images) {
            if (typeof url == "object") {
                url = url.url;
            }

            const parsePath = path.parse(url);
            const name = parsePath.base;

            const itemPath = path.resolve(dirPath, name);

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

    logMsg(`Process page ${pageId}`, itemId);

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

        logMsg(`Get data on page ${pageId}`, itemId);

        reviewsData = request.data.data;
    } catch (error) {
        logMsg(`Error get reviews page ${pageId}: ${error.message}`, itemId);
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
        logMsg(`Item not defined`, itemId);
        return false;
    }

    const time = options.time * 60 * 60 * 1000;

    const dbReviewItem = aliexpressDb.data[itemId];

    if (
        dbReviewItem?.time &&
        Date.now() - dbReviewItem.time <= time &&
        !options.force
    ) {
        logMsg(`Already updated by time`, itemId);
        return false;
    }

    logMsg(`Try to get item`, itemId);

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

            logMsg(`Set max pages to ${maxPages}`, itemId);
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

        logMsg(`Reviews length ${reviews.length}`, itemId);

        for (const reviewItem of reviews) {
            addReview(
                aliexpressDb,
                itemId,
                reviewItem.evaluationId || reviewItem.id,
                reviewItem,
                "aliexpress"
            );
        }

        updateTime(aliexpressDb, itemId);
        updateTags(aliexpressDb, itemId, options.query);

        reviews = reviews
            .filter((reviewItem) => reviewItem.images)
            .filter((reviewItem) => reviewItem.images.length);

        for (const reviewItem of reviews) {
            await download(reviewItem, itemId, queue);
        }

        logMsg(`Reviews length after filter ${reviews.length}`, itemId);

        found = true;
    } catch (error) {
        logMsg(`Error reviews get: ${error.message}`, itemId);
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
    logMsg("Start scrape item", itemId);

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

    let result = false;

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
                if (ended) {
                    logMsg("Ended page get", itemId);
                    return false;
                }

                const isCaptcha = await startPage.$("#baxia-punish");
                const isCaptchaPopup = await startPage.$(".baxia-dialog");

                if (isCaptcha || isCaptchaPopup) {
                    // if (!options.headless) {
                    await sleep(Math.random() * 60 * 1000); // Waif random time, from 0 to 5 min
                    // }

                    pageId = maxPages;
                    ended = true;

                    logMsg("Captcha found", itemId);

                    return false;
                }

                logMsg(`Get reviews page ${pageId}`, itemId);

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
                    logMsg(`Set reviews max page to ${maxPages}`, itemId);
                }

                if (data?.data?.paginationStatusText) {
                    logMsg(
                        `Status page ${pageId}: ${data?.data?.paginationStatusText}`,
                        itemId
                    );
                }

                if (data?.data?.reviews?.length) {
                    logMsg(
                        `Found ${data.data.reviews.length} from ${data.data.totalAmount} reviews on reviews page ${pageId}`,
                        itemId
                    );

                    for (const reviewItem of data.data.reviews) {
                        addReview(
                            aliexpressDb,
                            itemId,
                            reviewItem.id,
                            reviewItem,
                            "Aliexpress",
                            false
                        );
                    }

                    aliexpressDb.write();

                    const sleepTime = Math.random() * options.timeout;

                    logMsg(
                        `Wait for ${Math.round(
                            sleepTime / 1000
                        )} sec on reviews page ${pageId}`,
                        itemId
                    );

                    await sleep(sleepTime); // Waif random time, from 0 to 1 min

                    logMsg(`End waiting on reviews page ${pageId}`, itemId);

                    return true;
                }

                if (data?.ret || data?.url) {
                    logMsg("Request captcha! Wait for 5 min", itemId);
                    await sleep(Math.random() * 60 * 1000);
                    return false;
                }

                logMsg("No reviews found", itemId);

                pageId = maxPages;
                ended = true;

                return true;
            },
            {
                priority: priorities.page,
            }
        );
    }

    updateTime(aliexpressDb, itemId);
    updateTags(aliexpressDb, itemId, options.query);

    result = true;

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

    logMsg("Get all reviews for item", itemId);

    if ("reviews" in aliexpressDb.data[itemId] && result) {
        const reviews = Object.keys(aliexpressDb.data[itemId].reviews)
            .map((reviewId) => aliexpressDb.data[itemId].reviews[reviewId])
            .filter((reviewItem) => {
                return reviewItem?.images?.length ||
                    reviewItem?.additionalReview?.images?.length
                    ? true
                    : false;
            });

        for (const reviewItem of reviews) {
            await download(reviewItem, itemId, queue);
        }
    }

    return true;
}

async function processPageByXhr(pageId, queue) {
    if (!pageId) {
        logMsg("Page ID not defined!");
        return false;
    }

    const pageURL = `https://www.aliexpress.com/w/wholesale-${options.query.replace(
        /\s/g,
        "-"
    )}.html?page=${pageId}`;

    try {
        logMsg(`Try to get items for page ${pageId}`);

        const request = await axios(pageURL, {
            timeout: options.timeout,
            responseType: "document",
            headers: getHeaders(),
        });

        const html = request.data;

        const $ = cheerio.load(html);

        const links = [];

        $("a").each((index, image) => {
            links.push($(image).attr("href"));
        });

        links = links
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
    } catch (error) {
        logMsg(`Get items from page ${pageId} error: ${error.message}`);
        return false;
    }

    return true;
}

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
        logMsg("Page ID not defined!");
        return false;
    }

    aliexpressDb.read();

    logMsg(`Process page ${pageId}`);

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
        logMsg("CAPTCHA!!!");
        await sleep(10000);
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

    logMsg(`Found ${items.length} on page ${pageId}`);

    for (const item of items) {
        updateTags(aliexpressDb, item, query);

        queue.add(() => scrapeItem(item, queue), { priority: priorities.item });
    }

    aliexpressDb.write();

    let pagesCount = 0;

    if (!totalFound && !options.pages) {
        try {
            pagesCount = await page.$eval(
                ".total-page",
                (el) => el.textContent
            );
        } catch (error) {
            logMsg(
                `Total pages not found on page ${pageId} error: ${error.message}`
            );
            pagesCount = 0;
        }

        const pagesRegex = /\d+/gi;

        pagesCount = parseInt(pagesRegex.exec(pagesCount), 10);

        logMsg(`Total pages count: ${pagesCount}`);
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
    aliexpressDb.read();

    const puppeteerPath = path.resolve("./puppeteer/");

    if (!fs.existsSync(puppeteerPath)) {
        fs.mkdirSync(puppeteerPath);
    }

    const browser = await puppeteer.launch(browserConfig);

    const items = getItems(aliexpressDb, "Aliexpress");

    logMsg(`Update ${items.length} items`);

    const startPage = await createPage(browser, false);

    await startPage.goto(`https://aliexpress.ru/`, goSettings);

    logMsg("Start page loaded");

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

    let count = 0;

    while (queue.size || queue.pending) {
        await sleep(1000);

        count += 1;

        if (count >= 10) {
            logMsg(
                `Queue size: page-${queue.sizeBy({
                    priority: priorities.page,
                })} items-${queue.sizeBy({
                    priority: priorities.item,
                })} reviews-${queue.sizeBy({
                    priority: priorities.review,
                })} download-${queue.sizeBy({
                    priority: priorities.download,
                })}`
            );
            count = 0;
        }
    }

    logMsg("End items update");

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
    aliexpressDb.read();

    const items = getItems(aliexpressDb, "Aliexpress");

    logMsg(`Update reviews for ${items.length}`);

    items.forEach((itemId) => {
        const item = aliexpressDb.data[itemId];

        if (
            !item ||
            !("reviews" in item) ||
            !Object.keys(item.reviews).length
        ) {
            // logMsg("Reviews not found!", itemId);
            return false;
        }

        for (const reviewId in item.reviews) {
            const reviewItem = item.reviews[reviewId];

            // if ("video" in reviewItem || "videos" in reviewItem) {
            //     console.log(reviewItem);
            // }

            if (!reviewItem.images || !reviewItem.images.length) {
                continue;
            }

            download(reviewItem, itemId, queue);
        }
    });

    while (queue.size || queue.pending) {
        await sleep(1000);
    }

    logMsg("End reviews update");

    return true;
}

/**
 * Get items by query helper
 *
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function getItemsByQuery(queue) {
    logMsg("Get items call");

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
                    options.query,
                    browser,
                    totalFound,
                    queue
                );

                if (!(pagesCount > 0 && pagesCount < options.pages)) {
                    return;
                }
                logMsg(`Set total pages to ${pagesCount}`);
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
