import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import {
    products as amazonProducts,
    reviews as amazonReviews,
} from "../libs/amazon-buddy/index.js";

import downloadItem from "../helpers/download.js";

import {
    addItem,
    addReview,
    getItem,
    getItems,
    getReview,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import { logMsg } from "../helpers/log-msg.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "amazon";

function log(msg, id) {
    return logMsg(msg, id, prefix);
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
    const dirPath = path.resolve(options.directory, "download", prefix, asin);

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    log(`Process ${review.id}`, asin);

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
    addItem(prefix, product.asin, product);

    const time = options.time * 60 * 60 * 1000;

    const dbReviewItem = getItem(prefix, product.asin);

    if (
        dbReviewItem?.time &&
        Date.now() - dbReviewItem.time <= time &&
        !options.force
    ) {
        log(`Already updated by time`, product.asin);
        return false;
    }

    await queue.add(
        async () => {
            log("Try to get reviews", product.asin);

            let reviews;

            try {
                reviews = await amazonReviews({
                    asin: product.asin,
                    number: product?.reviews?.total_reviews || 2000,
                    timeout: options.timeout,
                });
            } catch (error) {
                reviews = false;
                log(`Error get reviews: ${error.message}`, product.asin);
            }

            if (!reviews) {
                log("Reviews not found", product.asin);
                updateTime(prefix, product.asin);
                updateTags(prefix, product.asin, options.query);
                return false;
            }

            log(`Found ${reviews.result.length}`, product.asin);

            for (const reviewItem of reviews.result) {
                addReview(
                    prefix,
                    product.asin,
                    reviewItem.id,
                    reviewItem,
                    true
                );

                if (reviewItem?.photos?.length) {
                    downloadImages(product.asin, reviewItem, queue);
                }
            }

            updateTime(prefix, product.asin);
            updateTags(prefix, product.asin, options.query);
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
    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);
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
    const items = getItems(prefix);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item || !item?.reviews?.length) {
            return false;
        }

        for (const reviewId of item.reviews) {
            const reviewItem = getReview(prefix, itemId, reviewId);

            if (reviewItem) {
                downloadImages(itemId, reviewItem, queue);
            }
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
    log("Get items call");

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
                    log(`Error get from page ${page}: ${error.message}`);
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

        log(`Total products found ${total} on page ${page}`);

        await processItems(products, queue);
    }
}

export default getItemsByQuery;
