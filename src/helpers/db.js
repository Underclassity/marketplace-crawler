import fs from "node:fs";
import path from "node:path";

import { QuickDB } from "quick.db";

import is from "is_js";

import { getFilesRecursively } from "./get-files.js";
import deepEqual from "./deep-equal.js";
import logMsg from "./log-msg.js";

import options from "../options.js";

const dbPath = path.resolve(options.directory, "db");

const dbCache = {};
const dbDataCache = {};

/**
 * Load DB by prefix
 *
 * @param   {String}  dbPrefix  DB prefix
 *
 * @return  {Object}            DB instance
 */
export async function loadDB(dbPrefix) {
    if (!dbPrefix || !dbPrefix.length) {
        logMsg("DB prefix not defined!");
        return false;
    }

    if (!(dbPrefix in dbCache)) {
        dbCache[dbPrefix] = new QuickDB({
            filePath: path.resolve(dbPath, `${dbPrefix}.sqlite`),
        });

        await dbCache[dbPrefix].init();

        await updateDB(dbPrefix);
    }

    return dbCache[dbPrefix];
}

/**
 * Update cached data helper
 *
 * @param   {String}  dbPrefix  DB prefix
 *
 * @return  {Boolean}           Result
 */
export async function updateDB(dbPrefix) {
    if (!dbPrefix || !dbPrefix.length) {
        logMsg("DB prefix not defined!");
        return false;
    }

    // if (dbPrefix in dbCache && dbPrefix.includes("-products")) {
    //     dbDataCache[dbPrefix] = await dbCache[dbPrefix].all();
    //     return true;
    // }

    return false;
}

/**
 * DB set helper
 *
 * @param   {String}  dbPrefix  DB prefix
 * @param   {String}  itemId    Item ID
 * @param   {Object}  data      Input data
 *
 * @return  {Object}            Result item
 */
export async function dbSet(dbPrefix, itemId, data) {
    if (!dbPrefix || !itemId) {
        return false;
    }

    if (!is.object(data)) {
        return false;
    }

    itemId = itemId.toString();

    const db = await loadDB(dbPrefix);

    if (!db) {
        return false;
    }

    const result = await db.set(itemId, data);

    if (!result) {
        return false;
    }

    await updateDB(dbPrefix);

    return result;
}

/**
 * DB delete helper
 *
 * @param   {String}  dbPrefix  DB prefix
 * @param   {String}  itemId    Item ID
 *
 * @return  {Object}            Result item
 */
export async function dbDetete(dbPrefix, itemId) {
    if (!dbPrefix || !itemId) {
        return false;
    }

    itemId = itemId.toString();

    const db = await loadDB(dbPrefix);

    if (!db) {
        return false;
    }

    const result = await db.delete(itemId);

    if (!result) {
        return false;
    }

    await updateDB(dbPrefix);

    return result;
}

/**
 * DB has helper
 *
 * @param   {String}  dbPrefix  DB prefix
 * @param   {String}  itemId    Item ID
 *
 * @return  {Object}            Result
 */
export async function dbHas(dbPrefix, itemId) {
    if (!dbPrefix || !itemId) {
        return false;
    }

    itemId = itemId.toString();

    const db = await loadDB(dbPrefix);

    if (!db) {
        return false;
    }

    return await db.has(itemId);
}

/**
 * Get item from DB helper
 *
 * @param   {String}  dbPrefix  DB prefix
 * @param   {String}  itemId    Item ID
 *
 * @return  {Object}            Item
 */
async function dbGet(dbPrefix, itemId) {
    if (!dbPrefix || !itemId) {
        return false;
    }

    itemId = itemId.toString();

    const db = await loadDB(dbPrefix);

    if (!db) {
        return false;
    }

    return await db.get(itemId);
}

/**
 * DB update helper
 *
 * @param   {String}  dbPrefix  DB prefix
 * @param   {String}  itemId    Item ID
 * @param   {Object}  data      Input data
 *
 * @return  {Object}            Result item
 */
