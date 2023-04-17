import fs from "node:fs";
import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

// import browserClose from "../helpers/browser-close.js";
import { updateTime, updateTags } from "../helpers/db.js";
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

    // const browser = await puppeteer.launch({
    //     headless: options.headless,
    //     devtools: options.headless ? false : true,
    // });

    let page = await createPage(browser, true);

    await page.setRequestInterception(true);

    let isReviews = false;
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

        let data;

        try {
            data = await response.json();
        } catch (error) {
            console.log(error.message);
            return false;
        }

        if (!("state" in data && "reviews" in data.state)) {
            return;
        }

        // console.log(
        //     id,
        //     data.state.paging,
        //     Object.keys(data.state.reviews).length
        // );

        for (const reviewId in data.state.reviews) {
            const reviewItem = data.state.reviews[reviewId];

            if (!ozonDb.data[id].reviews) {
                ozonDb.data[id].reviews = {};
                ozonDb.write();
            }

            if (reviewId in ozonDb.data[id].reviews) {
                logMsg(`Review ${reviewId} found in DB`, id);

                continue;
            }

            resultReviews[reviewId] = reviewItem;

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
            isReviews = true;

            if (page?.close) {
                await page.close();
                page = undefined;
            }

            // await browserClose(browser);
            return false;
        }

        await page.goto(
            `${link}/reviews?reviewPuuid=${reviews[0]}&itemId=${id}&reviewsVariantMode=2`,
            goSettings
        );

        // await autoScroll(page);

        clearReviewsTimeout();

        let prevScrollHeight = undefined;
        let emptyDiffCount = 0;

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
                        isReviews = true;
                    }

                    // console.log(id, "scroll tick", diff);
                } else {
                    prevScrollHeight = scrollHeight;
                }
            }
        }

        if (Object.keys(resultReviews).length) {
            ozonDb.data[id].reviews = {};

            for (const reviewId in resultReviews) {
                if (!(reviewId in ozonDb.data[id].reviews)) {
                    logMsg(`Add new review ${reviewId}`, id);
                    ozonDb.data[id].reviews[reviewId] = resultReviews[reviewId];
                }
            }

            ozonDb.write();

            // check scroll
            if (!options.headless) {
                await sleep(60000);
            }
        }

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

export async function updateItems(queue) {
    ozonDb.read();

    const browser = await puppeteer.launch({
        headless: options.headless,
        devtools: options.headless ? false : true,
    });

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in ozonDb.data) {
        const item = ozonDb.data[itemId];

        if (item?.time && Date.now() - item.time <= time && !options.force) {
            logMsg(`Already updated by time`, itemId);
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
        }

        queue.add(() => getOzonItem(item.link, itemId, false, queue, browser), {
            priority: priorities.item,
        });
    }

    return true;
}

export async function updateReviews(queue) {
    ozonDb.read();

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in ozonDb.data) {
        const item = ozonDb.data[itemId];

        if (item?.time && Date.now() - item.time <= time && !options.force) {
            logMsg(`Already updated by time`, itemId);
            continue;
        }

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
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
    }

    return true;
}

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

                        updateTime(ozonDb, id);
                        updateTags(ozonDb, id, options.query);

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
        await sleep(100);
    }

    // await browserClose(browser);
}

export default getItemsByQuery;
