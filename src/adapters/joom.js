import fs from "node:fs";
import path from "node:path";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import { scrollTick, autoScroll } from "../helpers/auto-scroll.js";
import { updateTime, updateTags, getItems } from "../helpers/db.js";
import browserConfig from "../helpers/browser-config.js";
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

const joomAdapter = new JSONFileSync(path.resolve(dbPath, "joom.json"));
const joomDb = new LowSync(joomAdapter);

joomDb.read();

if (!joomDb.data) {
    joomDb.data = {};
    joomDb.write();
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
        return log(`[Joom] ${query}: ${id} - ${msg}`);
    }

    return log(`[Joom] ${query}: ${msg}`);
}

/**
 * Get feedback by ID
 *
 * @param   {Number}  id        Item ID
 * @param   {Object}  feedback  Feedback object
 * @param   {Object}  queue     Queue
 *
 * @return  {Boolean}           Result
 */
export async function getFeedback(id, feedback, queue) {
    if (!id) {
        logMsg("ID not defined!");
        return false;
    }

    if (!feedback) {
        logMsg("Feedback not defined!", id);
        return false;
    }

    if (!("reviews" in joomDb.data[id])) {
        joomDb.data[id].reviews = {};
        joomDb.write();
    }

    if (!(feedback.id in joomDb.data[id].reviews)) {
        logMsg(`Add new review ${feedback.id}`, id);
        joomDb.data[id].reviews[feedback.id] = feedback;
        joomDb.write();
    }

    if (!options.download) {
        return true;
    }

    return true;
}