export async function dbUpdate(dbPrefix, itemId, data) {
    if (!dbPrefix || !itemId) {
        return false;
    }

    if (!is.object(data)) {
        return false;
    }

    itemId = itemId.toString();

    const db = await loadDB(dbPrefix);

    if (!db) {
        return false;
    }

    const isItem = await db.has(itemId, data);

    if (!isItem) {
        return false;
    }

    const item = await db.get(itemId);

    await db.set(itemId, {
        ...item,
        ...data,
    });

    await updateDB(dbPrefix);

    return true;
}

/**
 * DB get all items helper
 *
 * @param   {String}  dbPrefix  DB prefix
 *
 * @return  {Array}             Items data
 */
export async function dbAll(dbPrefix) {
    if (!dbPrefix) {
        return false;
    }

    const db = await loadDB(dbPrefix);

    if (!db) {
        return false;
    }

    if (dbPrefix in dbDataCache) {
        return dbDataCache[dbPrefix];
    }

    return await db.all();
}

/**
 * Check DB and item ID
 *
 * @param   {String}  dbPrefix   DB prefix
 * @param   {String}  itemId     Item ID
 * @param   {String}  prefix     Prefix
 *
 * @return  {Boolean}            Result
 */
export async function dbItemCheck(dbPrefix, itemId, prefix) {
    if (!dbPrefix || !dbPrefix.length) {
        logMsg("DB prefix not defined!");
        return false;
    }

    if (!is.string(itemId) && !is.number(itemId)) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const isItem = await dbHas(dbPrefix, itemId);

    let item;

    if (!isItem) {
        item = await dbSet(dbPrefix, itemId, {
            id: itemId,
            reviews: [],
            tags: [],
            brand: undefined,
        });
    } else {
        item = await dbGet(dbPrefix, itemId);
    }

    if (!("reviews" in item)) {
        await dbSet(dbPrefix, itemId, {
            ...item,
            reviews: {},
        });
    }

    if (!("tags" in item)) {
        await dbSet(dbPrefix, itemId, {
            ...item,
            tags: [],
        });
    }

    return true;
}

/**
 * Add item to database
 *
 * @param   {String}  prefix   Prefix
 * @param   {String}  itemId   Item ID
 * @param   {Object}  data     Data
 *
 * @return  {Boolean}          Result
 */
export async function addItem(prefix, itemId, data = {}) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!is.string(itemId) && !is.number(itemId)) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!is.object(data)) {
        logMsg("Input data is not an object!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    const item = await dbGet(dbPrefix, itemId);

    if (item && !options.force) {
        logMsg("Item already in DB", itemId, prefix);
    } else {
        logMsg("Add new item", itemId, prefix);

        await dbSet(dbPrefix, itemId, {
            id: itemId,
            reviews: [],
            tags: options.query ? [options.query] : [],
            time: 0,
            brand: undefined,
            ...data,
        });
    }

    return true;
}

/**
 * Delete item from database
 *
 * @param   {String}  prefix   Prefix
 * @param   {String}  itemId   Item ID
 *
 * @return  {Boolean}          Result
 */
export async function deleteItem(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!is.string(itemId) && !is.number(itemId)) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbItem = await getItem(prefix, itemId);

    if (!dbItem) {
        logMsg(`Item ${itemId} not found in adapter ${prefix}`);
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    await dbSet(dbPrefix, itemId, {
        ...dbItem,
        deleted: true,
    });

    const thumbnailFilePath = path.resolve(
        options.directory,
        "thumbnails",
        prefix,
        `${itemId}.webp`,
    );

    const itemDownloadFolder = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId.toString(),
    );

    // delete thumbnail
    if (fs.existsSync(thumbnailFilePath)) {
        logMsg("Delete thumbnail", itemId, prefix);
        fs.unlinkSync(thumbnailFilePath);
    }

    // delete item dir if exist
    if (fs.existsSync(itemDownloadFolder)) {
        logMsg("Delete folder", itemId, prefix);
        fs.rmSync(itemDownloadFolder, { recursive: true });
    }

    return true;
}

/**
 * Update item data
 *
 * @param   {String}   prefix  Prefix
 * @param   {String}   itemId  Item ID
 * @param   {Object}   data    Data
 *
 * @return  {Boolean}          Result
 */
