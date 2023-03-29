import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import autoScroll from "../helpers/auto-scroll.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import getHeaders from "../helpers/get-headers.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
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
    if (id) {
        return log(`[Aliexpress] ${options.query}: ${id} - ${msg}`);
    }

    return log(`[Aliexpress] ${options.query}: ${msg}`);
}

export async function download(review, id, queue) {
    // console.log(review);

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

        let isSizeEqual = true;

        if (fs.existsSync(itemPath)) {
            await queue.add(
                async () => {
                    try {
                        const headRequest = await axios(url, {
                            method: "head",
                        });
                        let { headers } = headRequest;

                        const contentLength = parseInt(
                            headers["content-length"]
                        );
                        const size = fs.statSync(itemPath).size;

                        isSizeEqual = contentLength == size;

                        logMsg(
                            `Size ${name} equal ${isSizeEqual} - ${url}`,
                            id
                        );
                    } catch (error) {
                        console.log(error);
                    }
                },
                { priority: 9 }
            );
        }

        if (fs.existsSync(itemPath) && isSizeEqual) {
            logMsg(`Already downloaded ${name} - ${url}`, id);
            return true;
        }

        logMsg(`Try to download ${name} - ${url}`, id);

        queue.add(
            async () => {
                try {
                    const res = await axios(url, {
                        responseType: "stream",
                        timeout: options.timeout * 2,
                    });

                    res.data.pipe(fs.createWriteStream(itemPath));

                    logMsg(`Downloaded ${name}`, id);

                    return true;
                } catch (error) {
                    logMsg(`Download error ${name}`, id);
                    console.error(error.message);
                }
            },
            { priority: 10 }
        );
    }

    return false;
}

export async function getItemReviewsPage(itemId, pageId) {
    let reviewsData = {};

    try {
        const request = await axios(
            "https://feedback.aliexpress.com/pc/searchEvaluation.do",
            {
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

        reviewsData = request.data.data;
    } catch (error) {
        console.log(error.message);
    }

    return reviewsData;
}

export async function scrapeItem(itemId, queue) {
    logMsg(`Try to get`, itemId);

    const time = options.time * 60 * 60 * 1000;

    const dbReviewItem = aliexpressDb.data[itemId];

    if (
        dbReviewItem &&
        dbReviewItem.time &&
        Date.now() - dbReviewItem.time <= time &&
        !options.force
    ) {
        logMsg(`Already updated by time`, itemId);
        return false;
    }

    let found = false;
    let reviews = [];

    try {
        let maxPages = options.pages;

        logMsg(`Process 1`, itemId);

        const firstPageReviews = await getItemReviewsPage(itemId, 1);

        if (firstPageReviews && firstPageReviews.totalPage) {
            maxPages = firstPageReviews.totalPage || 1;

            if (Array.isArray(firstPageReviews.evaViewList)) {
                reviews.push(...firstPageReviews.evaViewList);
            }

            logMsg(`Set max pages to ${maxPages}`, itemId);
        }

        if (maxPages >= 2) {
            let stoped = false;

            for (let pageId = 2; pageId <= maxPages; pageId++) {
                await queue.add(
                    async () => {
                        if (stoped) {
                            return true;
                        }

                        logMsg(`Process ${pageId}`, itemId);

                        const jsonData = await getItemReviewsPage(
                            itemId,
                            pageId
                        );

                        if (
                            !jsonData.evaViewList ||
                            !jsonData.evaViewList.length
                        ) {
                            pageId = options.pages;
                            stoped = true;
                        } else {
                            reviews.push(...jsonData.evaViewList);
                        }
                    },
                    { priority: 9 }
                );
            }
        }

        logMsg(`Reviews length ${reviews.length}`, itemId);

        if (!("reviews" in dbReviewItem)) {
            dbReviewItem.reviews = {};
            aliexpressDb.write();
        }

        for (const reviewItem of reviews) {
            if (!(reviewItem.evaluationId in dbReviewItem.reviews)) {
                dbReviewItem.reviews[reviewItem.evaluationId] = reviewItem;
            }
        }

        dbReviewItem.time = Date.now();

        aliexpressDb.write();

        reviews = reviews
            .filter((reviewItem) => reviewItem.images)
            .filter((reviewItem) => reviewItem.images.length);

        for (const reviewItem of reviews) {
            await download(reviewItem, itemId, queue);
        }

        logMsg(`Reviews length after filter ${reviews.length}`, itemId);

        found = true;
    } catch (err) {
        console.log(itemId);
        console.log(err);
        await sleep(60000);

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

    if (options.url && options.url.length) {
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
        if (item in aliexpressDb.data) {
            if (!aliexpressDb.data[item].tags.includes(query)) {
                aliexpressDb.data[item].tags = [query].concat(
                    aliexpressDb.data[item].tags
                );
            }
        } else {
            aliexpressDb.data[item] = {
                tags: [query],
            };
        }

        queue.add(() => scrapeItem(item, queue), { priority: 9 });
    }

    aliexpressDb.write();

    let pagesCount = 0;

    if (!totalFound && !options.pages) {
        try {
            pagesCount = await page.$eval(
                ".total-page",
                (el) => el.textContent
            );
        } catch (err) {
            console.log(err);
            pagesCount = 0;
        }

        const pagesRegex = /\d+/gi;

        pagesCount = parseInt(pagesRegex.exec(pagesCount), 10);

        logMsg(`Total pages count: ${pagesCount}`);
    }

    await page.close();

    return pagesCount;
}

export async function getItemsByQuery(query, queue) {
    logMsg("Get items call");

    let totalFound = false;

    const browser = await puppeteer.launch(browserConfig);

    for (let page = options.start; page <= options.pages; page++) {
        await queue.add(
            async () => {
                const pagesCount = await processPage(
                    page,
                    query,
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
            { priority: 0 }
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
