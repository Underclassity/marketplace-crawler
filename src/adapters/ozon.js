import fs from "node:fs";
import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

// import browserClose from "../helpers/browser-close.js";
import { logQueue } from "../helpers/log-msg.js";
import { updateTime, updateTags, getItems, addReview } from "../helpers/db.js";
import autoScroll from "../helpers/auto-scroll.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/download.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import sleep from "../helpers/sleep.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const ozonAdapter = new JSONFileSync(path.resolve(dbPath, "ozon.json"));
const ozonDb = new LowSync(ozonAdapter);

ozonDb.read();

if (!ozonDb.data) {
    ozonDb.data = {};
    ozonDb.write();
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
        return log(`[Ozon] ${query}: ${id} - ${msg}`);
    }

    return log(`[Ozon] ${query}: ${msg}`);
}

/**
 * Download helper
 *
 * @param   {String}  id     Item ID
 * @param   {Object}  queue  Queue instance
 * @param   {String}  url    URL to download
 * @param   {String}  type   Download item type
 * @param   {String}  uuid   UUID
 *
 * @return  {Boolean}        Result
 */
async function download(id, queue, url, type = "photo", uuid) {
    if (url.includes(".m3u8")) {
        type = "video";
    }

    const dirPath = path.resolve(
        options.directory,
        "download",
        "ozon",
        id.toString()
    );

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    const name = `${uuid}${type == "video" ? ".mp4" : path.parse(url).ext}`;
    const itemPath = path.resolve(dirPath, name);

    downloadItem(url, itemPath, queue, type == "video");

    return false;
}

/**
 * Get ozon item by link
 *
 * @param   {String}  link     Item link
 * @param   {String}  id       Item ID
 * @param   {Object}  queue    Queue instance
 * @param   {Object}  browser  Puppeteer instance
 *
 * @return  {Boolean}          Result
 */