export async function updateItem(prefix, itemId, data) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!is.string(itemId) && !is.number(itemId)) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!is.object(data)) {
        logMsg("Input data is not an object!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    await dbUpdate(dbPrefix, itemId, data);

    return true;
}

/**
 * Update item data
 *
 * @param   {String}   prefix  Prefix
 * @param   {String}   itemId  Item ID
 * @param   {String}   param   Parameter
 *
 * @return  {Boolean}          Result
 */
export async function deleteItemParam(prefix, itemId, param) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!is.string(itemId) && !is.number(itemId)) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!param?.length) {
        logMsg("Input param is not a string!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    const item = await getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    if (param in item) {
        // Copy object
        const newObject = { ...item };

        // Delete param
        delete newObject[param];

        // Update with new object
        await dbSet(dbPrefix, itemId, newObject);

        return true;
    }

    return false;
}

/**
 * Get item from DB by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Object}          DB item
 */
export async function getItem(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    const item = await dbGet(dbPrefix, itemId);

    if (item) {
        return item;
    } else {
        logMsg("Item not found in DB", itemId, prefix);
        return false;
    }
}

/**
 * Update DB item time
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 * @param   {Number}  time    Time in ms
 *
 * @return  {Boolean}         Result
 */
export async function updateTime(prefix, itemId, time = Date.now()) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    if (!(await dbItemCheck(dbPrefix, itemId, prefix))) {
        return false;
    }

    const item = await dbGet(dbPrefix, itemId);

    await dbSet(dbPrefix, itemId, {
        ...item,
        time,
    });

    await updateItemStats(prefix, itemId);

    return true;
}

/**
 * Update DB item tags
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 * @param   {String}  tag     Tag to add
 *
 * @return  {Boolean}         Result
 */
export async function updateTags(prefix, itemId, tag) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!tag || !tag.length) {
        logMsg("Tag not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    if (!(await dbItemCheck(dbPrefix, itemId, prefix))) {
        return false;
    }

    if (tag) {
        tag = tag.trim();
    }

    if (!tag || !tag.length) {
        // logMsg("Tag not defined!");
        return false;
    }

    const item = await dbGet(dbPrefix, itemId);

    if (!("tags" in item)) {
        await dbSet(dbPrefix, itemId, {
            ...item,
            tags: [tag],
        });
    } else if (!item.tags.includes(tag)) {
        await dbSet(dbPrefix, itemId, {
            ...item,
            tags: [...item.tags, tag],
        });
    }

    return true;
}

/**
 * Update DB item brand
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 * @param   {String}  brand   Brand ID
 *
 * @return  {Boolean}         Result
 */
export async function updateBrand(prefix, itemId, brand) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!brand) {
        logMsg("Brand not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    if (!(await dbItemCheck(dbPrefix, itemId, prefix))) {
        return false;
    }

    if (brand?.length) {
        brand = brand.trim();
    } else if (!brand) {
        // console.trace();
        logMsg("Brand not defined!");

        return false;
    }

    const item = await dbGet(dbPrefix, itemId);

    // Add brand id if not defined
    if (!("brand" in item)) {
        await dbSet(dbPrefix, itemId, {
            ...item,
            brand,
        });
    }

    return true;
}

/**
 * Get items from DB
 *
 * @param   {String}   prefix            Log prefix
 * @param   {Boolean}  force             Force get all flag
 * @param   {Boolean}  [deleted=false]   Flag to return with deleted items
 * @param   {Boolean}  [objects=false]   Flag to return objects items
 *
 * @return  {Array}                      Items IDs array or items objects array
 */
export async function getItems(
    prefix = false,
    force = options.force,
    deleted = false,
    objects = false,
) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    const time = options.time * 60 * 60 * 1000;

    const items = await dbAll(dbPrefix);

    let filteredItems = [];

    // Process async fitler
    for (const { id, value: item } of items) {
        if (options.favorite) {
            const favoriteFlag = await isFavorite(prefix, id);

            if (!favoriteFlag) {
                continue;
            }
        }

        if (item?.time && Date.now() - item.time <= time && !force) {
            // logMsg(`Already updated by time`, id, prefix);
            continue;
        }

        if ("deleted" in item && item.deleted && !deleted) {
            // logMsg(`Deleted item`, id, prefix);
            continue;
        }

        if (options.id?.length && id.toString() != options.id) {
            continue;
        }

        filteredItems.push(item);
    }

    filteredItems = filteredItems
        .sort((a, b) => {
            const aReviewsCount = a.reviews ? Object.keys(a.reviews).length : 0;
            const bReviewsCount = b.reviews ? Object.keys(b.reviews).length : 0;

            return aReviewsCount - bReviewsCount;
        })
        .map((item) => {
            if (objects) {
                return item;
            }

            return item.id;
        });

    return filteredItems;
}

