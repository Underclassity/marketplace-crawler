import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import { updateTime, updateTags, getItems, addReview } from "../helpers/db.js";
import downloadItem from "../helpers/download.js";
import getHeaders from "../helpers/get-headers.js";
import log from "../helpers/log.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const wildberriesAdapter = new JSONFileSync(
    path.resolve(dbPath, "wildberries.json")
);
const wildberriesDb = new LowSync(wildberriesAdapter);

wildberriesDb.read();

if (!wildberriesDb.data) {
    wildberriesDb.data = {};
    wildberriesDb.write();
}

function logMsg(msg, id) {
    const query = options.query || "";

    if (id) {
        return log(`[Wildberries] ${query}: ${id} - ${msg}`);
    }

    return log(`[Wildberries] ${query}: ${msg}`);
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

    addReview(wildberriesDb, id, feedback.id, feedback, "wildberries");

    if (!options.download) {
        return true;
    }

    if (!feedback?.photos?.length) {
        return true;
    }

    const photos = feedback.photos.map(
        (item) => `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`
    );

    logMsg(`Try to download ${photos.length} photos`, id);

    const itemFolderPath = path.resolve(
        path.resolve(options.directory, "./download", "wildberries"),
        id.toString()
    );

    if (!fs.existsSync(itemFolderPath)) {
        fs.mkdirSync(itemFolderPath, { recursive: true });
    }

    for (const photo of photos) {
        const filename = path.parse(photo).base;
        const filepath = path.resolve(itemFolderPath, filename);

        downloadItem(photo, filepath, queue);
    }

    return true;
}

/**
 * Get item info
 *
 * @param   {Number}  id  Item ID
 *
 * @return  {Object}      Item info
 */
export async function getItemInfo(id) {
    logMsg("Try to get full info", id);

    try {
        const request = await axios(
            "https://feedbacks.wildberries.ru/api/v1/summary/full",
            {
                data: {
                    imtId: parseInt(id, 10),
                    take: 30,
                    skip: 0,
                },
                method: "POST",
                timeout: options.timeout,
            }
        );

        logMsg("Get full info", id);

        return request.data;
    } catch (error) {
        logMsg(`Get full info error: ${error.message}`, id);
    }

    return false;
}

/**
 * Get feedbacks by XHR
 *
 * @param   {String}  id  Item ID
 *
 * @return  {Array}       Feedbacks array
 */
export async function getFeedbackByXhr(id) {
    logMsg("Get all reviews by XHR", id);

    try {
        const request = await axios(
            `https://feedbacks1.wb.ru/feedbacks/v1/${id}`
        );

        const { feedbacks } = request.data;

        return feedbacks || [];
    } catch (error) {
        logMsg(`Get all reviews by XHR error: ${error.message}`);
    }

    return [];
}

/**
 * Get item price info
 *
 * @param   {Number}  id  Item ID
 *
 * @return  {Object}      Item info
 */
export async function getPriceInfo(id) {
    logMsg("Try to get price info", id);

    function p(t, e) {
        for (let i = 0; i < e.length; i++) if (t <= e[i]) return i + 1;
    }

    const h = [143, 287, 431, 719, 1007, 1061, 1115, 1169, 1313, 1601, 1655];

    const s = Math.floor(id / 1e5);
    const n = p(s, h);

    const url = `https://basket-${
        n && n >= 10 ? n : `0${n}`
    }.wb.ru/vol${s}/part${Math.floor(id / 1e3)}/${id}/info/price-history.json`;

    try {
        const request = await axios(url, {
            headers: getHeaders(),
            timeout: options.timeout,
        });

        logMsg("Get price info", id);

        return request.data;
    } catch (error) {
        logMsg(`Get price info error: ${error.message}`, id);
    }

    return false;
}

/**
 * Get feedbacks for item
 *
 * @param   {Number}  id     Item ID
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function getFeedbacks(id, queue) {
    logMsg("Feedbacks get", id);

    if (!wildberriesDb.data[id]) {
        wildberriesDb.data[id] = {};
        wildberriesDb.write();
    }

    if (!("reviews" in wildberriesDb.data[id])) {
        wildberriesDb.data[id].reviews = {};
        wildberriesDb.write();
    }

    // const feedbacks = [];

    // let stoped = false;
    // let i = 0;

    // while (!stoped) {
    //     const itterData = await feedbacksRequest(id, i * 30);

    //     i++;

    //     if (itterData?.feedbacks?.length) {
    //         feedbacks.push(...itterData.feedbacks);
    //     } else {
    //         stoped = true;
    //     }
    // }

    const feedbacks = await getFeedbackByXhr(id);

    logMsg(`Found ${feedbacks.length} feedbacks items`, id);

    for (const feedback of feedbacks) {
        addReview(
            wildberriesDb,
            id,
            feedback.id,
            feedback,
            "Wildberries",
            false
        );
    }

    wildberriesDb.write();

    for (const feedback of feedbacks) {
        queue.add(async () => getFeedback(id, feedback, queue), {
            priority: priorities.review,
        });
    }

    const priceInfo = await getPriceInfo(id);

    if (priceInfo) {
        if (!("prices" in wildberriesDb.data[id])) {
            wildberriesDb.data[id].prices = [];
        }

        for (const price of priceInfo) {
            if (!wildberriesDb.data[id].prices.includes(price)) {
                wildberriesDb.data[id].prices.push(price);
                wildberriesDb.write();
            }
        }
    }

    updateTime(wildberriesDb, id);
    updateTags(wildberriesDb, id, options.query);

    logMsg(`End get`, id);

    return true;
}

/**
 * Get feedbacks for items with offset
 *
 * @param   {Number}  id    Item ID
 * @param   {Number}  skip  Offset
 *
 * @return  {Object}        Result
 */
