import path from "node:path";

import axios from "axios";

import {
    addItem,
    addReview,
    getItem,
    getItems,
    getReview,
    updateItem,
    updateTags,
    updateTime,
} from "../helpers/db.js";
import downloadItem from "../helpers/download.js";
import getHeaders from "../helpers/get-headers.js";
import logMsg from "../helpers/log-msg.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "onliner";

function log(msg, id) {
    return logMsg(msg, id, prefix);
}

/**
 * Update item prices
 *
 * @param   {String}  id     Item ID
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Rtsult
 */
export async function updateItemPrices(id, queue) {
    log("Try to update item prices", id);

    const dbItem = getItem(prefix, id);

    if (!dbItem) {
        log("Not found in DB");
        return false;
    }

    for (const monthFilter of ["2m", "12m"]) {
        await queue.add(
            async () => {
                log(`Try to update item prices for ${monthFilter}`, id);

                try {
                    const priceRequest = await axios(
                        `https://catalog.api.onliner.by/products/${dbItem.key}/prices-history?period=${monthFilter}`,
                        {
                            headers: getHeaders(),
                            timeout: options.timeout,
                        }
                    );

                    // const { chart_data, sale } = priceRequest.data;

                    updateItem(prefix, id, {
                        prices: priceRequest.data,
                    });

                    // if (
                    //     !("prices" in onlinerDb.data[id]) ||
                    //     !onlinerDb.data[id].prices
                    // ) {
                    //     onlinerDb.data[id].prices = priceRequest.data;
                    // } else {
                    //     if (onlinerDb.data[id].prices.chart_data) {
                    //         onlinerDb.data[id].prices.chart_data.items.push(
                    //             ...chart_data.items
                    //         );
                    //     } else {
                    //         onlinerDb.data[id].prices.chart_data = chart_data;
                    //     }

                    //     if (onlinerDb.data[id].prices.sale) {
                    //         onlinerDb.data[id].prices.sale.min_prices_median =
                    //             sale.min_prices_median;
                    //     } else {
                    //         onlinerDb.data[id].prices.sale = sale;
                    //     }
                    // }

                    // onlinerDb.write();
                } catch (error) {
                    log(
                        `Update item prices for ${monthFilter} error: ${error.message}`,
                        id
                    );
                }
            },
            { priority: priorities.item }
        );
    }

    // onlinerDb.data[id].prices.chart_data.items = onlinerDb.data[
    //     id
    // ].prices.chart_data.items.filter(
    //     (item, index, array) => array.indexOf(item) === index
    // );
    // onlinerDb.write();

    return false;
}

/**
 * Update item reviews
 *
 * @param   {String}  id     Item ID
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateItemReviews(id, queue) {
    log("Try to update", id);

    const dbItem = getItem(prefix, id);

    if (!dbItem) {
        log("Not found in DB");
        return false;
    }

    let totalPages = options.pages;

    for (let pageId = 1; pageId <= totalPages; pageId++) {
        await queue.add(
            async () => {
                try {
                    log("Get item reviews", id);

                    const itemRequest = await axios(
                        `https://catalog.onliner.by/sdapi/catalog.api/products/${dbItem.key}/reviews?order=created_at:desc`,
                        {
                            headers: getHeaders(),
                            timeout: options.timeout,
                        }
                    );

                    let { reviews, page } = itemRequest.data;

                    totalPages = page.last;

                    log(`${reviews.length} reviews get`, id);

                    for (const review of reviews) {
                        addReview(prefix, id, review.id, review, true);
                    }
                } catch (error) {
                    log(`Get item reviews error: ${error.message}`, id);
                }
            },
            { priority: priorities.item }
        );
    }

    return false;
}

/**
 * Update items
 *
 * @param   {Object}  queue  Queue instanec
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    for (const itemId of items) {
        await updateItemReviews(itemId, queue);
        await updateItemPrices(itemId, queue);

        updateTime(prefix, itemId);
    }

    return true;
}

/**
 * Update reviews
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateReviews(queue) {
    const items = getItems(prefix);

    log(`Update ${items.length} items reviews`);

    for (const itemId of items) {
        const item = getItem(prefix, itemId);

        if (!item?.reviews?.length) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const review = getReview(prefix, itemId, reviewId);

            if (!review.images || !review.images.length) {
                continue;
            }

            for (const imageObject of review.images) {
                downloadItem(
                    imageObject.original,
                    path.resolve(
                        options.directory,
                        "download",
                        "onliner",
                        itemId,
                        path.basename(imageObject.original)
                    ),
                    queue
                );
            }
        }
    }

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue) {
    log(`Get items for query: ${options.query}`);

    let totalPages = options.pages;

    const time = options.time * 60 * 60 * 1000;

    for (let pageId = options.start; pageId <= totalPages; pageId++) {
        await queue.add(
            async () => {
                try {
                    log(`Get items on page ${pageId}`);

                    const request = await axios(
                        `https://www.onliner.by/sdapi/catalog.api/search/products?query=${options.query}&page=${pageId}`,
                        {
                            headers: getHeaders(),
                            timeout: options.timeout,
                        }
                    );

                    let { products, page } = request.data;

                    totalPages = page.last;

                    for (const product of products) {
                        addItem(prefix, product.id, product);

                        const item = getItem(prefix, product.id);

                        if (
                            item?.time &&
                            Date.now() - item.time <= time &&
                            !options.force
                        ) {
                            log(`Already updated by time`, product.id);
                            continue;
                        }

                        if ("deleted" in item && item.deleted) {
                            continue;
                        }

                        await updateItemReviews(product.id, queue);
                        await updateItemPrices(product.id, queue);

                        updateTime(prefix, product.id);
                        updateTags(prefix, product.id, options.query);
                    }
                } catch (error) {
                    log(`Get items on page ${pageId} error: ${error.message}`);
                }
            },
            { priority: priorities.page }
        );
    }

    return true;
}