/**
 * Get all items data helper
 *
 * @param   {String}  prefix  Prefix
 *
 * @return  {Array}           Items array
 */
export async function getItemsData(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    return await dbAll(dbPrefix);
}

/**
 * Get all items data with params
 *
 * @param   {String}  prefix  Prefix
 * @param   {Object}  params  Params object
 *
 * @return  {Array}           Items array
 */
export async function getItemsDataByParams(prefix, params) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    let items = await dbAll(dbPrefix);

    if (!is.object(params)) {
        return items;
    }

    const config = {
        page: 1,
        limit: 100,

        photos: false,
        favorite: false,

        sort: false,
        brand: false,
        tag: false,
        category: false,

        deleted: false,

        ...params,
    };

    items = items
        .filter(({ value }) => {
            return config.deleted ? value?.deleted : !value?.deleted;
        })
        .filter(({ value }) => {
            if (!config.tag) {
                return true;
            }

            if (config.tag == "no-tag") {
                return !value?.tags.length;
            }

            return value.tags.includes(config.tag);
        })
        .filter(({ value }) => {
            if (!config.favorite) {
                return true;
            }

            if (value.favorite) {
                return true;
            }

            return false;
        })
        .filter(({ value }) => {
            if (!config.photos) {
                return true;
            }

            return value?.stats?.count?.files || 0;
        })
        .filter(({ value }) => {
            if (!config.category) {
                return true;
            }

            if (config.category == "no-category") {
                return !value?.info;
            }

            const { info } = value;

            if (info?.data?.subject_id == config.category) {
                return true;
            }

            return false;
        });

    if (config.brand) {
        items = items.filter(({ value }) => {
            if (config.brand == "no-brand") {
                return !("brand" in value);
            }

            return value?.brand == config.brand;
        });
    }

    if (config.sort) {
        items = items.sort(({ value: aValue }, { value: bValue }) => {
            if (config.sort == "reviewsAsc") {
                return (
                    (aValue.reviews.length || 0) - (bValue.reviews.length || 0)
                );
            }

            if (config.sort == "reviewsDesc") {
                return (
                    (bValue.reviews.length || 0) - (aValue.reviews.length || 0)
                );
            }

            const aSize = aValue.stats.size;
            const bSize = bValue.stats.size;

            if (config.sort == "sizeAsc") {
                return aSize - bSize;
            }

            if (config.sort == "sizeDesc") {
                return bSize - aSize;
            }

            const aFilesCount = aValue.stats.count.files;
            const bFilesCount = bValue.stats.count.files;

            if (config.sort == "filesAsc") {
                return aFilesCount - bFilesCount;
            }

            if (config.sort == "filesDesc") {
                return bFilesCount - aFilesCount;
            }

            return 0;
        });
    }

    const count = items.length;

    // Cut items
    const resultItems = items.slice(
        (config.page - 1) * config.limit,
        (config.page - 1) * config.limit + config.limit,
    );

    return {
        items: resultItems,
        count,
    };
}

/**
 * Get items brands from DB
 *
 * @param   {String}   prefix     Log prefix
 * @param   {Boolean}  withNames  Get with names flag
 *
 * @return  {Array}               Array of brands
 */
