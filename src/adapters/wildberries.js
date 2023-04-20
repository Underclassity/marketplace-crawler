import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import { updateTime, updateTags, getItems } from "../helpers/db.js";
import downloadItem from "../helpers/download.js";
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

export async function getFeedback(id, feedback, queue) {
    if (!("reviews" in wildberriesDb.data[id])) {
        wildberriesDb.data[id].reviews = {};
        wildberriesDb.write();
    }

    if (!(feedback.id in wildberriesDb.data[id].reviews)) {
        logMsg(`Add new review ${feedback.id}`, id);
        wildberriesDb.data[id].reviews[feedback.id] = feedback;
        wildberriesDb.write();
    }

    if (!options.download) {
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

export async function getItemInfo(id) {
    logMsg(`Get full info`, id);

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

        return request.data;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

export async function getFeedbacks(id, queue) {
    logMsg(`Feedbacks get`, id);

    if (!wildberriesDb.data[id]) {
        wildberriesDb.data[id] = {};
        wildberriesDb.write();
    }

    if (!("reviews" in wildberriesDb.data[id])) {
        wildberriesDb.data[id].reviews = {};
        wildberriesDb.write();
    }

    const feedbacks = [];

    let stoped = false;
    let i = 0;

    while (!stoped) {
        const itterData = await feedbacksRequest(id, i * 30);

        i++;

        if (itterData.feedbacks.length) {
            feedbacks.push(...itterData.feedbacks);
        } else {
            stoped = true;
        }
    }

    logMsg(`Found ${feedbacks.length} feedbacks items`, id);

    for (const feedback of feedbacks) {
        if (!(feedback.id in wildberriesDb.data[id].reviews)) {
            logMsg(`Add new feedback ${feedback.id}`, id);
            wildberriesDb.data[id].reviews[feedback.id] = feedback;
            wildberriesDb.write();
        }
    }

    for (const feedback of feedbacks) {
        await queue.add(async () => await getFeedback(id, feedback, queue), {
            priority: priorities.review,
        });
    }

    updateTime(wildberriesDb, id);
    updateTags(wildberriesDb, id, options.query);

    return true;
}

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
        logMsg(`Error: ${error.message}`, id);
    }

    return false;
}

export async function itemsRequest(page = 1) {
    logMsg(`Page ${page} items get`);

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
                    appType: "12",
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

export function updateItems(queue) {
    logMsg("Update items");

    wildberriesDb.read();

    getItems(wildberriesDb, "wildberries").forEach((itemId) =>
        queue.add(() => getFeedbacks(itemId, queue), {
            priority: priorities.item,
        })
    );

    return true;
}

export function updateReviews(queue) {
    logMsg("Update reviews");

    wildberriesDb.read();

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in wildberriesDb.data) {
        const item = wildberriesDb.data[itemId];

        if (item?.time && Date.now() - item.time <= time && !options.force) {
            continue;
        }

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        if ("deleted" in item && item.deleted) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const feedback = item.reviews[reviewId];

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
    }

    return true;
}

export async function getItemsByQuery(queue) {
    logMsg(`Get items call`);

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
            });

        logMsg(`Page ${page} found ${results.length} items`);

        for (const itemId of results) {
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
    }

    return true;
}

export default getItemsByQuery;