export async function getItem(id, browser, queue) {
    if (!id) {
        return false;
    }

    logMsg(`Try to get item`, id);

    const page = await createPage(browser, false);

    await page.setRequestInterception(true);

    let isReviewsData = true;
    let getReviewsTimeout;
    let reviewsCount;

    page.on("response", async (response) => {
        const url = response.url();
        const method = response.request().method();

        if (!url.includes("/reviews?language")) {
            return false;
        }

        if (method !== "GET") {
            return false;
        }

        try {
            let { payload } = await response.json();

            logMsg("Reviews data get", id);

            if (payload?.items?.length) {
                if (!("reviews" in joomDb.data[id])) {
                    joomDb.data[id].reviews = {};
                }

                for (const reviewItem of payload.items) {
                    if (
                        [
                            "all",
                            "withPhoto",
                            "withText",
                            "fiveStars",
                            "fourStars",
                            "threeStars",
                            "twoStars",
                            "oneStar",
                        ].includes(reviewItem.id)
                    ) {
                        continue;
                    }

                    if (!(reviewItem.id in joomDb.data[id].reviews)) {
                        logMsg(`Add new review ${reviewItem.id}`, id);
                        joomDb.data[id].reviews[reviewItem.id] = reviewItem;
                    }
                }

                joomDb.write();
            }

            if (payload.nextPageToken) {
                await page.goto(
                    `https://www.joom.com/ru/products/${id}?reviewsPage=${payload.nextPageToken}`,
                    goSettings
                );

                clearTimeout(getReviewsTimeout);
                getReviewsTimeout = setTimeout(() => {
                    if (
                        Object.keys(joomDb.data[id].reviews).length ==
                        reviewsCount
                    ) {
                        isReviewsData = false;
                        logMsg("Clear reviews data timeout", id);
                    }
                }, options.timeout);
            } else {
                isReviewsData = false;
                logMsg("Get all data", id);
            }
        } catch (error) {
            logMsg(`Get reviews error: ${error.message}`, id);
            return false;
        }
    });

    try {
        await page.goto(`https://www.joom.com/ru/products/${id}`, goSettings);

        await autoScroll(page);

        await sleep(5000);

        reviewsCount = await page.evaluate(() => {
            const buttons = Array.from(
                document.querySelectorAll("span")
            ).filter((item) => item.className.includes("count"));

            return buttons?.length
                ? parseInt(buttons[0].textContent.trim(), 10)
                : 0;
        });

        const dbReviewsCount = Object.keys(joomDb.data[id].reviews).length;

        if (reviewsCount && dbReviewsCount == reviewsCount) {
            clearTimeout(getReviewsTimeout);
            isReviewsData = false;
            logMsg(
                `Saved DB reviews ${dbReviewsCount} equal to parsed ${reviewsCount}`,
                id
            );
        } else if (!reviewsCount) {
            clearTimeout(getReviewsTimeout);
            isReviewsData = false;
            logMsg("Reviews not found", id);
        }

        while (isReviewsData) {
            await sleep(1000);

            // const isNextReviews = await page.evaluate(() => {
            //     const nextButtons = Array.from(
            //         document.querySelectorAll("a")
            //     ).filter((item) => item.href.includes("?reviewsPage="));

            //     if (nextButtons?.length) {
            //         nextButtons[0].click();

            //         return true;
            //     } else {
            //         return false;
            //     }
            // });

            // logMsg(`Get item scroll tick: ${isNextReviews}`, id);

            // if (!isNextReviews) {
            //     clearTimeout(getReviewsTimeout);
            //     isReviewsData = false;
            //     logMsg("Next button not found", id);
            // }
        }
    } catch (error) {
        logMsg(`Get item error: ${error.message}`, id);
    }

    updateTime(joomDb, id);
    updateTags(joomDb, id, options.query);

    logMsg("Close page", id);

    await page.close();

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
    joomDb.read();

    const browser = await puppeteer.launch(browserConfig);

    const items = getItems(joomDb, "Joom");

    logMsg(`Update ${items.length} items`);

    getItems(joomDb, "Joom").forEach((itemId) => {
        queue.add(() => getItem(itemId, browser, queue), {
            priority: priorities.item,
        });
    });

    while (queue.size || queue.pending || !queue.isPaused) {
        await sleep(1000);
    }

    console.dir(queue.isPaused);

    logMsg("Close browser");

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
    logMsg("Update reviews");

    joomDb.read();

    getItems(joomDb, "Joom").forEach((itemId) => {
        const item = joomDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            return false;
        }

        const itemFilepath = path.resolve(
            options.directory,
            "download",
            "joom",
            itemId
        );

        for (const reviewId in item.reviews) {
            const feedback = item.reviews[reviewId];

            if (!feedback?.media?.length) {
                continue;
            }

            for (const media of feedback.media) {
                // console.log(media);

                switch (media.type) {
                    case "image":
                        const image = media.payload.images.find((item) =>
                            item.url.includes("_original")
                        );

                        downloadItem(
                            image.url,
                            path.resolve(
                                itemFilepath,
                                path.basename(image.url)
                            ),
                            queue,
                            false
                        );

                        break;
                    case "video":
                        downloadItem(
                            media.payload.streamUrl,
                            path.resolve(
                                itemFilepath,
                                `${path
                                    .basename(media.payload.streamUrl)
                                    .replace(".m3u8", "")}.mp4`
                            ),
                            queue,
                            true
                        );
                        break;
                }
            }
        }
    });

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue) {
    logMsg(`Get items call`);

    const browser = await puppeteer.launch(browserConfig);

    const page = await createPage(browser, false);

    await page.setRequestInterception(true);

    let isData = true;
    let getDataTimeout;

    page.on("response", async (response) => {
        const url = response.url();
        // const method = response.request().method();

        if (!url.includes("search/content")) {
            return false;
        }

        // if (method !== "POST") {
        //     return false;
        // }

        let data;

        try {
            data = await response.json();

            for (const item of data.payload.items) {
                if (item.id in joomDb.data) {
                    continue;
                }

                joomDb.data[item.id] = item.content.product;

                if (joomDb.data[item.id]?.eventParams) {
                    delete joomDb.data[item.id].eventParams;
                }

                if (joomDb.data[item.id]?.patch?.eventParams) {
                    delete joomDb.data[item.id].patch.eventParams;
                }

                logMsg(`Add new item ${item.id}`);

                updateTime(joomDb, item.id);
                updateTags(joomDb, item.id, options.query);
            }

            clearTimeout(getDataTimeout);
            getDataTimeout = setTimeout(() => {
                isData = false;
                logMsg("Clear data timeout");
            }, options.timeout);
        } catch (error) {
            logMsg(`Get data error: ${error.message}`);
            return false;
        }
    });

    try {
        await page.goto(
            `https://www.joom.com/ru/search/q.${options.query}`,
            goSettings
        );

        await autoScroll(page);

        const productLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("a"))
                .map((item) => item.href)
                .filter((item, index, array) => array.indexOf(item) === index)
                .filter((item) => item.includes("/products/"));
        });

        const productIds = productLinks.map((item) =>
            item.slice(item.indexOf("/products/") + 10)
        );

        for (const id of productIds) {
            if (id in joomDb.data) {
                continue;
            }

            logMsg(`Add new item ${id}`);

            updateTime(joomDb, id);
            updateTags(joomDb, id, options.query);
        }

        const isNext = await page.evaluate(() => {
            const nextButtons = Array.from(
                document.querySelectorAll("span")
            ).filter((text) => text.textContent.includes("Показать ещё"));

            if (nextButtons?.length) {
                nextButtons[0].click();
                return true;
            } else {
                return false;
            }
        });

        if (isNext) {
            logMsg("Try load next pages");

            while (isData) {
                await scrollTick(page);
                await sleep(1000);

                logMsg("Scroll tick");
            }
        } else {
            logMsg("No pages found");
        }
    } catch (error) {
        logMsg(`Page error: ${error.message}`);
    }

    // await sleep(600000);

    logMsg("Close browser");

    await page.close();
    await browser.close();

    return true;
}

export default getItemsByQuery;
