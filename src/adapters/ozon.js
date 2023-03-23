import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import autoScroll from "../helpers/auto-scroll.js";
import browserClose from "../helpers/browser-close.js";
import commandCall from "../helpers/command-call.js";
import createPage from "../helpers/create-page.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
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
    if (id) {
        return log(`[Ozon] ${options.query}: ${id} - ${msg}`);
    }

    return log(`[Ozon] ${options.query}: ${msg}`);
}

async function download(id, query, url, type = "photo", uuid) {
    if (url.indexOf(".m3u8") != -1) {
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

    if (fs.existsSync(itemPath)) {
        logMsg(`Already downloaded ${type} ${name} - ${url}`, id);
        return true;
    }

    logMsg(`Try to download ${type} ${name} - ${url}`, id);

    if (type == "photo") {
        try {
            const res = await axios(url, {
                responseType: "stream",
                timeout: options.timeout * 2,
            });

            res.data.pipe(fs.createWriteStream(itemPath));

            logMsg(`Downloaded ${type} ${name}`, id);

            return true;
        } catch (error) {
            logMsg(`Download error ${type} ${name}`, id);
            console.error(error.message);
        }
    }

    if (type == "video") {
        const isWin = process.platform === "win32";

        try {
            const ffmpegCommand = `ffmpeg${
                isWin ? ".exe" : ""
            } -i "${url}" "${itemPath.toString()}"`;

            await commandCall(ffmpegCommand);

            logMsg(`Downloaded ${type} ${name}`, id);
        } catch (error) {
            logMsg(`Download error ${type} ${name}`, id);
            console.log(error.message);
        }
    }

    return false;
}

export async function getOzonItem(result, id, query, queue, browser) {
    logMsg(`Try to get reviews`, id);

    // const browser = await puppeteer.launch({
    //     headless: options.headless,
    //     devtools: options.headless ? false : true,
    // });

    const page = await createPage(browser, true);

    await page.setRequestInterception(true);

    let isReviews = false;
    let reviewsTimeout = false;
    let reviews = [];

    const resultReviews = {};

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
            console.log(error);
            return false;
        }

        if ("state" in data && "reviews" in data.state) {
            for (const reviewId in data.state.reviews) {
                const reviewItem = data.state.reviews[reviewId];

                if (!ozonDb.data[id].reviews) {
                    ozonDb.data[id].reviews = {};
                    ozonDb.write();
                }

                if (reviewId in ozonDb.data[id].reviews && !options.force) {
                    logMsg(`Review ${reviewId} found in DB`, id);

                    continue;
                }

                resultReviews[reviewId] = reviewItem;

                if (reviewItem.content.photos.length) {
                    for (const photoItem of reviewItem.content.photos) {
                        queue.add(
                            () =>
                                download(
                                    reviewItem.itemId,
                                    query,
                                    photoItem.url,
                                    "photo",
                                    photoItem.uuid
                                ),
                            { priority: 10 }
                        );
                    }
                }

                if (reviewItem.content.videos.length) {
                    for (const videoItem of reviewItem.content.videos) {
                        queue.add(
                            () =>
                                download(
                                    reviewItem.itemId,
                                    query,
                                    videoItem.url,
                                    "video",
                                    videoItem.uuid
                                ),
                            { priority: 10 }
                        );
                    }
                }
            }

            if (Object.keys(resultReviews).length == reviews.length) {
                logMsg(`All reviews found`, id);
                isReviews = true;
            }

            if (reviewsTimeout) {
                clearTimeout(reviewsTimeout);
                reviewsTimeout = setTimeout(() => {
                    if (!isReviews) {
                        logMsg(`No reviews found by timeout`, id);
                        isReviews = true;
                    }
                }, options.timeout);
            }
        }

        // if (page) {
        //     await page.mouse.wheel({ deltaY: -1000 });
        // }
    });

    try {
        await page.goto(`${result}/reviews/?reviewsVariantMode=2`, goSettings);

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

            if (page && page.close) {
                await page.close();
            }

            // await browserClose(browser);
            return false;
        }

        await page.goto(
            `${result}/reviews?reviewPuuid=${reviews[0]}&itemId=${id}&reviewsVariantMode=2`,
            goSettings
        );

        await autoScroll(page);

        reviewsTimeout = setTimeout(() => {
            if (!isReviews) {
                logMsg(`No reviews found by timeout`, id);
                isReviews = true;
            }
        }, options.timeout);

        while (!isReviews) {
            await sleep(100);
        }

        if (Object.keys(resultReviews).length) {
            ozonDb.data[id].reviews = {};

            for (const reviewId in resultReviews) {
                if (!(reviewId in ozonDb.data[id].reviews)) {
                    ozonDb.data[id].reviews[reviewId] = resultReviews[reviewId];
                }
            }

            ozonDb.write();
        }

        // await page.close();
        // await browserClose(browser);
    } catch (error) {
        console.log("Error", id);
        console.log(error);

        // await page.close();
        // await browserClose(browser);
    }

    if (page && page.close) {
        await page.close();
    }

    logMsg("Ended", id);

    return true;
}

export async function getItemsByQuery(query, queue) {
    const browser = await puppeteer.launch({
        headless: options.headless,
    });

    let ended = false;

    for (let pageId = 1; pageId <= options.pages; pageId++) {
        // queue.add(
        //     async () => {
        if (ended) {
            return true;
        }

        logMsg(`Try to get page ${pageId}`);

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
                    document.querySelector(".widget-search-result-container")
                        .firstChild.children
                ).map((item) => {
                    return item.firstChild ? item.firstChild.href : null;
                });
            });

            logMsg(`Page ${pageId} items ${items.length} before filter`);

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
                })
                .filter((item) => item && item.length);

            logMsg(`Page ${pageId} items ${items.length} after filter`);

            if (!items.length) {
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

                if (!(id in ozonDb.data) && !options.force) {
                    ozonDb.data[id] = {
                        link: result,
                    };

                    ozonDb.write();

                    queue.add(
                        () => getOzonItem(result, id, query, queue, browser),
                        {
                            priority: 9,
                        }
                    );

                    logMsg(`Add item ${id} on page ${pageId} for process`);
                } else {
                    logMsg(`Item ${id} on page ${pageId} already processed`);
                }
            }

            logMsg(`Found ${items.length} items on page ${pageId}`);
        } catch (error) {
            logMsg(`Page ${pageId} failed`);
            console.logMsg(error);
        }

        if (page) {
            await page.close();
        }
        //     },
        //     { priority: 1 }
        // );
    }

    // wait for all pages processed
    // while (!ended) {
    //     await sleep(100);
    // }

    await browserClose(browser);
}

export default getItemsByQuery;
