import fs from "node:fs";
import path from "node:path";

import axios from "axios";
import cheerio from "cheerio";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { updateTags, updateTime, getItems, addRewiew } from "../helpers/db.js";
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

    for (const url of review.images) {
        const parsePath = path.parse(url);
        const name = parsePath.base;

        const itemPath = path.resolve(dirPath, name);

        downloadItem(url, itemPath, queue);
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
        const request = await axios(
            "https://feedback.aliexpress.com/pc/searchEvaluation.do",
            {
                timeout: options.timeout,
                headers: getHeaders(),
                params: {
                    productId: itemId,
                    page: pageId,
                    pageSize: 10,
                    filter: "all",
                },
                method: "GET",
            }
        );

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
            addRewiew(
                aliexpressDb,
                itemId,
                reviewItem.evaluationId,
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
            // headers: getHeaders(),
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

        console.log(links.length);
        console.log(links);
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
    logMsg("Update items");

    aliexpressDb.read();

    getItems(aliexpressDb, "Aliexpress").forEach((itemId) =>
        queue.add(() => scrapeItem(itemId, queue), {
            priority: priorities.item,
        })
    );

    while (queue.size || queue.pending) {
        await sleep(1000);
    }

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
    logMsg("Update reviews");

    aliexpressDb.read();

    getItems(aliexpressDb, "Aliexpress").forEach((itemId) => {
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
