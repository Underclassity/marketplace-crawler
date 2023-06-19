import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import {
    // addItem,
    // getReview,
    addReview,
    getBrands,
    getItem,
    getItems,
    getTags,
    updateBrand,
    updateItem,
    updateTags,
    updateTime,
} from "../helpers/db.js";

import downloadItem from "../helpers/download.js";
import getHeaders from "../helpers/get-headers.js";
import logMsg from "../helpers/log-msg.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "wildberries";

function log(msg, id = false) {
    return logMsg(msg, id, prefix);
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

    if (!feedback?.photos?.length) {
        return true;
    }

    const photos = feedback.photos.map(
        (item) => `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`
    );

    log(`Try to download ${photos.length} photos`, id);

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
    log("Try to get full info", id);

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

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        log("Get full info", id);

        return request.data;
    } catch (error) {
        log(`Get full info error: ${error.message}`, id);
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
    log("Get all reviews by XHR", id);

    try {
        const request = await axios(
            `https://feedbacks1.wb.ru/feedbacks/v1/${id}`,
            {
                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        const { feedbacks } = request.data;

        return feedbacks || [];
    } catch (error) {
        log(`Get all reviews by XHR error: ${error.message}`);
    }

    return false;
}

/**
 * Get item price info
 *
 * @param   {Number}  id  Item ID
 *
 * @return  {Object}      Item info
 */
export async function getPriceInfo(id) {
    log("Try to get price info", id);

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

        log("Get price info", id);

        return request.data;
    } catch (error) {
        log(`Get price info error: ${error.message}`, id);
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
    log("Feedbacks get", id);

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

    const isResult = Array.isArray(feedbacks);

    if (isResult) {
        log(`Found ${feedbacks.length} feedbacks items`, id);

        for (const feedback of feedbacks) {
            addReview(prefix, id, feedback.id, feedback, true);
        }

        for (const feedback of feedbacks) {
            queue.add(async () => getFeedback(id, feedback, queue), {
                priority: priorities.review,
            });
        }
    }

    const priceInfo = isResult ? await getPriceInfo(id) : false;

    if (priceInfo) {
        const item = getItem(prefix, id);

        if (!("prices" in item)) {
            updateItem(prefix, id, {
                prices: [],
            });
        }

        for (const price of priceInfo) {
            if (!item.prices.includes(price)) {
                updateItem(prefix, id, {
                    prices: item.prices.concat(price),
                });
            }
        }
    }

    if (isResult) {
        updateTime(prefix, id);
        updateTags(prefix, id, options.query);
    }

    log(`End get: result ${isResult}`, id);

    if (!isResult) {
        queue.add(() => getFeedbacks(id, queue), {
            priority: priorities.item,
        });
    }

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
    log(`Get feedbacks with skip ${skip}`, id);

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

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return request.data;
    } catch (error) {
        log(`Get feedbacks with skip ${skip} error: ${error.message}`, id);
    }

    return false;
}

/**
 * Get items from page by query
 *
 * @param   {Number}  page     Page number
 * @param   {String}  query    Query
 *
 * @return  {Object}           Result
 */
export async function itemsRequest(page = 1, query = options.query) {
    log(`Page ${page} items get`);

    try {
        const getItemsRequest = await axios(
            "https://search.wb.ru/exactmatch/sng/common/v4/search",
            {
                params: {
                    query,
                    resultset: "catalog",
                    limit: 100,
                    sort: "popular",
                    page,
                    appType: 12,
                    curr: "byn",
                    locale: "by",
                    lang: "ru",
                    dest: [12358386, 12358404, 3, -59208],
                    regions: [
                        1, 4, 22, 30, 31, 33, 40, 48, 66, 68, 69, 70, 80, 83,
                        114, 115,
                    ],
                    emp: 0,
                    reg: 1,
                    pricemarginCoeff: "1.0",
                    offlineBonus: 0,
                    onlineBonus: 0,
                    spp: 0,
                },

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        log(`Error: ${error.message}`);
    }

    return false;
}

/**
 * Get items for brand
 *
 * @param   {String}  brand    Brand ID
 * @param   {Number}  page     Page number
 *
 * @return  {Object}           Result
 */
export async function brandItemsRequest(brand = options.brand, page = 1) {
    log(`Brand items call for page ${page}`);

    try {
        const getItemsRequest = await axios(
            "https://catalog.wb.ru/brands/s/catalog",
            {
                params: {
                    page,
                    brand,
                    limit: 100,
                    sort: "popular",
                    appType: 128,
                    curr: "byn",
                    locale: "by",
                    lang: "ru",
                    dest: -59208,
                    regions: [
                        1, 4, 22, 30, 31, 33, 40, 48, 66, 68, 69, 70, 80, 83,
                        114, 115,
                    ],
                    reg: 1,
                    spp: 16,
                },

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        log(`Error: ${error.message}`);
    }

    return false;
}

/**
 * Process items array helper
 *
 * @param   {Array}    items    Array with items IDs
 * @param   {String}   brand    Brand ID
 * @param   {Object}   queue    Queue instance
 *
 * @return  {Boolean}          Result
 */
export async function processItems(items, brand = options.brand, queue) {
    const count = items.length;

    // Filter by updated time
    items = items.filter((item) => {
        const dbReviewItem = getItem(prefix, item);
        const time = options.time * 60 * 60 * 1000;

        if (
            dbReviewItem?.time &&
            Date.now() - dbReviewItem.time <= time &&
            !options.force
        ) {
            return false;
        }

        return true;
    });

    log(`Found ${items.length}(${count}) items on all pages`);

    for (const itemId of items) {
        const dbReviewItem = getItem(prefix, itemId);

        if (dbReviewItem) {
            updateBrand(prefix, itemId, brand);
        } else {
            updateItem(prefix, itemId, {
                brand: options.brand,
            });
        }

        queue.add(() => getFeedbacks(itemId, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

/**
 * Update items with brands helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateBrands(queue) {
    const brandIDs = getBrands(prefix);

    for (const brandID of brandIDs) {
        const brandItems = await queue.add(
            async () => getBrandItemsByID(brandID, queue),
            {
                priority: priorities.item,
            }
        );

        if (!brandItems || !brandItems.length) {
            log(`No items found for ${brandID}`);
            continue;
        }

        log(`Found ${brandItems.length || 0} items for brand ${brandID}`);

        processItems(brandItems, brandID, queue);
    }

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
 * Update items helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateItems(queue) {
    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) =>
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
    const items = getItems(prefix);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

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

            log(`Get ${photos.length} photos`, itemId);

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
 * Get brand items by brand ID
 *
 * @param   {String}  brandID  Brand ID
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Array}            Brand IDs array
 */
export async function getBrandItemsByID(brandID, queue) {
    log(`Get brand ${brandID} items call`);

    let items = [];
    let prevResults;

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(
            () => brandItemsRequest(brandID, page),
            {
                priority: priorities.page,
            }
        );

        if (!getItemsData || !getItemsData.data) {
            log(`No items found`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        log(
            `Page ${page} found ${getItemsData.data.products.length} items before filter`
        );

        const results = getItemsData.data.products
            .map((item) => item.root)
            .filter((item, index, array) => array.indexOf(item) === index)
            .map((item) => (item = parseInt(item, 10)))
            .sort((a, b) => a - b);

        log(`Page ${page} found ${results.length} items`);

        items.push(...results);

        if (prevResults) {
            const currentItemsIds = getItemsData.data.products
                .map((item) => item.id)
                .sort()
                .join("-");

            if (currentItemsIds == prevResults) {
                log(`Previous data equal to current, end get`);
                page = options.pages;
                continue;
            } else {
                prevResults = getItemsData.data.products
                    .map((item) => item.id)
                    .sort()
                    .join("-");
            }
        } else {
            prevResults = getItemsData.data.products
                .map((item) => item.id)
                .sort()
                .join("-");
        }
    }

    items = items.filter((item, index, array) => array.indexOf(item) === index);

    return items;
}

/**
 * Get items by brand
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByBrand(queue) {
    log("Get items call by brand");

    const items = await getBrandItemsByID(options.brand, queue);

    processItems(items, options.brand, queue);

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log("Get items call");

    const items = [];
    let count = 0;

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(() => itemsRequest(page, query), {
            priority: priorities.page,
        });

        if (!getItemsData || !getItemsData.data) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        log(
            `Page ${page} found ${getItemsData.data.products.length} items before filter`
        );

        count += getItemsData.data.products.length;

        const results = getItemsData.data.products
            .map((item) => item.root)
            .filter((item, index, array) => array.indexOf(item) === index)
            .map((item) => (item = parseInt(item, 10)))
            .filter((item) => {
                const dbReviewItem = getItem(prefix, item);
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

        log(`Page ${page} found ${results.length} items`);

        items.push(...results);
    }

    log(`Found ${items.length}(${count}) items on all pages`);

    for (const itemId of items) {
        queue.add(() => getFeedbacks(itemId, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

export default getItemsByQuery;
