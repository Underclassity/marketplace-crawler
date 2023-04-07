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

import options from "../options.js";
import log from "../helpers/log.js";

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

export async function processItem(product, queue) {
    logMsg("Try to get reviews", product.asin);

    if (!(product.asin in amazonDb.data)) {
        amazonDb.data[product.asin] = product;
        amazonDb.data[product.asin].reviews = {};
        amazonDb.write();
    }

    const time = options.time * 60 * 60 * 1000;

    const dbReviewItem = amazonDb.data[product.asin];

    if (
        dbReviewItem &&
        dbReviewItem.time &&
        Date.now() - dbReviewItem.time <= time &&
        !options.force
    ) {
        logMsg(`Already updated by time`, product.asin);
        return false;
    }

    queue.add(
        async () => {
            let reviews;

            try {
                reviews = await amazonReviews({
                    asin: product.asin,
                    number: product?.reviews?.total_reviews || 2000,
                });
            } catch (error) {
                reviews = false;
                logMsg("Error get reviews", product.asin);
                console.log(error.message);
            }

            if (!reviews) {
                return false;
            }

            logMsg(`Found ${reviews.result.length}`, product.asin);

            for (const reviewItem of reviews.result) {
                if (!amazonDb.data[product.asin].reviews) {
                    amazonDb.data[product.asin].reviews = {};
                }

                if (!(reviewItem.id in amazonDb.data[product.asin].reviews)) {
                    amazonDb.data[product.asin].reviews[reviewItem.id] =
                        reviewItem;
                }

                if (reviewItem?.photos?.length) {
                    downloadImages(product.asin, reviewItem, queue);
                }
            }

            dbReviewItem.time = Date.now();

            amazonDb.write();
        },
        { priority: 1 }
    );
}

export async function processItems(products, queue) {
    for (const product of products) {
        await processItem(product, queue);
    }
}

export async function updateItems(queue) {
    logMsg("Update items");

    amazonDb.read();

    for (const itemId in amazonDb.data) {
        const item = amazonDb.data[itemId];

        processItem(item, queue);
    }

    return true;
}

export async function updateReviews(queue) {
    logMsg("Update reviews");

    amazonDb.read();

    for (const itemId in amazonDb.data) {
        const item = amazonDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews)) {
            continue;
        }

        for (const reviewId in item.reviews) {
            downloadImages(itemId, item.reviews[reviewId], queue);
        }
    }

    return true;
}

export async function getItemsByQuery(query, queue) {
    logMsg("Get items call");

    for (let page = options.start; page < options.pages; page++) {
        let results;

        await queue.add(
            async () => {
                try {
                    results = await amazonProducts({
                        keyword: query,
                        bulk: false,
                        page,
                        queue,
                    });
                } catch (error) {
                    results = false;
                    logMsg(`Error get from page ${page}`);
                    console.log(error.message);
                }
            },
            { priority: 0 }
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