export async function feedbacksRequest(id, skip) {
    logMsg(`Get feedbacks with skip ${skip}`, id);

    try {
        const request = await axios(
            "https://feedbacks.wildberries.ru/api/v1/feedbacks/site",
            {
                data: {
                    hasPhoto: true,
                    imtId: parseInt(id, 10),
                    order: "dateDesc",
                    take: 30,
                    skip,
                },
                method: "POST",
                timeout: options.timeout,
            }
        );

        return request.data;
    } catch (error) {
        logMsg(`Get feedbacks with skip ${skip} error: ${error.message}`, id);
    }

    return false;
}

export async function itemsRequest(page = 1) {
    logMsg(`Page ${page} items get`);

    // https://catalog.wb.ru/catalog/sport9/catalog?cat=62247&limit=100&sort=popular&page=1&xsubject=1282&appType=128&curr=byn&locale=by&lang=ru&dest=-59208&regions=1,4,22,30,31,33,40,48,66,68,69,70,80,83,114,115&reg=1&spp=0

    try {
        const getItemsRequest = await axios(
            `https://search.wb.ru/exactmatch/sng/common/v4/search`,
            {
                timeout: options.timeout,
                params: {
                    query: options.query,
                    resultset: "catalog",
                    limit: 100,
                    sort: "popular",
                    page,
                    appType: 12,
                    curr: "byn",
                    locale: "by",
                    lang: "ru",
                    dest: "12358386,12358404,3,-59208",
                    regions: "1,4,22,30,31,33,40,48,66,68,69,70,80,83",
                    emp: 0,
                    reg: 1,
                    pricemarginCoeff: "1.0",
                    offlineBonus: 0,
                    onlineBonus: 0,
                    spp: 0,
                },
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        Msg(`Error: ${error.message}`);
    }

    return false;
}

/**
 * Update items helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateItems(queue) {
    logMsg("Update items");

    wildberriesDb.read();

    getItems(wildberriesDb, "Wildberries").forEach((itemId) =>
        queue.add(() => getFeedbacks(itemId, queue), {
            priority: priorities.item,
        })
    );

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
    wildberriesDb.read();

    const items = getItems(wildberriesDb, "Wildberries");

    logMsg(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = wildberriesDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            return false;
        }

        for (const reviewId in item.reviews) {
            const feedback = item.reviews[reviewId];

            if (!feedback?.photos?.length) {
                continue;
            }

            const photos = feedback.photos.map(
                (item) =>
                    `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`
            );

            logMsg(`Get ${photos.length} photos`, itemId);

            const itemFolderPath = path.resolve(
                path.resolve(options.directory, "./download", "wildberries"),
                itemId.toString()
            );

            if (!fs.existsSync(itemFolderPath)) {
                fs.mkdirSync(itemFolderPath, { recursive: true });
            }

            for (const photo of photos) {
                const filename = path.parse(photo).base;
                const filepath = path.resolve(itemFolderPath, filename);

                downloadItem(photo, filepath, queue);
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

    const items = [];
    let count = 0;

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(() => itemsRequest(page), {
            priority: priorities.page,
        });

        if (!getItemsData || !getItemsData.data) {
            logMsg(`No items left`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
            logMsg(`No items left`);
            page = options.pages;
            continue;
        }

        logMsg(
            `Page ${page} found ${getItemsData.data.products.length} items before filter`
        );

        count += getItemsData.data.products.length;

        const results = getItemsData.data.products
            .map((item) => item.root)
            .filter((item, index, array) => array.indexOf(item) === index)
            .map((item) => (item = parseInt(item, 10)))
            .filter((item) => {
                const dbReviewItem = wildberriesDb.data[item];
                const time = options.time * 60 * 60 * 1000;

                if (
                    dbReviewItem?.time &&
                    Date.now() - dbReviewItem.time <= time &&
                    !options.force
                ) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => a - b);

        logMsg(`Page ${page} found ${results.length} items`);

        items.push(...results);
    }

    logMsg(`Found ${items.length}(${count}) items on all pages`);

    for (const itemId of items) {
        if (options.query?.length) {
            const dbReviewItem = wildberriesDb.data[itemId];

            if (dbReviewItem) {
                if (!dbReviewItem.tags.includes(options.query)) {
                    dbReviewItem.tags = [options.query].concat(
                        dbReviewItem.tags
                    );
                    wildberriesDb.write();
                }
            } else {
                wildberriesDb.data[itemId] = {
                    tags: [options.query],
                };
                wildberriesDb.write();
            }
        }

        queue.add(() => getFeedbacks(itemId, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

export default getItemsByQuery;
