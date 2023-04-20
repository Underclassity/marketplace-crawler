import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { updateTags, updateTime, getItems } from "../helpers/db.js";
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

    return false;
}

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

        if (aliexpressDb.data[itemId]) {
            aliexpressDb.data[itemId] = { reviews: {} };
            aliexpressDb.write();
        }

        for (const reviewItem of reviews) {
            if (
                !(reviewItem.evaluationId in aliexpressDb.data[itemId].reviews)
            ) {
                logMsg(`Add new review ${reviewItem.evaluationId}`, itemId);

                aliexpressDb.data[itemId].reviews[reviewItem.evaluationId] =
                    reviewItem;
                aliexpressDb.write();
            }
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

export async function processPage(
    pageId,
    query = "",
    browser,
    totalFound,
    queue
) {
    aliexpressDb.read();

    logMsg(`Process page ${pageId}`);

    const page = await createPage(browser, true);

    if (options.url?.length) {
        let url = options.url;

        url = url.replace(/&page=\d+/g, "");

        await page.goto(`${url}&page=${pageId}`, goSettings);
    } else {
        const pageUrl = `https://aliexpress.com/wholesale?trafficChannel=main&d=y&CatId=0&SearchText=${query.replace(
            /\s/g,
            "+"
        )}&ltype=wholesale&SortType=total_tranpro_desc&page=${pageId}`;

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

export function updateItems(queue) {
    logMsg("Update items");

    aliexpressDb.read();

    getItems(aliexpressDb, "aliexpress").forEach((itemId) =>
        queue.add(() => scrapeItem(itemId, queue), {
            priority: priorities.item,
        })
    );

    return true;
}

export function updateReviews(queue) {
    logMsg("Update reviews");

    aliexpressDb.read();

    const time = options.time * 60 * 60 * 1000;

    const items = Object.keys(aliexpressDb.data)
        .filter((itemId) => {
            const item = aliexpressDb.data[itemId];

            if (
                item?.time &&
                Date.now() - item.time <= time &&
                !options.force
            ) {
                logMsg(`Already updated by time`, itemId);
                return false;
            }

            return true;
        })
        .filter((itemId) => {
            return "deleted" in aliexpressDb.data[itemId]
                ? !aliexpressDb.data[itemId].deleted
                : true;
        });

    for (const itemId of items) {
        const item = aliexpressDb.data[itemId];

        if (
            !item ||
            !("reviews" in item) ||
            !Object.keys(item.reviews).length
        ) {
            continue;
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
    }

    return true;
}

export async function getItemsByQuery(queue) {
    logMsg("Get items call");

    let totalFound = false;

    const browser = await puppeteer.launch(browserConfig);

    for (let page = options.start; page <= options.pages; page++) {
        await queue.add(
            async () => {
                const pagesCount = await processPage(
                    page,
                    options.query,
                    browser,
                    totalFound,
                    queue
                );

                if (pagesCount > 0 && pagesCount < options.pages) {
                    logMsg(`Set total pages to ${pagesCount}`);
                    totalFound = true;
                    options.pages = pagesCount;
                }
            },
            { priority: priorities.page }
        );
    }

    while (queue.size && queue.pending) {
        await sleep(5 * 1000);
    }

    const pages = await browser.pages();

    await Promise.all(pages.map((page) => page.close()));

    await browser.close();
}

export default getItemsByQuery;
