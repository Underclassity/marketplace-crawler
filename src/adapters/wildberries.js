import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import {
    addItem,
    addReview,
    addUserReview,
    getBrands,
    getFiles,
    getItem,
    getItemFiles,
    getItems,
    getReview,
    getTags,
    updateBrand,
    updateItem,
    updateTags,
    updateTime,
} from "../helpers/db.js";

import { logMsg, logQueue } from "../helpers/log-msg.js";
import downloadItem from "../helpers/image-process.js";
import getHeaders from "../helpers/get-headers.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";
import queueCall from "../helpers/queue-call.js";
import sleep from "../helpers/sleep.js";

const prefix = "wildberries";

/**
 * Log helper
 *
 * @param   {String}  msg             Message
 * @param   {String}  [itemId=false]  Item ID
 *
 * @return  {Boolean}                 Result
 */
function log(msg, itemId = false) {
    return logMsg(msg, itemId, prefix);
}

// const FEEDBACK_PHOTO_SHARD_RANGE = [431, 863, 1199, 1535];

const FEEDBACK_PHOTO_SHARD_RANGE = [
    143, 287, 431, 719, 1007, 1061, 1115, 1169, 1313, 1601, 1655, 1919,
];

const REGIONS = [
    1, 4, 22, 30, 31, 33, 40, 48, 66, 68, 69, 70, 80, 83, 114, 115,
];

/**
 * Get host id by volume ID
 *
 * @param   {Number}  vol_id  Volume ID
 *
 * @return  {Number}          Host ID number
 */
export function getHostId(vol_id) {
    if (vol_id >= 0 && vol_id <= 431) {
        return 1;
    } else if (vol_id >= 432 && vol_id <= 863) {
        return 2;
    } else if (vol_id >= 864 && vol_id <= 1199) {
        return 3;
    } else if (vol_id >= 1200 && vol_id <= 1535) {
        return 4;
    } else {
        return 5;
    }

    // for (let i = 0; i < FEEDBACK_PHOTO_SHARD_RANGE.length; i++) {
    //     if (vol_id <= FEEDBACK_PHOTO_SHARD_RANGE[i]) {
    //         return i + 1;
    //     }
    // }

    // return false;
}

/**
 * Get feedback image URL by photoId
 *
 * @param   {Number}  photoId   Photo ID
 *
 * @return  {String}            Photo URL
 */
export function feedBackPhotoPath(photoId) {
    const vol_id = Math.floor(photoId / 100_000);
    const host = getHostId(vol_id, FEEDBACK_PHOTO_SHARD_RANGE);
    const part_id = Math.floor(photoId / 1000);

    if (host == undefined || part_id == undefined || vol_id == undefined) {
        debugger;
    }

    return `https://feedback${
        host && host >= 10 ? host : `0${host}`
    }.wb.ru/vol${vol_id}/part${part_id}/${photoId}/photos/fs.webp`;
}

/**
 * Get photos from feedback by `photos` property
 *
 * @param   {Object}  feedback    Feedback object
 * @param   {String}  folderPath  Item folder path
 *
 * @return  {Array}               Photos array
 */
export function getFeedbackPhotosByPhotos(feedback, folderPath) {
    if (!Array.isArray(feedback.photos)) {
        return [];
    }

    const result = [];

    feedback.photos
        .filter((item) => item.fullSizeUri.length)
        .map((item, index) => {
            const name = path.parse(item.fullSizeUri).name;
            const filename = path.parse(item.fullSizeUri).base;
            const webpFilename = `${name}.webp`;
            const filepath = path.resolve(folderPath, filename);
            const webpFilepath = path.resolve(folderPath, webpFilename);

            result.push({
                url: `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`,
                filename,
                filepath,
                webpFilename,
                webpFilepath,
                index,
            });
        });

    return result;
}

/**
 * Get photos from feedback by `photo` property
 *
 * @param   {Object}  feedback    Feedback object
 * @param   {String}  folderPath  Item folder path
 *
 * @return  {Array}               Photos array
 */