export async function getOzonItem(link, id, queue, browser) {
    logMsg("Try to get reviews", id);

    if (!link) {
        if (id in ozonDb.data) {
            link = ozonDb.data[id].link;
            logMsg("Link found in DB", id);
        } else {
            logMsg(`${id} not found in db`);
            return false;
        }
    }

    if (!browser) {
        logMsg("Browser not defined!");
        return false;
    }

    // const browser = await puppeteer.launch({
    //     headless: options.headless,
    //     devtools: options.headless ? false : true,
    // });

    let page = await createPage(browser, false);

    await page.setRequestInterception(true);

    let isReviews = false;
    let isLinksNavigation = false;
    let reviewsTimeout = false;
    let reviews = [];

    const resultReviews = {};

    function clearReviewsTimeout() {
        if (reviewsTimeout) {
            clearTimeout(reviewsTimeout);
        }

        reviewsTimeout = setTimeout(() => {
            if (!isReviews) {
                logMsg(`No reviews found by timeout`, id);
                isReviews = true;
            }
        }, options.timeout);
    }

    page.on("response", async (response) => {
        const url = response.url();
        const method = response.request().method();

        if (!url.includes("https://ozon.by/api/")) {
            return false;
        }

        if (method !== "POST") {
            return false;
        }

        // logMsg(`[${method}]: ${url}`, id);

        let data;

        try {
            data = await response.json();
        } catch (error) {
            console.log(error.message);
            return false;
        }

        if (!("state" in data && "reviews" in data.state)) {
            return false;
        }

        // console.log(
        //     id,
        //     data.state.paging,
        //     Object.keys(data.state.reviews).length
        // );

        for (const reviewId in data.state.reviews) {
            const reviewItem = data.state.reviews[reviewId];

            resultReviews[reviewId] = reviewItem;

            addReview(ozonDb, id, reviewId, reviewItem, "Ozon", false);
        }

        if (Object.keys(resultReviews).length == reviews.length) {
            logMsg(`All reviews found`, id);
            isReviews = true;
        }

        clearReviewsTimeout();

        // if (page) {
        //     await page.mouse.wheel({ deltaY: -1000 });
        // }
    });

    try {
        await page.goto(`${link}/reviews/?reviewsVariantMode=2`, goSettings);

        reviews = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("*"))
                .filter((element) => element.hasAttributes())
                .filter((element) => {
                    return element.getAttribute("data-review-uuid");
                })
                .map((element) => element.getAttribute("data-review-uuid"));
        });

        logMsg(`Found ${reviews.length} reviews`, id);

        if (!reviews.length) {
            logMsg("Ended", id);

            isReviews = true;

            if (page?.close) {
                await page.close();
                page = undefined;
            }

            updateTime(ozonDb, id);
            updateTags(ozonDb, id, options.query);

            // await browserClose(browser);
            // return false;
        } else {
            const reviewsPageLink = `${link}/reviews?reviewPuuid=${reviews[0]}&itemId=${id}&reviewsVariantMode=2&page=1`;

            await page.goto(reviewsPageLink, goSettings);

            await autoScroll(page);

            isLinksNavigation = await page.evaluate((link) => {
                const links = Array.from(document.querySelectorAll("a"))
                    .map((item) => item.href)
                    .filter((item) => item.includes(link))
                    .filter((item) => item.includes("page="));

                return links.length;
            }, `${link}/reviews`);
        }

        clearReviewsTimeout();

        let prevScrollHeight = undefined;
        let emptyDiffCount = 0;

        if (isLinksNavigation > 1) {
            logMsg(`Process ${isLinksNavigation} reviews pages`, id);

            for (let pageId = 2; pageId <= isLinksNavigation; pageId++) {
                logMsg(`Go to reviews page ${pageId}`, id);

                const reviewsPageLink = `${link}/reviews?reviewPuuid=${reviews[0]}&itemId=${id}&reviewsVariantMode=2&page=${pageId}`;

                await page.goto(reviewsPageLink, goSettings);

                await autoScroll(page);

                // await sleep(options.timeout);
            }

            isReviews = true;
        } else {
            while (!isReviews) {
                await sleep(10);

                if (page && !page.isClosed()) {
                    await page.mouse.wheel({ deltaY: 100 });

                    const scrollHeight = await page.evaluate(() => {
                        return document.body.scrollHeight;
                    });

                    if (prevScrollHeight) {
                        const diff = scrollHeight - prevScrollHeight;
                        prevScrollHeight = scrollHeight;

                        if (!diff) {
                            emptyDiffCount++;
                        }

                        if (emptyDiffCount > 50) {
                            logMsg("End by count", id);

                            isReviews = true;
                        }

                        // console.log(id, "scroll tick", diff);
                    } else {
                        prevScrollHeight = scrollHeight;
                    }
                }
            }
        }

        logMsg(`Process ${Object.keys(resultReviews).length} reviews`, id);

        if (Object.keys(resultReviews).length) {
            for (const reviewId in resultReviews) {
                const reviewItem = resultReviews[reviewId];

                addReview(ozonDb, id, reviewId, reviewItem, "Ozon", false);

                if (reviewItem.content.photos.length) {
                    for (const photoItem of reviewItem.content.photos) {
                        download(
                            reviewItem.itemId,
                            queue,
                            photoItem.url,
                            "photo",
                            photoItem.uuid
                        );
                    }
                }

                if (reviewItem.content.videos.length) {
                    for (const videoItem of reviewItem.content.videos) {
                        download(
                            reviewItem.itemId,
                            queue,
                            videoItem.url,
                            "video",
                            videoItem.uuid
                        );
                    }
                }
            }

            ozonDb.write();
        }

        updateTime(ozonDb, id);
        updateTags(ozonDb, id, options.query);

        // await page.close();
        // await browserClose(browser);
    } catch (error) {
        logMsg(`Error: ${error.message}`, id);

        // await page.close();
        // await browserClose(browser);
    }

    if (page?.close) {
        await page.close();
        page = undefined;
    }

    logMsg("Ended", id);

    return true;
}

