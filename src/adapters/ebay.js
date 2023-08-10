import path from "node:path";

import axios from "axios";
import { load } from "cheerio";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import {
    addItem,
    addReview,
    getItem,
    getItems,
    getTags,
    getReview,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import autoScroll from "../helpers/auto-scroll.js";
import createPage from "../helpers/create-page.js";
import downloadItem from "../helpers/image-process.js";
import getHeaders from "../helpers/get-headers.js";
import goSettings from "../helpers/go-settings.js";
import logMsg from "../helpers/log-msg.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "ebay";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

function log(msg, itemId) {
    return logMsg(msg, itemId, prefix);
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
                headers: getHeaders(),
            }
        );

        const html = request.data;

        let $ = load(html);

        $ = load($("#pagesourcecode").text());

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

/**
 * Update items
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export function updateItems(queue) {
    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) => {
        queue.add(() => getItem(itemId, queue), {
            priority: priorities.item,
        });

        return true;
    });

    return true;
}

/**
 * Update reviews
 *
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Rtsult
 */
export function updateReviews(queue) {
    const items = getItems(prefix, true);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item || !item?.reviews?.length) {
            return false;
        }

        const folderPath = path.resolve(
            options.directory,
            "download",
            "ebay",
            itemId
        );

        for (const reviewId of item.reviews) {
            const photoObject = getReview(prefix, itemId, reviewId);

            if (!photoObject?.id) {
                continue;
            }

            const photoURL = `https://i.ebayimg.com/images/g/${photoObject.id}/s-l1600.${photoObject.ext}`;

            const imagePath = path.resolve(
                folderPath,
                `${photoObject.id}.${photoObject.ext}`
            );

            downloadItem(photoURL, imagePath, queue);
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
 * Get item by ID
 *
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function getItemById(itemId, queue) {
    if (!itemId || !itemId.length) {
        return false;
    }

    log(`Get photos`, itemId);

    const folderPath = path.resolve(
        options.directory,
        "download",
        "ebay",
        itemId
    );

    const photos = await getPhotosURLs(itemId);

    updateTime(prefix, itemId);

    for (const photoObject of photos) {
        addReview(prefix, itemId, photoObject.id, photoObject, true);

        const photoURL = `https://i.ebayimg.com/images/g/${photoObject.id}/s-l1600.${photoObject.ext}`;

        const imagePath = path.resolve(
            folderPath,
            `${photoObject.id}.${photoObject.ext}`
        );

        downloadItem(photoURL, imagePath, queue);
    }

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}  queue   Queue instance
 * @param   {String}  query   Query
 *
 * @return  {Boolean}         Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    const browser = await puppeteer.launch({
        headless: options.headless,
    });

    let pagesCount = options.pages;
    const itemsPerPage = 200; // 200, 100, 50, 25

    for (let pageId = 1; pageId <= pagesCount; pageId++) {
        log(`Get page ${pageId}`);

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
        } catch (error) {
            log(error.message);
        }

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

                const dbReviewItem = getItem(prefix, item);

                if (
                    dbReviewItem?.time &&
                    Date.now() - dbReviewItem.time <= time &&
                    !options.force
                ) {
                    log(`Already updated by time`, item);
                    return false;
                }

                return true;
            });

        if (!ids.length) {
            pageId = pagesCount;
            log(`Items not found on page ${pageId}`);

            continue;
        }

        log(`Found ${ids.length} on page ${pageId}`);

        for (const id of ids) {
            addItem(prefix, id);
            updateTags(prefix, id, options.query);

            queue.add(() => getItemById(id, queue), {
                priority: priorities.item,
            });
        }
    }

    await browser.close();

    return true;
}

export default getItemsByQuery;