export async function getBrands(prefix, withNames = false) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    const items = await dbAll(dbPrefix);

    const brands = withNames ? {} : [];

    for (const { value: item } of items) {
        if (!withNames && item?.brand && !brands.includes(item.brand)) {
            brands.push(item.brand);
        }

        if (withNames && item?.brand && !(item.brand in brands)) {
            brands[item.brand] = { id: item.brand, name: undefined };
        }

        // Wildberries names support
        if (item?.ids && withNames) {
            const firstItem = item.ids[0];

            if (firstItem.brandName) {
                if (firstItem.brand in brands) {
                    brands[firstItem.brand].name = firstItem.brandName;
                } else {
                    brands[firstItem.brand] = {
                        id: firstItem.brand,
                        name: firstItem.brandName,
                    };
                }
            } else if (!(firstItem.brand in brands)) {
                brands[firstItem.brand] = { id: firstItem.brand };
            }
        }

        // Wiggle names support
        if (item.info?.Brand && withNames && !(item.info.Brand.Id in brands)) {
            const { Id, Name } = item.info.Brand;

            brands[Id] = {
                id: Id,
                name: Name,
            };
        }
    }

    // fitler brands
    if (!withNames) {
        return brands
            .filter((item) => item)
            .map((item) => (item?.trim ? item.trim() : item))
            .filter((item, index, array) => array.indexOf(item) === index);
    }

    return brands;
}

/**
 * Get items tags from DB
 *
 * @param   {String}  prefix  Prefix
 *
 * @return  {Array}           Array of tags
 */
export async function getTags(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    const items = await dbAll(dbPrefix);

    let tags = [];

    for (const { value: item } of items) {
        if (item?.tags?.length && !item?.deleted) {
            item.tags.forEach((tag) => {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            });
        }
    }

    // fitler tags
    tags = tags
        .filter((item) => item)
        .map((item) => item.toLowerCase().trim())
        .filter((item, index, array) => array.indexOf(item) === index);

    return tags;
}

/**
 * Get users IDs and reviews for adapter
 *
 * @param   {String}  prefix  Prefix
 *
 * @return  {Object}          Users data
 */
export async function getUsersFromReviews(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbReviewsPrefix = `${prefix}-reviews`;

    const results = {};

    const reviews = await dbAll(dbReviewsPrefix);

    for (const { id: reviewId, value: reviewItem } in reviews) {
        if (prefix == "wildberries") {
            const { wbUserId } = reviewItem;

            if (!wbUserId) {
                continue;
            }

            if (wbUserId in results) {
                results[wbUserId].push(reviewId);
            } else {
                results[wbUserId] = [reviewId];
            }
        }
    }

    return results;
}

/**
 * Get user info by adapter and id
 *
 * @param   {String}   prefix  Prefix
 * @param   {Sttring}  id      User ID
 *
 * @return  {Object}           User info
 */
export async function getUser(prefix, id) {
    const reviews = await getReviews(prefix);

    let info = false;

    if (prefix == "wildberries") {
        for (const reviewId in reviews) {
            if (info) {
                continue;
            }

            const reviewItem = reviews[reviewId];

            if (reviewItem?.wbUserId && reviewItem.wbUserId == id) {
                info = reviewItem.wbUserDetails;
            }
        }
    }

    return info;
}

/**
 * Get user reviews by user ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  id      User ID
 *
 * @return  {Array}           User reviews
 */
export async function getUserReviews(prefix, id) {
    const reviews = await getReviews(prefix);

    const results = [];

    if (prefix == "wildberries") {
        for (const reviewId in reviews) {
            const reviewItem = reviews[reviewId];

            if (reviewItem?.wbUserId && reviewItem.wbUserId == id) {
                results.push(reviewItem);
            }
        }
    }

    return results;
}

/**
 * Get review item from DB
 *
 * @param   {String}  prefix    Prefix
 * @param   {String}  itemId    Item ID
 * @param   {String}  reviewId  Review ID
 *
 * @return  {Object}            Review item
 */
export async function getReview(prefix, itemId, reviewId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!reviewId) {
        logMsg("Review ID not defined!");
        return false;
    }

    const item = await getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    if (!item.reviews.includes(reviewId)) {
        return false;
    }

    const dbReviewsPrefix = `${prefix}-reviews`;

    return await dbGet(dbReviewsPrefix, reviewId);
}

/**
 * Get reviews from DB by query
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  query   Query
 *
 * @return  {Array}           Review items array
 */
