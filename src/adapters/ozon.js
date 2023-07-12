import fs from "node:fs";
import path from "node:path";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

// import browserClose from "../helpers/browser-close.js";
import { logQueue } from "../helpers/log-msg.js";
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
import autoScroll from "../helpers/auto-scroll.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import goSettings from "../helpers/go-settings.js";
import logMsg from "../helpers/log-msg.js";
import sleep from "../helpers/sleep.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "ozon";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

function log(msg, id) {
    return logMsg(msg, id, prefix);
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
    log("Try to get reviews", id);

    if (!link) {
        const dbItem = getItem(prefix, id);

        if (dbItem?.link) {
            link = dbItem.link;
            log("Link found in DB", id);
        } else {
            log(`${id} not found in db`);
            return false;
        }
    }

    if (!browser) {
        log("Browser not defined!");
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
                log(`No reviews found by timeout`, id);
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
            log(error.message, id);
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

            addReview(prefix, id, reviewId, reviewItem, true);
        }

        if (Object.keys(resultReviews).length == reviews.length) {
            log(`All reviews found`, id);
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

        log(`Found ${reviews.length} reviews`, id);

        if (reviews.length) {
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
        } else {
            log("Ended", id);

            isReviews = true;

            if (page?.close) {
                await page.close();
                page = undefined;
            }

            updateTime(prefix, id);
            updateTags(prefix, id, options.query);

            // await browserClose(browser);
            // return false;
        }

        clearReviewsTimeout();

        let prevScrollHeight = undefined;
        let emptyDiffCount = 0;

        if (isLinksNavigation > 1) {
            log(`Process ${isLinksNavigation} reviews pages`, id);

            for (let pageId = 2; pageId <= isLinksNavigation; pageId++) {
                log(`Go to reviews page ${pageId}`, id);

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
                            log("End by count", id);

                            isReviews = true;
                        }

                        // console.log(id, "scroll tick", diff);
                    } else {
                        prevScrollHeight = scrollHeight;
                    }
                }
            }
        }

        log(`Process ${Object.keys(resultReviews).length} reviews`, id);

        if (Object.keys(resultReviews).length) {
            for (const reviewId in resultReviews) {
                const reviewItem = resultReviews[reviewId];

                addReview(prefix, id, reviewId, reviewItem, true);

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
        }

        updateTime(prefix, id);
        updateTags(prefix, id, options.query);

        // await page.close();
        // await browserClose(browser);
    } catch (error) {
        log(`Error: ${error.message}`, id);

        // await page.close();
        // await browserClose(browser);
    }

    if (page?.close) {
        await page.close();
        page = undefined;
    }

    log("Ended", id);

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
    const browser = await puppeteer.launch({
        headless: options.headless,
        devtools: options.headless ? false : true,
    });

    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

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
    const items = getItems(prefix, true);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item?.reviews?.length) {
            return false;
        }

        for (const reviewId of item.reviews) {
            const reviewItem = getReview(prefix, itemId, reviewId);

            if (reviewItem?.content?.photos?.length) {
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

            if (reviewItem?.content?.videos?.length) {
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
 * Get items by query
 *
 * @param   {Object}  queue  Queue instance
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {
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

                log(`Try to get page ${pageId}`);

                let page;

                try {
                    page = await createPage(browser, true);

                    await page.goto(
                        `https://ozon.by/search/?from_global=true&text=${query}&page=${pageId}`,
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

                    log(`Page ${pageId} items ${items.length} before filter`);

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

                        const dbReviewItem = getItem(prefix, id);

                        if (
                            dbReviewItem?.time &&
                            Date.now() - dbReviewItem.time <= time &&
                            !options.force
                        ) {
                            log(`Already updated by time`, id);
                            return false;
                        }

                        return true;
                    });

                    log(`Page ${pageId} items ${items.length} after filter`);

                    if (!beforeFilterCount) {
                        log(`Page ${pageId} items not found`);

                        pageId = options.pages + 1;
                        ended = true;
                        return true;
                    }

                    for (const result of items) {
                        const id = parseInt(
                            result.slice(result.lastIndexOf("-") + 1),
                            10
                        );

                        addItem(prefix, id, {
                            link: result,
                        });

                        log(`Add item ${id} on page ${pageId} for process`);

                        queue.add(
                            () => getOzonItem(result, id, queue, browser),
                            {
                                priority: priorities.item,
                            }
                        );
                    }

                    log(`Found ${items.length} items on page ${pageId}`);
                } catch (error) {
                    log(`Page ${pageId} failed: ${error.message}`);
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
