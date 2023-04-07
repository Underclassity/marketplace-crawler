import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import options from "../options.js";
import log from "../helpers/log.js";
import priorities from "../helpers/priorities.js";
import downloadItem from "../helpers/download.js";

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

export async function getFeedback(id, feedback, query, queue) {
    if (!("reviews" in wildberriesDb.data[id])) {
        wildberriesDb.data[id].reviews = {};
        wildberriesDb.write();
    }

    if (!(feedback.id in wildberriesDb.data[id].reviews)) {
        wildberriesDb.data[id].reviews[feedback.id] = feedback;
        wildberriesDb.write();
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

export async function getItemInfo(id, query) {
    logMsg(`Get full info`, id);

    try {
        const request = await axios(
            "https://feedbacks.wildberries.ru/api/v1/summary/full",
            {
                data: {
                    imtId: id,
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

export async function getFeedbacks(id, query, queue) {
    queue.add(
        async () => {
            logMsg(`Feedbacks get`, id);

            const fullInfo = await getItemInfo(id, query);

            if (!wildberriesDb.data[id]) {
                wildberriesDb.data[id] = {};
                wildberriesDb.write();
            }

            if (!("reviews" in wildberriesDb.data[id])) {
                wildberriesDb.data[id].reviews = {};
                wildberriesDb.write();
            }

            wildberriesDb.data[id].time = Date.now();
            wildberriesDb.write();

            if (!fullInfo) {
                logMsg(`No feedbacks found`, id);

                return false;
            }

            logMsg(`Found ${fullInfo.feedbackCountWithPhoto} feedbacks`, id);

            const itterations = Math.round(
                fullInfo.feedbackCountWithPhoto / 30
            );

            for (let i = 0; i <= itterations; i++) {
                queue.add(
                    async () => {
                        const itterData = await feedbacksRequest(
                            id,
                            query,
                            i * 30
                        );

                        if (!itterData) {
                            return false;
                        }

                        itterData.feedbacks.forEach((item) =>
                            queue.add(
                                async () =>
                                    await getFeedback(id, item, query, queue),
                                {
                                    priority: priorities.review,
                                }
                            )
                        );
                    },
                    { priority: priorities.review }
                );
            }
        },
        { priority: priorities.review }
    );
}

export async function feedbacksRequest(id, query, skip) {
    logMsg(`Get feedbacks with skip ${skip}`, id);

    try {
        const request = await axios(
            "https://feedbacks.wildberries.ru/api/v1/feedbacks/site",
            {
                data: {
                    hasPhoto: true,
                    imtId: id,
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
        console.error(error.message);
    }

    return false;
}

export async function itemsRequest(query, page = 1) {
    logMsg(`Page ${page} items get`);

    try {
        const getItemsRequest = await axios(
            `
        https://search.wb.ru/exactmatch/sng/common/v4/search?query=${query}&resultset=catalog&limit=100&sort=popular&page=4&appType=128&curr=byn&locale=by&lang=ru&dest=12358386,12358404,3,-59208&regions=1,4,22,30,31,33,40,48,66,68,69,70,80,83&emp=0&reg=1&pricemarginCoeff=1.0&offlineBonus=0&onlineBonus=0&spp=0&page=${page}
        `,
            {
                timeout: options.timeout,
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

export function updateItems(queue) {
    logMsg("Update items");

    wildberriesDb.read();

    const time = options.time * 60 * 60 * 1000;

    for (const itemId in wildberriesDb.data) {
        const item = wildberriesDb.data[itemId];

        if (item?.time && Date.now() - item.time <= time && !options.force) {
            continue;
        }

        queue.add(() => getFeedbacks(itemId, false, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

export function updateReviews(queue) {
    logMsg("Update reviews");

    wildberriesDb.read();

    for (const itemId in wildberriesDb.data) {
        const item = wildberriesDb.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const feedback = item.reviews[reviewId];

            const photos = feedback.photos.map(
                (item) =>
                    `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`
            );

            logMsg(`Try to download ${photos.length} photos`, itemId);

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

export async function getItemsByQuery(query, queue) {
    logMsg(`Get items call`);

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(() => itemsRequest(query, page), {
            priority: priorities.page,
        });

        if (!getItemsData || !getItemsData.data) {
            logMsg(`No items left`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
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
            if (query && query.length) {
                const dbReviewItem = wildberriesDb.data[itemId];

                if (dbReviewItem) {
                    if (!dbReviewItem.tags.includes(query)) {
                        dbReviewItem.tags = [query].concat(dbReviewItem.tags);
                        wildberriesDb.write();
                    }
                } else {
                    wildberriesDb.data[itemId] = {
                        tags: [query],
                    };
                    wildberriesDb.write();
                }
            }

            queue.add(async () => await getFeedbacks(itemId, query, queue), {
                priority: priorities.item,
            });
        }
    }

    return true;
}

export default getItemsByQuery;