export function getFeedbackPhotosByPhoto(feedback, folderPath) {
    if (!Array.isArray(feedback.photo)) {
        return [];
    }

    const result = [];

    feedback.photo.map((photoId) => {
        const filename = `${photoId}.webp`;
        const filepath = path.resolve(folderPath, filename);

        result.push({
            url: feedBackPhotoPath(photoId),
            filename,
            filepath,
        });
    });

    return result;
}

/**
 * Get feedback by ID
 *
 * @param   {Number}  itemId    Item ID
 * @param   {Object}  feedback  Feedback object
 * @param   {Object}  queue     Queue
 *
 * @return  {Boolean}           Result
 */
export async function getFeedback(itemId, feedback, queue) {
    if (!itemId) {
        log("ID not defined!");
        return false;
    }

    if (!feedback) {
        log("Feedback not defined!", itemId);
        return false;
    }

    // await addReview(prefix, id, feedback.id, feedback);

    await addUserReview(
        prefix,
        feedback.wbUserId,
        feedback.id,
        feedback.wbUserDetails
    );

    if (!options.download) {
        return true;
    }

    if (
        !feedback?.photos?.length &&
        !feedback?.photo?.length &&
        !feedback?.video
    ) {
        return true;
    }

    const itemFolderPath = path.resolve(
        path.resolve(options.directory, "./download", "wildberries"),
        itemId.toString()
    );

    if (!fs.existsSync(itemFolderPath)) {
        fs.mkdirSync(itemFolderPath, { recursive: true });
    }

    const photos = [];

    // If two params exists - download photos for extra quality
    // if (feedback.photos && feedback.photo) {
    //     photos.push(...getFeedbackPhotosByPhotos(feedback, itemFolderPath));
    // } else {
    //     photos.push(...getFeedbackPhotosByPhotos(feedback, itemFolderPath));
    //     photos.push(...getFeedbackPhotosByPhoto(feedback, itemFolderPath));
    // }

    photos.push(...getFeedbackPhotosByPhoto(feedback, itemFolderPath));
    // photos.push(...getFeedbackPhotosByPhotos(feedback, itemFolderPath));

    const filteredPhotos = [];

    for (const photo of photos) {
        const dbFiles = await getFiles(prefix, itemId);

        if (!dbFiles) {
            filteredPhotos.push(photo);
            continue;
        }

        if (
            (dbFiles.includes(photo.filename) ||
                dbFiles.includes(photo.webpFilename)) &&
            options.force
        ) {
            continue;
        }

        filteredPhotos.push(photo);
    }

    if (filteredPhotos.length) {
        log(
            `Get ${filteredPhotos.length} photos for review ${feedback.id}`,
            itemId
        );

        for (const { url, filepath } of filteredPhotos) {
            downloadItem(url, filepath, queue);
        }
    } else {
        log(`No photos for download for review ${feedback.id}`, itemId);
    }

    if (feedback?.video) {
        const [basket, id] = feedback.video.id.split("/");
        const url = `https://videofeedback${basket.padStart(
            2,
            0
        )}.wb.ru/${id}/index.m3u8`;

        const filepath = path.resolve(
            options.directory,
            "download",
            prefix,
            itemId.toString(),
            `${id}.mp4`
        );

        downloadItem(url, filepath, queue, true);
    }

    return true;
}

/**
 * Add info to products helper
 *
 * @param   {Array}    products  Products array
 *
 * @return  {Boolean}            Result
 */