export async function getReviews(prefix, query = false) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbReviewsPrefix = `${prefix}-reviews`;

    const reviews = await dbAll(dbReviewsPrefix);

    if (!query || !is.object(query)) {
        return reviews;
        // logMsg("Query not defined!");
        // return false;
    }

    const results = [];

    for (const { value: reviewItem } in reviews) {
        for (const queryId in query) {
            if (reviewItem[queryId] == query[queryId]) {
                results.push(reviewItem);
            }
        }
    }

    return results;
}

/**
 * Add review to DB
 *
 * @param   {String}   prefix       Prefix
 * @param   {String}   itemId       Item ID
 * @param   {String}   reviewId     Review ID
 * @param   {Object}   review       Review object
 * @return  {Boolean}               Result
 */
export async function addReview(prefix, itemId, reviewId, review) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!reviewId) {
        logMsg("Review ID not defined!");
        return false;
    }

    if (!review || !is.object(review)) {
        logMsg("Input review is not an object!");
        return false;
    }

    if (!review || !reviewId) {
        logMsg("Review not defined!", itemId, prefix);
        return false;
    }

    const dbReviewsPrefix = `${prefix}-reviews`;
    const dbProductsPrefix = `${prefix}-products`;

    if (options.force) {
        await dbSet(dbReviewsPrefix, reviewId, review);

        logMsg(`Force update review ${reviewId} in DB`, itemId, prefix);

        return true;
    }

    const isItem = await dbHas(dbProductsPrefix, itemId);

    // Add item if not defined
    if (!isItem) {
        await addItem(prefix, itemId);
    }

    const item = await dbGet(dbProductsPrefix, itemId);

    // Convert old object reviews to new array type
    if (!Array.isArray(item.reviews)) {
        await dbSet(dbProductsPrefix, itemId, {
            ...item,
            reviews: Object.keys(item.reviews),
        });
    }

    // Check is review in product item
    if (!item.reviews.includes(reviewId)) {
        await dbSet(dbProductsPrefix, itemId, {
            ...item,
            reviews: [...item.reviews, reviewId],
        });
    }

    let reviewItem = await dbHas(dbReviewsPrefix, reviewId);

    if (!reviewItem) {
        reviewItem = await dbSet(dbReviewsPrefix, reviewId, review);
        logMsg(`Force add/update review ${reviewId} in DB`, itemId, prefix);
    } else if (deepEqual(reviewItem, review)) {
        logMsg(`Review ${reviewId} already saved in DB`, itemId, prefix);
    } else {
        reviewItem = await dbSet(dbReviewsPrefix, reviewId, review);
        logMsg(`Update review ${reviewId} in DB`, itemId, prefix);
    }

    return true;
}

/**
 * Update DB with files for given item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export async function updateFiles(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const folderPath = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId,
    );

    if (!fs.existsSync(folderPath)) {
        return false;
    }

    const dbPrefix = `${prefix}-files`;

    const folderFiles = getFilesRecursively(folderPath).sort();

    const item = await dbGet(dbPrefix, itemId);

    if (!item || item != folderFiles) {
        await dbSet(dbPrefix, itemId, folderFiles);
    }

    return true;
}

/**
 * Get filenames array from DB by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Array}           Array of filenames
 */