/**
 * Update items
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    ozonDb.read();

    const browser = await puppeteer.launch({
        headless: options.headless,
        devtools: options.headless ? false : true,
    });

    const items = getItems(ozonDb, "Ozon");

    logMsg(`Update ${items.length} items`);

    items.forEach((itemId) => {
        const item = ozonDb.data[itemId];

        queue.add(() => getOzonItem(item.link, itemId, queue, browser), {
            priority: priorities.item,
        });
    });

    return true;
}

/**
 * Update reviews
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateReviews(queue) {
    ozonDb.read();

    const items = getItems(ozonDb, "Ozon");

    logMsg(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = ozonDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            return;
        }

        for (const reviewId in item.reviews) {
            const reviewItem = item.reviews[reviewId];

            if (reviewItem.content.photos.length) {
                for (const photoItem of reviewItem.content.photos) {
                    download(
                        reviewItem.itemId,
                        queue,
                        photoItem.url,
                        "photo",
                        photoItem.uuid
                    );
                }
            }

            if (reviewItem.content.videos.length) {
                for (const videoItem of reviewItem.content.videos) {
                    download(
                        reviewItem.itemId,
                        queue,
                        videoItem.url,
                        "video",
                        videoItem.uuid
                    );
                }
            }
        }
    });

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue) {
    const browser = await puppeteer.launch({
        headless: options.headless,
        devtools: options.headless ? false : true,
    });

    let ended = false;

    for (let pageId = options.start; pageId <= options.pages; pageId++) {
        queue.add(
            async () => {
                if (ended) {
                    return true;
                }

                logMsg(`Try to get page ${pageId}`);

                let page;

                try {
                    page = await createPage(browser, true);

                    await page.goto(
                        `https://ozon.by/search/?from_global=true&text=${options.query}&page=${pageId}`,
                        goSettings
                    );

                    await autoScroll(page);

                    // wait 5 sec for items load
                    await sleep(5000);

                    let items = await page.evaluate(() => {
                        return Array.from(
                            document.querySelector(
                                ".widget-search-result-container"
                            ).firstChild.children
                        ).map((item) => {
                            return item.firstChild
                                ? item.firstChild.href
                                : null;
                        });
                    });

                    logMsg(
                        `Page ${pageId} items ${items.length} before filter`
                    );

                    items = items
                        .filter((item) => item)
                        .sort()
                        .filter((item, index, array) => {
                            return array.indexOf(item) === index;
                        })
                        .map((link) => {
                            const ind = link.indexOf("/?asb=");

                            if (ind == -1) {
                                return link;
                            }

                            return link.slice(0, ind);
                        });

                    const beforeFilterCount = items.length;

                    items = items.filter((item) => {
                        const id = parseInt(
                            item.slice(item.lastIndexOf("-") + 1),
                            10
                        );

                        const time = options.time * 60 * 60 * 1000;

                        const dbReviewItem = ozonDb.data[id];

                        if (
                            dbReviewItem?.time &&
                            Date.now() - dbReviewItem.time <= time &&
                            !options.force
                        ) {
                            logMsg(`Already updated by time`, id);
                            return false;
                        }

                        return true;
                    });

                    logMsg(`Page ${pageId} items ${items.length} after filter`);

                    if (!beforeFilterCount) {
                        logMsg(`Page ${pageId} items not found`);

                        pageId = options.pages + 1;
                        ended = true;
                        return true;
                    }

                    for (const result of items) {
                        const id = parseInt(
                            result.slice(result.lastIndexOf("-") + 1),
                            10
                        );

                        if (!(id in ozonDb.data)) {
                            ozonDb.data[id] = {
                                link: result,
                            };
                        }

                        logMsg(`Add item ${id} on page ${pageId} for process`);

                        queue.add(
                            () => getOzonItem(result, id, queue, browser),
                            {
                                priority: priorities.item,
                            }
                        );
                    }

                    logMsg(`Found ${items.length} items on page ${pageId}`);
                } catch (error) {
                    logMsg(`Page ${pageId} failed`);
                    console.log(error.message);
                }

                if (page) {
                    await page.close();
                    page = undefined;
                }
            },
            { priority: priorities.page }
        );
    }

    // wait for all pages processed
    while (!ended || !queue.size) {
        await sleep(1000);
        logQueue(queue);
    }

    // await browserClose(browser);
}

export default getItemsByQuery;