export async function addInfoToProducts(products) {
    if (!Array.isArray(products)) {
        return false;
    }

    for (const product of products) {
        const item = await getItem(prefix, parseInt(product.root, 10));

        if (!item) {
            continue;
        }

        const {
            id,
            root,
            kindId,
            subjectId,
            subjectParentId,
            name,
            brand,
            brandId,
            siteBrandId,
            supplierId,
            rating,
            reviewRating,
            feedbacks,
        } = product;

        const idObject = {
            id,
            root,
            kindId,
            subjectId,
            subjectParentId,
            name,
            brandName: brand,
            brand: brandId,
            siteBrandId,
            supplierId,
            rating,
            reviewRating,
            feedbacks,
        };

        if (
            item.ids &&
            Array.isArray(item.ids) &&
            !item.ids.map((item) => item.id).includes(id)
        ) {
            logMsg(`Add another info to item`, parseInt(product.root, 10));

            await updateItem(
                prefix,
                parseInt(product.root, 10),
                {
                    brand: brandId,
                    ids: [...item.ids, idObject],
                },
                false
            );
        } else if (
            item.ids &&
            Array.isArray(item.ids) &&
            item.ids.map((item) => item.id).includes(id)
        ) {
            const idIndex = item.ids.map((item) => item.id).indexOf(id);

            item.ids[idIndex] = idObject;

            await updateItem(
                prefix,
                parseInt(product.root, 10),
                {
                    brand: brandId,
                    ids: item.ids,
                },
                false
            );
            return true;
        } else if (!item.ids || !Array.isArray(item.ids)) {
            logMsg(`Add info to item`, parseInt(product.root, 10));

            await updateItem(
                prefix,
                parseInt(product.root, 10),
                {
                    brand: brandId,
                    ids: [idObject],
                },
                false
            );
        }
    }

    return true;
}

/**
 * Get item info
 *
 * @param   {Number}          itemId  Item ID
 *
 * @return  {Object|Boolean}          Item info
 */
export async function getItemInfo(itemId) {
    if (!itemId) {
        return false;
    }

    log("Try to get full info", itemId);

    function p(t, e) {
        for (let i = 0; i < e.length; i++) if (t <= e[i]) return i + 1;
    }

    const s = Math.floor(itemId / 1e5);
    const n = p(s, FEEDBACK_PHOTO_SHARD_RANGE);

    const url = `https://basket-${
        n && n >= 10 ? n : `0${n}`
    }.wb.ru/vol${s}/part${Math.floor(
        itemId / 1e3
    )}/${itemId}/info/ru/card.json`;

    try {
        const request = await axios(url, {
            headers: getHeaders(),
            timeout: options.timeout,
        });

        log("Get full info", itemId);

        return request.data;
    } catch (error) {
        log(`Get full info error: ${error.message}`, itemId);
    }

    // try {
    //     const request = await axios("https://card.wb.ru/cards/detail", {
    //         params: {
    //             nm: itemId,

    //             appType: 12,
    //             curr: "byn",
    //             locale: "by",
    //             lang: "ru",
    //             dest: -59208,
    //             regions: REGIONS,
    //             emp: 0,
    //             reg: 1,
    //             spp: 0,
    //         },

    //         headers: getHeaders(),
    //         timeout: options.timeout,
    //     });

    //     log("Get full info", itemId);

    //     const { data } = request.data;
    //     const { products } = data;
    //     const [product] = products;

    //     return product || false;
    // } catch (error) {
    //     log(`Get full info error: ${error.message}`, itemId);
    // }

    return false;
}

/**
 * Get item questions
 *
 * @param   {Number}          itemId  Item root ID
 *
 * @return  {Object|Boolean}          Questions object
 */
