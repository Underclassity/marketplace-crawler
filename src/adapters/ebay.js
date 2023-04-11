import fs from "node:fs";
import path from "node:path";

import axios from "axios";
import cheerio from "cheerio";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import autoScroll from "../helpers/auto-scroll.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/download.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import updateTime from "../helpers/db.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const ebayAdapter = new JSONFileSync(path.resolve(dbPath, "ebay.json"));
const ebayDb = new LowSync(ebayAdapter);

ebayDb.read();

if (!ebayDb.data) {
    ebayDb.data = {};
    ebayDb.write();
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
        return log(`[Ebay] ${query}: ${id} - ${msg}`);
    }

    return log(`[Ebay] ${query}: ${msg}`);
}

/**
 * Get item id from link
 *
 * @param   {String}  link  Item link
 *
 * @return  {String}        Item ID
 */
function getItemId(link) {
    return link.match(/(\d+)/gim).find((item) => item.length >= 10);
}

/**
 * Get photos URLs for item by ID
 *
 * @param   {String}  itemId  Item ID
 *
 * @return  {Array}           Photos URLs array
 */
async function getPhotosURLs(itemId) {
    try {
        const request = await axios(
            `http://www.isdntek.com/fetch/fetchpgsource.php?cnt=1&deweb=1&delay=50&pg1=https%3A//www.ebay.com/itm/${itemId}%3Forig_cvip%3Dtrue%26nordt%3Dtrue`,
            {
                timeout: options.timeout,
                responseType: "document",
            }
        );

        const html = request.data;

        let $ = cheerio.load(html);

        $ = cheerio.load($("#pagesourcecode").text());

        const imageUrls = [];

        $("img").each((index, image) => {
            imageUrls.push($(image).attr("src"));
        });

        return imageUrls
            .filter((item) => item)
            .filter((imageURL) =>
                imageURL.includes("https://i.ebayimg.com/images/g/")
            )
            .filter((item, index, array) => {
                return array.indexOf(item) == index;
            })
            .map((imageURL) => ({
                id: imageURL
                    .match(/g\/(.+)\/s/gim)[0]
                    .replace("g/", "")
                    .replace("/s", ""),
                link: imageURL,
                ext: imageURL.split(".").pop(),
            }));
    } catch (error) {
        console.log(error.message);
    }

    return false;
}

export function updateItems(queue) {
    logMsg("Update items");

    ebayDb.read();

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in ebayDb.data) {
        const item = ebayDb.data[itemId];

        if (
            item &&
            item.time &&
            Date.now() - item.time <= time &&
            !options.force
        ) {
            logMsg(`Already updated by time`, item);
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
        }

        queue.add(() => getItem(itemId, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

export function updateReviews(queue) {
    logMsg("Update reviews");

    ebayDb.read();

    for (const itemId in ebayDb.data) {
        const item = ebayDb.data[itemId];

        if (
            item &&
            item.time &&
            Date.now() - item.time <= time &&
            !options.force
        ) {
            logMsg(`Already updated by time`, item);
            continue;
        }

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
        }

        const folderPath = path.resolve(
            options.directory,
            "download",
            "ebay",
            itemId
        );

        for (const reviewId in item.reviews) {
            const photoObject = item.reviews[reviewId];

            const photoURL = `https://i.ebayimg.com/images/g/${photoObject.id}/s-l1600.${photoObject.ext}`;

            const imagePath = path.resolve(
                folderPath,
                `${photoObject.id}.${photoObject.ext}`
            );

            downloadItem(photoURL, imagePath, queue);
        }
    }

    return true;
}

export async function getItem(id, queue) {
    logMsg(`Get photos`, id);

    const folderPath = path.resolve(options.directory, "download", "ebay", id);

    const photos = await getPhotosURLs(id);

    updateTime(ebayDb, id);

    for (const photoObject of photos) {
        if (!(photoObject.id in ebayDb.data[id].reviews)) {
            ebayDb.data[id].reviews[photoObject.id] = photoObject;
            ebayDb.write();
        }

        const photoURL = `https://i.ebayimg.com/images/g/${photoObject.id}/s-l1600.${photoObject.ext}`;

        const imagePath = path.resolve(
            folderPath,
            `${photoObject.id}.${photoObject.ext}`
        );

        downloadItem(photoURL, imagePath, queue);
    }

    return true;
}

export async function getItemsByQuery(query, queue) {
    const browser = await puppeteer.launch({
        headless: options.headless,
    });

    let pagesCount = options.pages;
    const itemsPerPage = 200; // 200, 100, 50, 25

    for (let pageId = 1; pageId <= pagesCount; pageId++) {
        logMsg(`Get page ${pageId}`);

        const page = await createPage(browser, true);

        await page.goto(
            `https://www.ebay.com/sch/i.html?_fsrp=1&_sop=12&_nkw=${query.replace(
                /\s/g,
                "+"
            )}&LH_ItemCondition=1500%7C1750%7C3000&rt=nc&_ipg=${itemsPerPage}&_pgn=${pageId}`,
            goSettings
        );

        await autoScroll(page);

        let itemsLinks;

        try {
            const itemsCount = await page.$eval(
                ".srp-controls__count-heading",
                (element) => parseInt(element.textContent.replace(",", ""), 10)
            );

            pagesCount = Math.floor(itemsCount / itemsPerPage) + 2;

            itemsLinks = await page.$$eval(".s-item a", (items) =>
                Array.from(items).map((item) => item.href)
            );
        } catch (error) {}

        await page.close();

        const ids = itemsLinks
            .map(getItemId)
            .map((item) => parseInt(item, 10))
            .filter((item) => item)
            .filter((item, index, array) => {
                return array.indexOf(item) == index;
            })
            .map((item) => item.toString())
            .filter((item) => {
                const time = options.time * 60 * 60 * 1000;

                const dbReviewItem = ebayDb.data[item];

                if (
                    dbReviewItem &&
                    dbReviewItem.time &&
                    Date.now() - dbReviewItem.time <= time &&
                    !options.force
                ) {
                    logMsg(`Already updated by time`, item);
                    return false;
                }

                return true;
            });

        if (!ids.length) {
            pageId = pagesCount;
            logMsg(`Items not found on page ${pageId}`);

            continue;
        }

        logMsg(`Found ${ids.length} on page ${pageId}`);

        for (const id of ids) {
            if (!(id in ebayDb.data)) {
                ebayDb.data[id] = {
                    reviews: {},
                };
                ebayDb.write();
            }

            queue.add(() => getItem(id, queue), {
                priority: priorities.item,
            });
        }
    }

    await browser.close();

    return true;
}

export default getItemsByQuery;
