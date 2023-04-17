import fs from "node:fs";
import path from "node:path";

import axios from "axios";
import cheerio from "cheerio";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import { updateTime, updateTags } from "../helpers/db.js";
import getHeaders from "../helpers/get-headers.js";
import log from "../helpers/log.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import downloadItem from "../helpers/download.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const onlinerAdapter = new JSONFileSync(path.resolve(dbPath, "onliner.json"));
const onlinerDb = new LowSync(onlinerAdapter);

onlinerDb.read();

if (!onlinerDb.data) {
    onlinerDb.data = {};
    onlinerDb.write();
}

function logMsg(msg, id) {
    const query = options.query || "";

    if (id) {
        return log(`[Onliner] ${query}: ${id} - ${msg}`);
    }

    return log(`[Onliner] ${query}: ${msg}`);
}

export async function updateItemPrices(id, queue) {
    logMsg("Try to update item prices", id);

    if (!(id in onlinerDb.data)) {
        logMsg("Not found in DB");
        return false;
    }

    const dbItem = onlinerDb.data[id];

    for (const monthFilter of ["2m", "12m"]) {
        await queue.add(
            async () => {
                logMsg(`Try to update item prices for ${monthFilter}`, id);

                try {
                    const priceRequest = await axios(
                        `https://catalog.api.onliner.by/products/${dbItem.key}/prices-history?period=${monthFilter}`,
                        {
                            headers: getHeaders(),
                            timeout: options.timeout,
                        }
                    );

                    const { chart_data, sale } = priceRequest.data;

                    if (
                        !("prices" in onlinerDb.data[id]) ||
                        !onlinerDb.data[id].prices
                    ) {
                        onlinerDb.data[id].prices = priceRequest.data;
                    } else {
                        if (onlinerDb.data[id].prices.chart_data) {
                            onlinerDb.data[id].prices.chart_data.items.push(
                                ...chart_data.items
                            );
                        } else {
                            onlinerDb.data[id].prices.chart_data = chart_data;
                        }

                        if (onlinerDb.data[id].prices.sale) {
                            onlinerDb.data[id].prices.sale.min_prices_median =
                                sale.min_prices_median;
                        } else {
                            onlinerDb.data[id].prices.sale = sale;
                        }
                    }

                    onlinerDb.write();
                } catch (error) {
                    logMsg(
                        `Update item prices for ${monthFilter} error: ${error.message}`,
                        id
                    );
                }
            },
            { priority: priorities.item }
        );
    }

    onlinerDb.data[id].prices.chart_data.items = onlinerDb.data[
        id
    ].prices.chart_data.items.filter(
        (item, index, array) => array.indexOf(item) === index
    );
    onlinerDb.write();

    return false;
}

export async function updateItemReviews(id, queue) {
    logMsg("Try to update", id);

    if (!(id in onlinerDb.data)) {
        logMsg("Not found in DB");
        return false;
    }

    const dbItem = onlinerDb.data[id];

    let totalPages = options.pages;

    for (let pageId = 1; pageId <= totalPages; pageId++) {
        await queue.add(
            async () => {
                try {
                    logMsg("Get item reviews", id);

                    const itemRequest = await axios(
                        `https://catalog.onliner.by/sdapi/catalog.api/products/${dbItem.key}/reviews?order=created_at:desc`,
                        {
                            headers: getHeaders(),
                            timeout: options.timeout,
                        }
                    );

                    let { reviews, page } = itemRequest.data;

                    totalPages = page.last;

                    logMsg(`${reviews.length} reviews get`, id);

                    for (const review of reviews) {
                        if (!(review.id in onlinerDb.data[id].reviews)) {
                            logMsg(`Add new review ${review.id}`, id);

                            onlinerDb.data[id].reviews[review.id] = review;
                            onlinerDb.write();
                        }
                    }
                } catch (error) {
                    logMsg(`Get item reviews error: ${error.message}`, id);
                }
            },
            { priority: priorities.item }
        );
    }

    return false;
}

export async function updateItems(queue) {
    logMsg("Update items");

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in onlinerDb.data) {
        const item = onlinerDb.data[itemId];

        if (item?.time && Date.now() - item.time <= time && !options.force) {
            logMsg(`Already updated by time`, itemId);
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
        }

        await updateItemReviews(itemId, queue);
        await updateItemPrices(itemId, queue);

        updateTime(onlinerDb, itemId);
    }

    return true;
}

export async function updateReviews(queue) {
    logMsg("Update reviews");

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in onlinerDb.data) {
        const item = onlinerDb.data[itemId];

        if (item?.time && Date.now() - item.time <= time && !options.force) {
            logMsg(`Already updated by time`, itemId);
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
        }

        if (!("reviews" in item)) {
            continue;
        }

        if (!Object.keys(item.reviews).length) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const review = item.reviews[reviewId];

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

export async function getItemsByQuery(queue) {
    logMsg(`Get items for query: ${options.query}`);

    let totalPages = options.pages;

    const time = options.time * 60 * 60 * 1000;

    for (let pageId = options.start; pageId <= totalPages; pageId++) {
        await queue.add(
            async () => {
                try {
                    logMsg(`Get items on page ${pageId}`);

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
                        if (product.id in onlinerDb.data) {
                            if (!("reviews" in onlinerDb.data[product.id])) {
                                onlinerDb.data[product.id].reviews = {};
                                onlinerDb.write();
                            }
                        } else {
                            logMsg(`Add new product`, product.id);

                            onlinerDb.data[product.id] = product;
                            onlinerDb.data[product.id].reviews = {};
                            onlinerDb.write();
                        }

                        const item = onlinerDb.data[product.id];

                        if (
                            item?.time &&
                            Date.now() - item.time <= time &&
                            !options.force
                        ) {
                            logMsg(`Already updated by time`, product.id);
                            continue;
                        }

                        if ("deleted" in item && item.deleted) {
                            continue;
                        }

                        await updateItemReviews(product.id, queue);
                        await updateItemPrices(product.id, queue);

                        updateTime(onlinerDb, product.id);
                        updateTags(onlinerDb, product.id, options.query);
                    }
                } catch (error) {
                    logMsg(
                        `Get items on page ${pageId} error: ${error.message}`
                    );
                }
            },
            { priority: priorities.page }
        );
    }

    return true;
}
