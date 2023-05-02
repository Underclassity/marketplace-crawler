import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import {
    products as amazonProducts,
    reviews as amazonReviews,
} from "../libs/amazon-buddy/index.js";

import downloadItem from "../helpers/download.js";

import log from "../helpers/log.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import { updateTime, updateTags, getItems } from "../helpers/db.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const amazonAdapter = new JSONFileSync(path.resolve(dbPath, "amazon.json"));
const amazonDb = new LowSync(amazonAdapter);

amazonDb.read();

if (!amazonDb.data) {
    amazonDb.data = {};
    amazonDb.write();
}

const downloadDirPath = path.resolve(options.directory, "download", "amazon");

function logMsg(msg, id) {
    const query = options.query || "";

    if (id) {
        return log(`[Amazon] ${query}: ${id} - ${msg}`);
    }

    return log(`[Amazon] ${query}: ${msg}`);
}

/**
 * Download product images helper
 *
 * @param   {Number}  asin    Product asin
 * @param   {Object}  review  Review object
 * @param   {Object}  queue   Queue
 *
 * @return  {Boolean}         Result
 */
async function downloadImages(asin, review, queue) {
    const dirPath = path.resolve(downloadDirPath, asin);

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    logMsg(`Process ${review.id}`, asin);

    for (const photo of review.photos) {
        const filename = path.basename(url.parse(photo).pathname);
        const imagePath = path.resolve(dirPath, filename);

        downloadItem(photo, imagePath, queue);
    }

    return true;
}

/**
 * Process item
 *
 * @param   {Object}  product  Item object
 * @param   {Object}  queue    Queue
 *
 * @return  {Boolean}          Result
 */
export async function processItem(product, queue) {
    if (!(product.asin in amazonDb.data)) {
        amazonDb.data[product.asin] = product;
        amazonDb.data[product.asin].reviews = {};
        amazonDb.write();
    }

    const time = options.time * 60 * 60 * 1000;

    const dbReviewItem = amazonDb.data[product.asin];

    if (
        dbReviewItem?.time &&
        Date.now() - dbReviewItem.time <= time &&
        !options.force
    ) {
        logMsg(`Already updated by time`, product.asin);
        return false;
    }

    await queue.add(
        async () => {
            logMsg("Try to get reviews", product.asin);

            let reviews;

            try {
                reviews = await amazonReviews({
                    asin: product.asin,
                    number: product?.reviews?.total_reviews || 2000,
                    timeout: options.timeout,
                });
            } catch (error) {
                reviews = false;
                logMsg(`Error get reviews: ${error.message}`, product.asin);
            }

            if (!reviews) {
                logMsg("Reviews not found", product.asin);
                updateTime(amazonDb, product.asin);
                updateTags(amazonDb, product.asin, options.query);
                return false;
            }

            logMsg(`Found ${reviews.result.length}`, product.asin);

            for (const reviewItem of reviews.result) {
                if (!amazonDb.data[product.asin].reviews) {
                    amazonDb.data[product.asin].reviews = {};
                }

                if (!(reviewItem.id in amazonDb.data[product.asin].reviews)) {
                    logMsg(`Add new review ${reviewItem.id}`, product.asin);

                    amazonDb.data[product.asin].reviews[reviewItem.id] =
                        reviewItem;
                    amazonDb.write();
                }

                if (reviewItem?.photos?.length) {
                    downloadImages(product.asin, reviewItem, queue);
                }
            }

            updateTime(amazonDb, product.asin);
            updateTags(amazonDb, product.asin, options.query);
        },
        { priority: priorities.item }
    );
}

/**
 * Process given items
 *
 * @param   {Array}    products  Products array
 * @param   {Object}   queue     Queue
 *
 * @return  {Boolean}            Result
 */
export async function processItems(products, queue) {
    for (const product of products) {
        await processItem(product, queue);
    }

    return true;
}

/**
 * Update items
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    logMsg("Update items");

    amazonDb.read();

    getItems(amazonDb, "Amazon").forEach((itemId) => {
        const item = amazonDb.data[itemId];
        processItem(item, queue);
    });

    return true;
}

/**
 * Update reviews helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateReviews(queue) {
    logMsg("Update reviews");

    amazonDb.read();

    getItems(amazonDb, "Amazon").forEach((itemId) => {
        const item = amazonDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews)) {
            return false;
        }

        for (const reviewId in item.reviews) {
            downloadImages(itemId, item.reviews[reviewId], queue);
        }
    });

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}   queue  Queue
 *
 * @return  {Boolean}         Result
 */
export async function getItemsByQuery(queue) {
    logMsg("Get items call");

    for (let page = options.start; page < options.pages; page++) {
        let results;

        await queue.add(
            async () => {
                try {
                    results = await amazonProducts({
                        keyword: options.query,
                        bulk: false,
                        page,
                        queue,
                        timeout: options.timeout,
                    });
                } catch (error) {
                    results = false;
                    logMsg(`Error get from page ${page}: ${error.message}`);
                }
            },
            { priority: priorities.item }
        );

        if (!results) {
            continue;
        }

        const products = results.result;
        const total = results.totalProducts;

        if (!products.length) {
            page = options.pages;
            continue;
        }

        logMsg(`Total products found ${total} on page ${page}`);

        await processItems(products, queue);
    }
}

export default getItemsByQuery;
