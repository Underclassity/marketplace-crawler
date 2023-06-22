import path from "node:path";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { scrollTick, autoScroll } from "../helpers/auto-scroll.js";
import {
    addItem,
    addReview,
    getItem,
    getItems,
    getReview,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import browserConfig from "../helpers/browser-config.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import goSettings from "../helpers/go-settings.js";
import logMsg from "../helpers/log-msg.js";
import sleep from "../helpers/sleep.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "joom";

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
 * Get feedback by ID
 *
 * @param   {Number}  id        Item ID
 * @param   {Object}  feedback  Feedback object
 *
 * @return  {Boolean}           Result
 */
export async function getFeedback(id, feedback) {
    if (!id) {
        log("ID not defined!");
        return false;
    }

    if (!feedback) {
        log("Feedback not defined!", id);
        return false;
    }

    addReview(prefix, id, feedback.id, feedback, true);

    if (!options.download) {
        return true;
    }

    return true;
}

/**
 * Get item by ID
 *
 * @param   {String}  id       Item ID
 * @param   {Object}  browser  Puppeteer browser instance
 *
 * @return  {Boolean}          Result
 */
export async function getItemById(id, browser) {
    if (!id) {
        return false;
    }

    log(`Try to get item`, id);

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

            log("Reviews data get", id);

            if (payload?.items?.length) {
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

                    addReview(prefix, id, reviewItem.id, reviewItem, true);
                }
            }

            if (payload.nextPageToken) {
                await page.goto(
                    `https://www.joom.com/ru/products/${id}?reviewsPage=${payload.nextPageToken}`,
                    goSettings
                );

                clearTimeout(getReviewsTimeout);
                getReviewsTimeout = setTimeout(() => {
                    const item = getItem(prefix, id);

                    if (item.reviews.length == reviewsCount) {
                        isReviewsData = false;
                        log("Clear reviews data timeout", id);
                    }
                }, options.timeout);
            } else {
                isReviewsData = false;
                log("Get all data", id);
            }
        } catch (error) {
            log(`Get reviews error: ${error.message}`, id);
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

        const dbItem = getItem(prefix, id);

        const dbReviewsCount = dbItem.reviews.length;

        if (reviewsCount && dbReviewsCount == reviewsCount) {
            clearTimeout(getReviewsTimeout);
            isReviewsData = false;
            log(
                `Saved DB reviews ${dbReviewsCount} equal to parsed ${reviewsCount}`,
                id
            );
        } else if (!reviewsCount) {
            clearTimeout(getReviewsTimeout);
            isReviewsData = false;
            log("Reviews not found", id);
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
        log(`Get item error: ${error.message}`, id);
    }

    updateTime(prefix, id);
    updateTags(prefix, id, options.query);

    log("Close page", id);

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
    const browser = await puppeteer.launch(browserConfig);

    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) => {
        queue.add(() => getItemById(itemId, browser, queue), {
            priority: priorities.item,
        });
    });

    while (queue.size || queue.pending || !queue.isPaused) {
        await sleep(1000);
    }

    console.dir(queue.isPaused);

    log("Close browser");

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
    const items = getItems(prefix);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item?.reviews?.length) {
            return false;
        }

        const itemFilepath = path.resolve(
            options.directory,
            "download",
            "joom",
            itemId
        );

        for (const reviewId of item.reviews) {
            const feedback = getReview(prefix, itemId, reviewId);

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
export async function getItemsByQuery() {
    log(`Get items call`);

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
                const data = item.content.product;

                if (data?.eventParams) {
                    delete data.eventParams;
                }

                if (data?.patch?.eventParams) {
                    delete data.patch.eventParams;
                }

                log(`Add new item ${item.id}`);

                addItem(prefix, item.id, {
                    ...data,
                });

                updateTime(prefix, item.id);
                updateTags(prefix, item.id, options.query);
            }

            clearTimeout(getDataTimeout);
            getDataTimeout = setTimeout(() => {
                isData = false;
                log("Clear data timeout");
            }, options.timeout);
        } catch (error) {
            log(`Get data error: ${error.message}`);
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
            log(`Add new item ${id}`);

            addItem(prefix, id);

            updateTime(prefix, id);
            updateTags(prefix, id, options.query);
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
            log("Try load next pages");

            while (isData) {
                await scrollTick(page);
                await sleep(1000);

                log("Scroll tick");
            }
        } else {
            log("No pages found");
        }
    } catch (error) {
        log(`Page error: ${error.message}`);
    }

    // await sleep(600000);

    log("Close browser");

    await page.close();
    await browser.close();

    return true;
}

export default getItemsByQuery;