export async function getFiles(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-files`;

    const files = await dbGet(dbPrefix, itemId);

    if (!files) {
        return false;
    }

    return files;
}

/**
 * Get files size by files from DB by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Number}          Files size
 */
export async function getFilesSize(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const files = await getFiles(prefix, itemId);

    if (!files || !files.length || !Array.isArray(files)) {
        return 0;
    }

    return files.reduce((previous, current) => {
        const filepath = path.resolve(
            options.directory,
            "download",
            prefix,
            itemId,
            current,
        );

        if (!fs.existsSync(filepath)) {
            return previous;
        }

        previous += fs.statSync(filepath).size;

        return previous;
    }, 0);
}

/**
 * Add predictions to DB
 *
 * @param   {String}  prefix       Prefix
 * @param   {String}  itemId       Item ID
 * @param   {String}  filename     Filename
 * @param   {Array}   predictions  Array with predictions
 *
 * @return  {Boolean}              Result
 */
export async function addPrediction(prefix, itemId, filename, predictions) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!filename) {
        logMsg("Filename not defined!", itemId, prefix);
        return false;
    }

    if (!predictions || !Array.isArray(predictions)) {
        logMsg(
            `Input predictions ${predictions} is not an array!`,
            itemId,
            prefix,
        );
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    let item = await dbHas(dbPrefix, itemId);

    if (!item) {
        await dbSet(dbPrefix, itemId, {});
        item = await dbGet(dbPrefix, itemId);
    }

    if (!(filename in item)) {
        item[filename] = predictions;

        await dbSet(dbPrefix, itemId, {
            ...item,
        });
    }

    return true;
}

/**
 * Get predictions for given filename and item ID
 *
 * @param   {String}  prefix    Prefix
 * @param   {String}  itemId    Item ID
 * @param   {String}  filename  Filename
 *
 * @return  {Array|Boolean}     Predictions
 */
export async function getItemPredictions(prefix, itemId, filename) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    if (!filename) {
        logMsg("Filename not defined!", itemId, prefix);
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    const item = await dbGet(dbPrefix, itemId);

    if (!item) {
        return false;
    }

    if (!(filename in item)) {
        return false;
    }

    return item[filename];
}

/**
 * Get all predictions from DB
 *
 * @param   {String}  prefix  Prefix
 *
 * @return  {Object}          Predictions object
 */
export async function getPredictions(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    const items = await dbAll(dbPrefix);

    const allPredictions = {};

    for (const { value: item } of items) {
        for (const filename in item) {
            const predictions = item[filename];

            for (const prediction of predictions) {
                if (prediction.class in allPredictions) {
                    allPredictions[prediction.class].push(prediction.score);
                } else {
                    allPredictions[prediction.class] = [prediction.score];
                }
            }
        }
    }

    for (const boxClass in allPredictions) {
        const scores = allPredictions[boxClass];

        const max = Math.max(...scores);
        const min = Math.min(...scores);
        const count = scores.length;
        const avg = scores.reduce((a, b) => a + b, 0) / count;

        allPredictions[boxClass] = {
            max,
            min,
            avg,
            count,
        };
    }

    return allPredictions;
}

/**
 * Get predictions for filename by adapter and item ID
 *
 * @param   {String}  prefix    Prefix
 * @param   {String}  itemId    Item ID
 * @param   {String}  filename  Filename
 *
 * @return  {Array}             Predictions
 */
export async function getPredictionsForFile(prefix, itemId, filename) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    const item = await dbGet(dbPrefix, itemId);

    if (!item) {
        logMsg("Predictions for item not found!", itemId, prefix);
        return false;
    }

    if (!(filename in item)) {
        logMsg(`Predictions for file ${filename} not found!`, itemId, prefix);
        return false;
    }

    return item[filename];
}

/**
 * Get all predictions for item by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Object}          Predictions object
 */
export async function getPredictionsForItem(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    const item = await dbGet(dbPrefix, itemId);

    if (!item) {
        logMsg("Predictions for item not found!", itemId, prefix);
        return false;
    }

    return item;
}

/**
 * Add item to favorites
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export async function addToFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    const item = await dbHas(dbPrefix, itemId);

    if (!item) {
        await dbSet(dbPrefix, itemId, true);

        return true;
    }

    return false;
}

/**
 * Remove item from favorites
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export async function removeFromFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    const item = await dbHas(dbPrefix, itemId);

    if (item) {
        await dbDetete(dbPrefix, itemId);
        return true;
    }

    return false;
}

/**
 * Toggle item in favorites
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export async function toggleFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    const item = await dbHas(dbPrefix, itemId);

    return item
        ? await removeFromFavorite(prefix, itemId)
        : await addToFavorite(prefix, itemId);
}

/**
 * Check is item favorite
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export async function isFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    const item = await dbGet(dbPrefix, itemId);

    // Check and return result
    if (item) {
        return true;
    }

    return false;
}

/**
 * Add review for user
 *
 * @param   {String}  prefix    Prefix
 * @param   {String}  id        User ID
 * @param   {String}  reviewId  Review ID
 * @param   {Object}  data      User info data
 *
 * @return  {Boolean}           Result
 */
export async function addUserReview(prefix, id, reviewId, data) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!id || !reviewId) {
        return false;
    }

    const dbPrefix = `${prefix}-users`;

    let dbItem = await dbGet(dbPrefix, id);

    // Update user data
    if (dbItem) {
        if (!dbItem.reviews.includes(reviewId)) {
            dbItem.reviews.push(reviewId);
            await dbSet(dbPrefix, id, dbItem);
        }

        if (!deepEqual(dbItem.info, data)) {
            for (const dataId in data) {
                if (dbItem.info[dataId] != data[dataId]) {
                    if (dataId == "country") {
                        continue;
                    }

                    dbItem.info[dataId] = data[dataId];

                    await dbSet(dbPrefix, id, dbItem);
                }
            }
        }
    } else {
        try {
            // Create new user if not defined
            await dbSet(dbPrefix, id, {
                id,
                info: { ...data },
                reviews: [reviewId],
            });
        } catch (error) {
            dbItem = await dbGet(dbPrefix, id);

            if (!dbItem.reviews.includes(reviewId)) {
                dbItem.reviews.push(reviewId);
                await dbSet(dbPrefix, id, dbItem);
            }

            if (!deepEqual(dbItem.info, data)) {
                for (const dataId in data) {
                    if (dbItem.info[dataId] != data[dataId]) {
                        if (dataId == "country") {
                            continue;
                        }

                        dbItem.info[dataId] = data[dataId];

                        await dbSet(dbPrefix, id, dbItem);
                    }
                }
            }
        }
    }

    return true;
}

/**
 * Get users items
 *
 * @param   {String}  prefix  Prefix
 *
 * @return  {Array}           User items array
 */
export async function getUsers(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-users`;

    const users = await dbAll(dbPrefix);

    return users.map((item) => item.value);
}

