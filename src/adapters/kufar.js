import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import downloadItem from "../helpers/download.js";

import { logMsg } from "../helpers/log-msg.js";
import { updateTime, updateTags, getItems, getTags } from "../helpers/db.js";
import getHeaders from "../helpers/get-headers.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const kufarAdapter = new JSONFileSync(path.resolve(dbPath, "kufar.json"));
const kufarDb = new LowSync(kufarAdapter);

kufarDb.read();

if (!kufarDb.data) {
    kufarDb.data = {};
    kufarDb.write();
}

const downloadDirPath = path.resolve(options.directory, "download", "kufar");

function log(msg, id = false) {
    return logMsg(msg, id, "Kufar");
}

/**
 * Process item by given item ID
 *
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export function processItem(itemId, queue) {
    log("Update item", itemId);

    const item = kufarDb.data[itemId];

    for (const imageItem of item.images) {
        if (!imageItem?.path) {
            // console.log(itemId, imageItem);

            continue;
        }

        downloadItem(
            `https://rms.kufar.by/v1/gallery/${imageItem.path}`,
            path.resolve(
                downloadDirPath,
                itemId.toString(),
                path.parse(imageItem.path).base
            ),
            queue,
            false
        );
    }

    return true;
}

/**
 * Update all items with tags
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateWithTags(queue) {
    const tags = getTags(kufarDb, "Kufar");

    log(`Update items with tags: ${tags.join(", ")}`);

    for (const tag of tags) {
        await getItemsByQuery(queue, tag);
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
    kufarDb.read();

    const items = getItems(kufarDb, "Kufar");

    log(`Update ${items.length} items`);

    items.forEach((itemId) => processItem(itemId, queue));

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
    await updateItems(queue);

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}   queue  Queue
 * @param   {String}   query  Query
 *
 * @return  {Boolean}         Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log("Get items call");

    const maxPages = options.pages;

    let cursor = false;

    let count = 0;
    let total = 0;

    for (let pageId = options.start; pageId <= maxPages; pageId++) {
        await queue.add(
            async () => {
                try {
                    log(`Get items from page ${pageId} with cursor ${cursor}`);

                    const request = await axios(
                        "https://api.kufar.by/search-api/v1/search/rendered-paginated",
                        {
                            params: {
                                lang: "ru",
                                query: query,
                                size: 43,
                                cursor: cursor || "",
                            },

                            method: "GET",

                            headers: getHeaders(),
                            timeout: options.timeout,
                        }
                    );

                    const data = request.data;

                    if (data?.ads?.length) {
                        data.ads.forEach((ad) => {
                            if (ad.ad_id in kufarDb.data) {
                                return false;
                            }

                            log(`Add new item`, ad.ad_id);

                            kufarDb.data[ad.ad_id] = ad;
                            kufarDb.data[ad.ad_id].tags = [options.query];

                            updateTime(kufarDb, ad.ad_id, Date.now());
                            updateTags(kufarDb, ad.ad_id, options.query);

                            processItem(ad.ad_id, queue);
                        });

                        count += data.ads.length;

                        total = data.total;

                        kufarDb.write();

                        // save cursor for next page
                        const nextPagePagination = data.pagination.pages.find(
                            (item) => item.label == "next"
                        );

                        if (nextPagePagination) {
                            cursor = nextPagePagination.token;
                        } else {
                            log("End pages get");
                            pageId = maxPages;
                        }
                    } else {
                        log("End pages get");
                        pageId = maxPages;
                    }
                } catch (error) {
                    log(`Error page ${pageId} get: ${error.message}`);
                }
            },
            { priority: priorities.page }
        );
    }

    log(`Found ${count}(${total}) items`);

    return true;
}
