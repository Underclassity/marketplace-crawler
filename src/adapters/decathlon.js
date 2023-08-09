import axios from "axios";

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
import { logMsg } from "../helpers/log-msg.js";
import autoScroll from "../helpers/auto-scroll.js";
import createPage from "../helpers/create-page.js";
import goSettings from "../helpers/go-settings.js";
import sleep from "../helpers/sleep.js";

import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "decathlon";

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
 * Get reviews for item
 *
 * @param   {String}  itemId   Item ID
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Boolean}          Result
 */
export async function getReviews(itemId, queue) {
    if (!itemId) {
        log("ID not defined!");
        return false;
    }

    const dbItem = getItem(prefix, itemId);

    if (!dbItem) {
        log("Item not found in DB", itemId);
        return false;
    }

    const itemsPerPage = 20;

    for (const configuration of dbItem.configurations) {
        const { model_id } = configuration;

        let totalPages = 100500;

        const reviews = [];

        for (let pageId = 1; pageId <= totalPages; pageId++) {
            log(`Get reviews for model ${model_id} on page ${pageId}`, itemId);

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

                        log(
                            `Found ${items.length} of ${reviews.length}/${total_item_count} on page ${current_page_number}`,
                            itemId
                        );

                        if (!items.length) {
                            pageId = totalPages + 1;
                            return false;
                        }

                        if (total_item_count && totalPages == 100500) {
                            totalPages = Math.round(
                                total_item_count / item_number_per_page + 1
                            );

                            log(`Set total pages to ${totalPages}`, itemId);

                            if (!total_item_count) {
                                pageId = totalPages + 1;
                                return false;
                            }
                        }
                    } catch (error) {
                        log(
                            `Get error reviews error: ${error.message}`,
                            itemId
                        );
                    }
                },
                { priority: priorities.review }
            );
        }

        for (const item of reviews) {
            addReview(prefix, itemId, item.id, item, true);
        }

        log(`All reviews get for model ${model_id}`, itemId);
    }

    updateTime(prefix, itemId);
    updateTags(prefix, itemId, options.query);

    log(`All models get`, itemId);

    return true;
}

/**
 * Get all items from pages
 *
 * @param   {Object}  queue  Queue instance
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsOnPages(queue, query = options.query) {
    log(`Get items for ${options.query}`);

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

                log(`Found ${products.length}`);

                for (const product of products) {
                    addItem(prefix, product.shopify_product_id, product);
                }
            });

            try {
                await page.goto(
                    `https://www.decathlon.com/search?q=${query}`,
                    goSettings
                );

                await autoScroll(page);

                let isPagination = await page.$(
                    'a[aria-label="Go to next page"]'
                );

                log(`Is more items found: ${isPagination}`);

                if (isPagination) {
                    let pageId = 2;

                    while (isPagination) {
                        log(`Get page ${pageId}`);

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
                //         log(`Add new product ${product.shopify_product_id}`);
                //         decathlonDb.data[product.shopify_product_id] = product;
                //         decathlonDb.write();
                //     }
                // }

                // return true;
            } catch (error) {
                log(`Get items for ${options.query} error: ${error.message}`);
                console.log(error.message);
                return false;
            }

            // log("Close page");

            await page.close();

            return true;
        },
        { priority: priorities.page }
    );

    // log("Close browser");

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
    const items = getItems(prefix, true);

    log(`Update ${items.length} items reviews`);

    items.forEach((itemId) => {
        const item = getItem(prefix, itemId);

        if (!item || !item?.reviews?.length) {
            return false;
        }

        for (const reviewId of item.reviews) {
            const review = getReview(prefix, itemId, reviewId);

            if (review?.body_html?.includes("img")) {
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
    const items = getItems(prefix);

    log(`Update ${items.length} items`);

    for (const itemId of items) {
        await getReviews(itemId, queue);
    }

    while (queue.size) {
        await sleep(100);
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
 * Get items from pages
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log("Get items");

    await getItemsOnPages(queue, query);

    return true;
}

export default getItemsByQuery;