/**
 * Delete user from DB by user ID
 *
 * @param   {String}   prefix  Prefix
 * @param   {String}   userId  User ID
 *
 * @return  {Boolean}          Result
 */
export async function deleteUser(prefix, userId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-users`;

    const result = await dbDelete(dbPrefix, userId);

    return result ? true : false;
}

/**
 * Get items files
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Array}           Files array
 */
export function getItemFiles(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return [];
    }

    const itemFolderPath = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId.toString(),
    );

    if (!fs.existsSync(itemFolderPath)) {
        return [];
    }

    return getFilesRecursively(itemFolderPath);
}

/**
 * Remove item directory
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Array}           Files array
 */
export function removeItemFiles(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return [];
    }

    const itemFolderPath = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId.toString(),
    );

    if (!fs.existSync(itemFolderPath)) {
        logMsg("Item dir not found", itemId, prefix);
        return false;
    }

    try {
        logMsg("Remove item dir", itemId, prefix);
        fs.rmdirSync(itemFolderPath, { recursive: true });
    } catch (error) {
        logMsg(`Remove item dir error: ${error.message}`, itemId, prefix);
        return false;
    }

    return true;
}

/**
 * Update item stats
 *
 * @param   {String}   prefix  Prefix
 * @param   {String}   itemId  Item ID
 *
 * @return  {Object}           Stats
 */
export async function updateItemStats(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const itemFolderPath = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId.toString(),
    );

    if (!fs.existsSync(itemFolderPath)) {
        await dbUpdate(prefix, itemId, {
            stats: {
                size: 0,
                count: {
                    files: 0,
                    images: 0,
                    videos: 0,
                },
            },
        });

        return {
            size: 0,
            count: {
                files: 0,
                images: 0,
                videos: 0,
            },
        };
    }

    const files = getFilesRecursively(itemFolderPath);

    let size = 0;
    let images = 0;
    let videos = 0;
    const filesCount = files.length;

    for (const filepath of files) {
        if (!fs.existsSync(filepath)) {
            continue;
        }

        const stats = fs.statSync(filepath);

        size += stats.size;

        if (filepath.includes(".mp4")) {
            videos++;
        } else {
            images++;
        }
    }

    const stats = {
        size,
        count: {
            files: filesCount,
            images,
            videos,
        },
    };

    // Save processed data
    await dbUpdate(prefix, itemId, {
        stats,
    });

    return stats;
}

export default updateTime;
