import fs from "node:fs";
import path from "node:path";

import axios from "axios";
// import cheerio from "cheerio";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { updateTime, updateTags, addReview, getItems } from "../helpers/db.js";
import autoScroll from "../helpers/auto-scroll.js";
import createPage from "../helpers/create-page.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import sleep from "../helpers/sleep.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const decathlonAdapter = new JSONFileSync(
    path.resolve(dbPath, "decathlon.json")
);
const decathlonDb = new LowSync(decathlonAdapter);

decathlonDb.read();

if (!decathlonDb.data) {
    decathlonDb.data = {};
    decathlonDb.write();
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
        return log(`[Decathlon] ${query}: ${id} - ${msg}`);
    }

    return log(`[Decathlon] ${query}: ${msg}`);
}

/**
 * Get reviews for item
 *
 * @param   {String}  id     Item ID
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function getReviews(id, queue) {
    if (!id) {
        logMsg("ID not defined!");
        return false;
    }

    const dbItem = decathlonDb.data[id];

    if (!dbItem) {
        logMsg("Item not found in DB", id);
        return false;
    }

    const itemsPerPage = 20;

    if (!("reviews" in decathlonDb.data[id])) {
        decathlonDb.data[id].reviews = {};
        decathlonDb.write();
    }

    for (const configuration of dbItem.configurations) {
        const { model_id } = configuration;

        let totalPages = 100500;

        const reviews = [];

        for (let pageId = 1; pageId <= totalPages; pageId++) {
            logMsg(`Get reviews for model ${model_id} on page ${pageId}`, id);

            await queue.add(
                async () => {
                    try {
                        const request = await axios(
                            `https://reviews.decathlon.com/api/en_US/review/list?offer=${model_id}&site=1132&type=1&origin=https%3A%2F%2Fwww.decathlon.com&page=6&sort=createdAt&direction=desc&notes=&nb=${itemsPerPage}&page=${pageId}`
                        );

                        let {
                            items,
                            total_item_count,
                            item_number_per_page,
                            current_page_number,
                        } = request.data;

                        reviews.push(...items);

                        // console.log(
                        //     current_page_number,
                        //     item_number_per_page,
                        //     total_item_count,
                        //     items.length
                        // );

                        logMsg(
                            `Found ${items.length} of ${reviews.length}/${total_item_count} on page ${current_page_number}`,
                            id
                        );

                        if (!items.length) {
                            pageId = totalPages + 1;
                            return false;
                        }

                        if (total_item_count && totalPages == 100500) {
                            totalPages = Math.round(
                                total_item_count / item_number_per_page + 1
                            );

                            logMsg(`Set total pages to ${totalPages}`, id);

                            if (!total_item_count) {
                                pageId = totalPages + 1;
                                return false;
                            }
                        }
                    } catch (error) {
                        logMsg(`Get error reviews error: ${error.message}`, id);
                    }
                },
                { priority: priorities.review }
            );
        }

        for (const item of reviews) {
            addReview(decathlonDb, id, item.id, item, "Decathlon");
        }

        logMsg(`All reviews get for model ${model_id}`, id);
    }

    updateTime(decathlonDb, id);
    updateTags(decathlonDb, id, options.query);

    logMsg(`All models get`, id);

    return true;
}

/**
 * Get all items from pages
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function getItemsOnPages(queue) {
    logMsg(`Get items for ${options.query}`);

    const browser = await puppeteer.launch({
        headless: options.headless,
        devtools: options.headless ? false : true,
    });

    await queue.add(
        async () => {
            const page = await createPage(browser, false);
            await page.setRequestInterception(true);

            page.on("response", async (response) => {
                const url = response.url();

                let data;

                if (
                    !url.includes(
                        "https://decathlon-search.enterprise.adeptmind.ai"
                    )
                ) {
                    return false;
                }

                try {
                    data = await response.json();
                } catch (error) {
                    console.log(error.message);
                    return false;
                }

                const { products, payload } = data;

                logMsg(`Found ${products.length}`);

                for (const product of products) {
                    if (!(product.shopify_product_id in decathlonDb.data)) {
                        logMsg(`Add new product ${product.shopify_product_id}`);
                        decathlonDb.data[product.shopify_product_id] = product;
                        decathlonDb.write();
                    }
                }
            });

            try {
                await page.goto(
                    `https://www.decathlon.com/search?q=${options.query}`,
                    goSettings
                );

                await autoScroll(page);

                let isPagination = await page.$(
                    'a[aria-label="Go to next page"]'
                );

                logMsg(`Is more items found: ${isPagination}`);

                if (isPagination) {
                    let pageId = 2;

                    while (isPagination) {
                        logMsg(`Get page ${pageId}`);

                        await page.click('a[aria-label="Go to next page"]');

                        await autoScroll(page);

                        isPagination = await page.$(
                            'a[aria-label="Go to next page"]'
                        );

                        pageId++;
                    }
                }

                // wait 5 sec for items load
                await sleep(60000);

                // const pageRequest = await axios(
                //     "https://decathlon-search.enterprise.adeptmind.ai/query?shopId=dc2bc6f9-e0b9-4fa8-9678-3aacb9640f23&fields=domain,products,promoted_products,query,segments,suggestions,doc_num,payload,term_suggestions,applied_term_suggestions,corrected_query,prev_query,stack_view_suggestion",
                //     {
                //         credentials: "omit",
                //         headers: getHeaders(),
                //         body: {
                //             segments: [],
                //             query: "wetsuit",
                //             start: page * 40,
                //             size: 40,
                //             distinct_id: "9eb07765-90ca-5756-b6c3-d007262bb99c",
                //             session_id: "ac390166-583a-581d-aa8a-dfa05b5565af",
                //             search_id: "0c795ceb-7219-5980-a342-bd596b1ef4f3",
                //             query_id: "115658d9-1326-5992-ae22-bab29be8b5cf",
                //             shop_id: "dc2bc6f9-e0b9-4fa8-9678-3aacb9640f23",
                //             domain: "shopifygeneric",
                //         },
                //         referrer: "https://www.decathlon.com/",
                //         method: "POST",
                //         mode: "cors",
                //     }
                // );

                // const { products } = pageRequest.data;

                // if (!products.length) {
                //     return false;
                // }

                // console.log(products.map((item) => item.product_type));
                // console.log(products.length);

                // for (const product of products) {
                //     if (!(product.shopify_product_id in decathlonDb.data)) {
                //         logMsg(`Add new product ${product.shopify_product_id}`);
                //         decathlonDb.data[product.shopify_product_id] = product;
                //         decathlonDb.write();
                //     }
                // }

                // return true;
            } catch (error) {
                logMsg(
                    `Get items for ${options.query} error: ${error.message}`
                );
                console.log(error.message);
                return false;
            }

            // logMsg("Close page");

            await page.close();

            return true;
        },
        { priority: priorities.page }
    );

    // logMsg("Close browser");

    await browser.close();

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
    decathlonDb.read();

    const items = getItems(decathlonDb, "Decathlon");

    logMsg(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            return false;
        }

        for (const reviewId in item.reviews) {
            const review = item.reviews[reviewId];

            if (review.body_html.includes("img")) {
                console.log(review.body_html);
            }
        }
    });

    while (queue.size) {
        await sleep(100);
    }

    return true;
}

/**
 * Update items
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    decathlonDb.read();

    const items = getItems(decathlonDb, "Decathlon");

    logMsg(`Update ${items.length} items`);

    for (const itemId of items) {
        await getReviews(itemId, queue);
    }

    while (queue.size) {
        await sleep(100);
    }

    return true;
}

/**
 * Get items from pages
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue) {
    logMsg("Get items");

    await getItemsOnPages(queue);

    return true;
}

export default getItemsByQuery;