export async function getQuestions(itemId) {
    if (!itemId) {
        return false;
    }

    log(`Try to get questions`, itemId);

    try {
        const countRequest = await axios(
            `https://questions.wildberries.ru/api/v1/questions?imtId=${itemId}&onlyCount=true`,
            {
                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        const { count } = countRequest.data;

        const questions = [];

        const pagesCount = Math.round(count / 20);

        for (let page = 0; page <= pagesCount; page++) {
            const request = await axios(
                `https://questions.wildberries.ru/api/v1/questions`,
                {
                    headers: getHeaders(),
                    timeout: options.timeout,
                    params: {
                        imtId: itemId,
                        take: 20,
                        skip: page ? page * 20 : 0,
                    },
                }
            );

            questions.push(...request.data.questions);
        }

        log("Get all questions", itemId);

        return questions;
    } catch (error) {
        log(`Get all questions error: ${error.message}`, itemId);
    }

    return false;
}

/**
 * Get feedbacks by XHR
 *
 * @param   {String}  itemId          Item ID
 *
 * @return  {Array|Boolean}           Feedbacks array
 */
export async function getFeedbackByXhr(itemId) {
    if (!itemId) {
        return false;
    }

    log("Get all reviews by XHR", itemId);

    function toUintArray(input) {
        const result = new Uint8Array(8);
        for (let n = 0; n < 8; n++) {
            result[n] = input % 256;
            input = Math.floor(input / 256);
        }
        return result;
    }

    function crc16(input) {
        const t = toUintArray(input);
        let result = 0;
        for (const element of t) {
            result ^= element;
            for (let r = 0; r < 8; r++) {
                if ((1 & result) > 0) {
                    result = (result >> 1) ^ 40_961;
                } else {
                    result >>= 1;
                }
            }
        }
        return result;
    }

    const checksum = crc16(+(itemId || 0)) % 100 >= 50 ? "2" : "1";

    try {
        const link = `https://feedbacks${checksum}.wb.ru/feedbacks/v1/${itemId}`;

        const bodyRequest = await axios(link, {
            method: "head",
            headers: getHeaders(),
            timeout: 5000,
        });

        if (bodyRequest.status != 200) {
            log("Get all reviews by XHR error: Not exist");
            return false;
        }

        const request = await axios(link, {
            headers: getHeaders(),
            timeout: options.timeout,
        });

        const { feedbacks } = request.data;

        return feedbacks || [];
    } catch (error) {
        log(`Get all reviews by XHR error: ${error.message}`);
    }

    return false;
}

/**
 * Get item price info
 *
 * @param   {Number}  itemId  Item ID
 *
 * @return  {Object}          Item info
 */
export async function getPriceInfo(itemId) {
    log("Try to get price info", itemId);

    function p(t, e) {
        for (let i = 0; i < e.length; i++) if (t <= e[i]) return i + 1;
    }

    const s = Math.floor(itemId / 1e5);
    const n = p(s, FEEDBACK_PHOTO_SHARD_RANGE);

    const url = `https://basket-${
        n && n >= 10 ? n : `0${n}`
    }.wb.ru/vol${s}/part${Math.floor(
        itemId / 1e3
    )}/${itemId}/info/price-history.json`;

    try {
        const request = await axios(url, {
            headers: getHeaders(),
            timeout: options.timeout,
        });

        log("Get price info", itemId);

        return request.data;
    } catch (error) {
        log(`Get price info error: ${error.message}`, itemId);
    }

    return false;
}

/**
 * Get feedbacks for item
 *
 * @param   {Number}  itemId     Item ID
 * @param   {String}  query      Query
 * @param   {Object}  queue      Queue
 *
 * @return  {Boolean}            Result
 */
export async function getFeedbacks(itemId, query = false, queue) {
    log("Feedbacks get", itemId);

    // const feedbacks = [];

    // let stoped = false;
    // let i = 0;

    // while (!stoped) {
    //     const itterData = await feedbacksRequest(id, i * 30);

    //     i++;

    //     if (itterData?.feedbacks?.length) {
    //         feedbacks.push(...itterData.feedbacks);
    //     } else {
    //         stoped = true;
    //     }
    // }

    const feedbacks = await getFeedbackByXhr(itemId);

    const isResult = Array.isArray(feedbacks);

    if (isResult) {
        log(`Found ${feedbacks.length} feedbacks items`, itemId);

        const item = await getItem(prefix, itemId);

        for (const feedback of feedbacks) {
            if (!item.reviews.includes(feedback.id) || options.force) {
                await addReview(prefix, itemId, feedback.id, feedback);
            }
        }

        for (const feedback of feedbacks) {
            getFeedback(itemId, feedback, queue);
            // queue.add(async () => getFeedback(itemId, feedback, queue), {
            //     priority: priorities.review,
            // });
        }
    }

    const item = await getItem(prefix, itemId);

    // Try to get item info
    if (item.ids && Array.isArray(item.ids) && item.ids.length && !item.info) {
        const firstIdItem = item.ids[0];

        const infoData = await getItemInfo(firstIdItem.id);

        if (firstIdItem.name == infoData.imt_name) {
            await updateItem(prefix, itemId, {
                info: infoData,
            });
        }
    }

    // const priceInfo = isResult ? await getPriceInfo(id) : false;

    // if (priceInfo) {
    //     const item = await getItem(prefix, id);

    //     if (!item) {
    //         await addItem(prefix, id, {
    //             prices: [],
    //         });
    //     }

    //     if (item && !("prices" in item)) {
    //         await updateItem(prefix, id, {
    //             prices: [],
    //         });
    //     }

    //     for (const price of priceInfo) {
    //         if (item?.prices && !item.prices.includes(price)) {
    //             await updateItem(prefix, id, {
    //                 prices: item.prices.concat(price),
    //             });
    //         }
    //     }
    // }

    if (isResult) {
        await updateTime(prefix, itemId);

        if (query) {
            await updateTags(prefix, itemId, query);
        }
    }

    log(`End get: result ${isResult}`, itemId);

    if (!isResult) {
        queue.add(() => getFeedbacks(itemId, false, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

/**
 * Get feedbacks for items with offset
 *
 * @param   {Number}  itemId    Item ID
 * @param   {Number}  skip      Offset
 *
 * @return  {Object}            Result
 */
export async function feedbacksRequest(itemId, skip) {
    log(`Get feedbacks with skip ${skip}`, itemId);

    try {
        const request = await axios(
            "https://feedbacks.wildberries.ru/api/v1/feedbacks/site",
            {
                data: {
                    hasPhoto: true,
                    imtId: parseInt(itemId, 10),
                    order: "dateDesc",
                    take: 30,
                    skip,
                },
                method: "POST",

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return request.data;
    } catch (error) {
        log(`Get feedbacks with skip ${skip} error: ${error.message}`, itemId);
    }

    return false;
}

/**
 * Get items from page by query
 *
 * @param   {Number}  page     Page number
 * @param   {String}  query    Query
 *
 * @return  {Object}           Result
 */
export async function itemsRequest(page = 1, query = options.query) {
    log(`Page ${page} items get`);

    try {
        const getItemsRequest = await axios(
            "https://search.wb.ru/exactmatch/sng/common/v4/search",
            {
                params: {
                    query,
                    resultset: "catalog",
                    limit: 100,
                    sort: "popular",
                    page,
                    appType: 12,
                    curr: "byn",
                    locale: "by",
                    lang: "ru",
                    dest: -59_208,
                    regions: REGIONS,
                    emp: 0,
                    reg: 1,
                    pricemarginCoeff: "1.0",
                    offlineBonus: 0,
                    onlineBonus: 0,
                    spp: 0,
                },

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        log(`Error: ${error.message}`);
    }

    return false;
}

let categoriesData = null;

/**
 * Get items from page by query
 *
 * @param   {Number}  page          Page number
 * @param   {String}  categoryId    Query
 *
 * @return  {Object}                Result
 */
export async function categoryRequest(page = 1, categoryId = options.category) {
    log(`Page ${page} items get`);

    if (!categoriesData) {
        try {
            log("Try to get categories");

            const categoriesRequest = await axios(
                "https://catalog.wb.ru/menu/v10/api?lang=ru&locale=by&location=by",
                {
                    method: "GET",
                    headers: getHeaders(),
                    timeout: options.timeout,
                }
            );

            categoriesData = categoriesRequest.data.data;
        } catch (error) {
            log(`Get categories error: ${error.message}`);
        }
    }

    if (!categoriesData) {
        log("Categories not found, no request for data");

        return false;
    }

    function categoriesReducer(prev, curr) {
        if (Array.isArray(curr.nodes)) {
            prev.push(...curr.nodes.reduce(categoriesReducer, []));
        } else {
            prev.push(curr);
        }

        return prev;
    }

    const categories = categoriesData.reduce(categoriesReducer, []);

    const category = categories.find((item) => item.id == categoryId);

    const params = {
        cat: categoryId,
        limit: 100,
        sort: "popular",
        page,
        appType: 12,
        curr: "byn",
        locale: "by",
        lang: "ru",
        dest: -59_208,
        regions: REGIONS,
        emp: 0,
        reg: 1,
        pricemarginCoeff: "1.0",
        offlineBonus: 0,
        onlineBonus: 0,
        spp: 0,
    };

    if (options.subject?.length) {
        params.subject = options.subject;
    }

    if (options.xsubject?.length) {
        params.xsubject = options.xsubject;
    }

    try {
        const getItemsRequest = await axios(
            `https://catalog.wb.ru/catalog/${category.shardKey}/v1/catalog`,
            {
                params,

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        log(`Error: ${error.message}`);
    }

    return false;
}

/**
 * Get items for brand
 *
 * @param   {String}  brand    Brand ID
 * @param   {Number}  page     Page number
 *
 * @return  {Object}           Result
 */
export async function brandItemsRequest(brand = options.brand, page = 1) {
    log(`Brand ${brand} items call for page ${page}`);

    try {
        const getItemsRequest = await axios(
            "https://catalog.wb.ru/brands/s/catalog",
            {
                params: {
                    page,
                    brand,
                    limit: 100,
                    sort: "popular",
                    appType: 128,
                    curr: "byn",
                    locale: "by",
                    lang: "ru",
                    dest: -59_208,
                    regions: REGIONS,
                    reg: 1,
                    spp: 16,
                },

                headers: getHeaders(),
                timeout: options.timeout,
            }
        );

        return getItemsRequest.data;
    } catch (error) {
        log(`Brand ${brand} items call error: ${error.message}`);
    }

    return false;
}

/**
 * Process items array helper
 *
 * @param   {Array}    items    Array with items IDs
 * @param   {String}   brand    Brand ID
 * @param   {Object}   queue    Queue instance
 *
 * @return  {Boolean}          Result
 */
export async function processItems(items, brand = options.brand, queue) {
    const count = items.length;

    // Add items if not exist
    for (const itemId of items) {
        const dbReviewItem = await getItem(prefix, itemId);

        if (!dbReviewItem) {
            await addItem(prefix, itemId);
        }
    }

    const filteredItems = [];

    for (const itemId of items) {
        const dbReviewItem = await getItem(prefix, itemId);
        const time = options.time * 60 * 60 * 1000;

        if (
            dbReviewItem?.time &&
            Date.now() - dbReviewItem.time <= time &&
            !options.force
        ) {
            continue;
        }

        if (dbReviewItem.deleted) {
            continue;
        }

        filteredItems.push(itemId);
    }

    // Filter by updated time
    items = [...filteredItems];

    log(`Found ${items.length}(${count}) items on all pages`);

    for (const itemId of items) {
        const dbReviewItem = await getItem(prefix, itemId);

        if (dbReviewItem) {
            await updateBrand(prefix, itemId, brand);
        } else {
            await updateItem(prefix, itemId, {
                brand: options.brand,
            });
        }

        queue.add(() => getFeedbacks(itemId, false, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

/**
 * Update items with brands helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateBrands(queue) {
    const brandIDs = await getBrands(prefix);

    log(`Update brands: ${brandIDs.length}`);

    for (const brandID of brandIDs) {
        const brandItems = await queueCall(
            async () => getBrandItemsByID(brandID, queue),
            queue,
            priorities.page
        );

        if (!brandItems || !brandItems.length) {
            log(`No items found for ${brandID}`);
            continue;
        }

        log(`Found ${brandItems.length || 0} items for brand ${brandID}`);

        processItems(brandItems, brandID, queue);
    }

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

/**
 * Update items by category ID
 *
 * @param   {String}  categoryId  Category ID
 * @param   {Object}  queue       Queue instance
 *
 * @return  {Boolean}             Result
 */
export async function updateItemsByCategory(categoryId, queue) {
    log(`Update items by category: ${categoryId}`);

    const items = [];
    let count = 0;

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(
            () => categoryRequest(page, categoryId),
            {
                priority: priorities.page,
            }
        );

        if (!getItemsData || !getItemsData.data) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        log(
            `Page ${page} found ${getItemsData.data.products.length} items before filter`
        );

        count += getItemsData.data.products.length;

        await addInfoToProducts(getItemsData.data.products);

        const results = getItemsData.data.products
            .map((item) => item.root)
            .filter((item, index, array) => array.indexOf(item) === index)
            .map((item) => (item = parseInt(item, 10)));

        const filtedResults = [];

        for (const item of results) {
            const dbReviewItem = await getItem(prefix, item);
            const time = options.time * 60 * 60 * 1000;

            if (
                dbReviewItem?.time &&
                Date.now() - dbReviewItem.time <= time &&
                !options.force
            ) {
                continue;
            }

            if (dbReviewItem?.deleted) {
                continue;
            }

            filtedResults.push(item);
        }

        filtedResults.sort((a, b) => a - b);

        log(`Page ${page} found ${filtedResults.length} items`);

        items.push(...filtedResults);
    }

    log(`Found ${items.length}(${count}) items on all pages`);

    for (const itemId of items) {
        queue.add(() => getFeedbacks(itemId, false, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

/**
 * Get item by ID
 *
 * @param   {String}  itemId      Item ID
 * @param   {Object}  queue       Queue instance
 *
 * @return  {Boolean}             Result
 */
export async function getItemByID(itemId = options.id, queue) {
    if (!itemId) {
        return false;
    }

    log("Get item call", itemId);

    queue.add(() => getFeedbacks(itemId, false, queue), {
        priority: priorities.item,
    });

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
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
 * Update item by ID
 *
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function updateItemById(itemId, queue) {
    return await queue.add(async () => getFeedbacks(itemId, false, queue), {
        priority: priorities.item,
    });
}

/**
 * Update items helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateItems(queue) {
    const items = await getItems(prefix);

    log(`Update ${items.length} items`);

    items.forEach((itemId) =>
        queue.add(() => getFeedbacks(itemId, false, queue), {
            priority: priorities.item,
        })
    );

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

/**
 * Check reviews download status helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function checkReviews(queue) {
    const items = await getItems(prefix, true);

    log(`Check ${items.length} items reviews`);

    for (const itemId of items) {
        const files = getItemFiles(prefix, itemId);

        if (files.length) {
            continue;
        }

        const item = await getItem(prefix, itemId);

        if (!item?.reviews?.length) {
            continue;
        }

        if (item?.deleted) {
            continue;
        }

        queue.add(
            async () => {
                for (const reviewId of item.reviews) {
                    const feedback = await getReview(prefix, itemId, reviewId);

                    if (
                        !feedback?.photos?.length &&
                        !feedback?.photo?.length &&
                        !feedback?.video
                    ) {
                        continue;
                    }

                    if (!files.length) {
                        queue.add(
                            async () => getFeedback(itemId, feedback, queue),
                            {
                                priority: priorities.review,
                            }
                        );
                    }
                }

                logQueue(queue);
            },
            { priority: priorities.item }
        );
    }

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

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
    const items = await getItems(prefix, true);

    log(`Update ${items.length} items reviews`);

    const logInterval = setInterval(() => {
        if (queue.size || queue.pending) {
            logQueue(queue);
        } else {
            clearInterval(logInterval);
        }
    }, 1000);

    for (const itemId of items) {
        queue.add(
            async () => {
                const item = await getItem(prefix, itemId);

                if (!item?.reviews?.length) {
                    // log("No reviews found", itemId);
                    return false;
                    // continue;
                }

                if (item?.deleted) {
                    return false;
                    // continue;
                }

                for (const reviewId of item.reviews) {
                    const feedback = await getReview(prefix, itemId, reviewId);

                    if (
                        !feedback?.photos?.length &&
                        !feedback?.photo?.length &&
                        !feedback?.video
                    ) {
                        continue;
                    }

                    getFeedback(itemId, feedback, queue);
                    // queue.add(async () => getFeedback(itemId, feedback, queue), {
                    //     priority: priorities.review,
                    // });
                }

                logQueue(queue);
            },
            { priority: priorities.item }
        );
    }

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

/**
 * Analyze products and log stats
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function logStats(queue) {
    log("Start analyze products");

    const items = await getItems(prefix, true);

    if (!items.length) {
        log("Items not found");
        return false;
    }

    const tags = await getTags(prefix);

    log(`Tags: ${tags.join(", ")}`);

    queue.add(
        async () => {
            const cache = {};

            for (const itemId of items) {
                const product = await getItem(prefix, itemId);

                if (!product.info) {
                    continue;
                }

                const { info } = product;

                if (!cache[info.subj_root_name]) {
                    cache[info.subj_root_name] = {};
                }

                if (!cache[info.subj_root_name][info.subj_name]) {
                    cache[info.subj_root_name][info.subj_name] = {
                        count: 0,
                        subject_id: info.data.subject_id,
                        subject_root_id: info.data.subject_root_id,
                    };
                }

                cache[info.subj_root_name][info.subj_name].count++;

                if (
                    info.data.subject_id !=
                    cache[info.subj_root_name][info.subj_name].subject_id
                ) {
                    log(info);
                }

                if (
                    info.data.subject_root_id !=
                    cache[info.subj_root_name][info.subj_name].subject_root_id
                ) {
                    log(info);
                }
            }

            log(JSON.stringify(cache, null, 4));
        },
        { priority: priorities.item }
    );

    return true;
}

/**
 * Get brand items by brand ID
 *
 * @param   {String}  brandID  Brand ID
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Array}            Brand IDs array
 */
export async function getBrandItemsByID(brandID, queue) {
    log(`Get brand ${brandID} items call`);

    let items = [];
    let prevResults;

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(
            () => brandItemsRequest(brandID, page),
            {
                priority: priorities.page,
            }
        );

        if (!getItemsData || !getItemsData.data) {
            log(`No items found`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        const beforeFilterCount = getItemsData.data.products.length;

        await addInfoToProducts(getItemsData.data.products);

        const results = getItemsData.data.products
            .filter((item) => item.brandId == brandID)
            .map((item) => item.root)
            .filter((item, index, array) => array.indexOf(item) === index)
            .map((item) => (item = parseInt(item, 10)))
            .sort((a, b) => a - b);

        log(`Page ${page} found ${results.length}(${beforeFilterCount}) items`);

        items.push(...results);

        if (prevResults) {
            const currentItemsIds = getItemsData.data.products
                .map((item) => item.id)
                .sort()
                .join("-");

            if (currentItemsIds == prevResults) {
                log(`Previous data equal to current, end get`);
                page = options.pages;
                continue;
            } else {
                prevResults = getItemsData.data.products
                    .map((item) => item.id)
                    .sort()
                    .join("-");
            }
        } else {
            prevResults = getItemsData.data.products
                .map((item) => item.id)
                .sort()
                .join("-");
        }
    }

    items = items.filter((item, index, array) => array.indexOf(item) === index);

    return items.filter((itemId) => {
        const item = getItem(prefix, itemId);

        if (item?.deleted) {
            return false;
        }

        return true;
    });
}

/**
 * Get items by brand
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  brand  Brand ID
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByBrand(queue, brand = options.brand) {
    log("Get items call by brand");

    if (brand.indexOf("__") != -1) {
        brand = brand.slice(0, brand.indexOf("__"));
    }

    const items = await getBrandItemsByID(brand, queue);

    processItems(items, brand, queue);

    logQueue(queue);

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);
    }

    return true;
}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {
    log(`Get items call for ${query}`);

    const items = [];
    let count = 0;

    for (let page = 1; page <= options.pages; page++) {
        const getItemsData = await queue.add(() => itemsRequest(page, query), {
            priority: priorities.page,
        });

        if (!getItemsData || !getItemsData.data) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        if (!getItemsData.data.products.length) {
            log(`No items left`);
            page = options.pages;
            continue;
        }

        log(
            `Page ${page} found ${getItemsData.data.products.length} items before filter`
        );

        count += getItemsData.data.products.length;

        await addInfoToProducts(getItemsData.data.products);

        const results = getItemsData.data.products
            .map((item) => item.root)
            .filter((item, index, array) => array.indexOf(item) === index)
            .map((item) => (item = parseInt(item, 10)));

        const filtedResults = [];

        for (const item of results) {
            const dbReviewItem = await getItem(prefix, item);
            const time = options.time * 60 * 60 * 1000;

            if (
                dbReviewItem?.time &&
                Date.now() - dbReviewItem.time <= time &&
                !options.force
            ) {
                continue;
            }

            if (dbReviewItem?.deleted) {
                continue;
            }

            filtedResults.push(item);
        }

        filtedResults.sort((a, b) => a - b);

        log(`Page ${page} found ${filtedResults.length} items`);

        items.push(...filtedResults);
    }

    log(`Found ${items.length}(${count}) items on all pages`);

    for (const itemId of items) {
        queue.add(() => getFeedbacks(itemId, query, queue), {
            priority: priorities.item,
        });
    }

    return true;
}

export default getItemsByQuery;
