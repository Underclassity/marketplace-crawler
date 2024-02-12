import fs from "node:fs";
import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import { QuickDB } from "quick.db";

import is from "is_js";

import logMsg from "./log-msg.js";
import { getFiles as getFilesFromFolder } from "./get-files.js";

import deepEqual from "./deep-equal.js";

import options from "../options.js";

const dbPath = path.resolve(options.directory, "db");

const writeCache = {};
const dbCache = {};

/**
 * Check is DB writing
 *
 * @return  {Boolean}  DB write flag
 */
export function isDBWriting(dbPrefix = false) {
    let isWriting = false;

    for (const id in writeCache) {
        if (dbPrefix && id != dbPrefix) {
            continue;
        }

        if (writeCache[id]) {
            isWriting = true;
        }
    }

    return isWriting;
}

/**
 * Load DB by prefix
 *
 * @param   {String}  dbPrefix  DB prefix
 *
 * @return  {Object}            DB instance
 */
export function loadDB(dbPrefix) {
    if (!dbPrefix || !dbPrefix.length) {
        logMsg("DB prefix not defined!");
        return false;
    }

    if (!(dbPrefix in dbCache)) {
        if (dbPrefix.includes("-reviews") || dbPrefix.includes("-users")) {
            dbCache[dbPrefix] = new QuickDB({
                filePath: path.resolve(dbPath, `${dbPrefix}.sqlite`),
            });
        } else {
            dbCache[dbPrefix] = new LowSync(
                new JSONFileSync(path.resolve(dbPath, `${dbPrefix}.json`))
            );

            const db = dbCache[dbPrefix];

            db.read();

            if (!db.data) {
                db.data = {};
                db.write();
            }
        }
    }

    // dbCache[dbPrefix].read();

    return dbCache[dbPrefix];
}

/**
 * Write in DB helper
 *
 * @param   {String}    dbPrefix       DB prefix
 * @param   {Boolean}   write          Write flag
 * @param   {String}    prefix         Prefix
 * @param   {Boolean}   waitTimeout    Wait for write timeout
 *
 * @return  {Boolean}                  Result
 */
export function dbWrite(
    dbPrefix,
    write = true,
    prefix = false,
    waitTimeout = true
) {
    if (!dbPrefix || !dbPrefix.length) {
        logMsg("DB prefix not defined!");
        return false;
    }

    if (!is.string(dbPrefix)) {
        console.trace();
        logMsg(`Input DB prefix ${dbPrefix} is not a string!`, false, prefix);
        return false;
    }

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        debugger;
        logMsg("DB not defined!");
        return false;
    }

    if (!write) {
        return false;
    }

    if (dbPrefix && dbPrefix in writeCache && writeCache[dbPrefix]) {
        logMsg(`Already writing in DB ${dbPrefix}`, false, prefix);
        return false;
    }

    try {
        if (dbPrefix) {
            writeCache[dbPrefix] = true;
        }

        if (waitTimeout) {
            setTimeout(() => {
                const startTime = Date.now();

                try {
                    db.write();
                } catch (error) {
                    logMsg(
                        `Write in DB ${dbPrefix} error: ${error}`,
                        false,
                        prefix
                    );
                }

                const endTime = Date.now();

                logMsg(
                    `Write in DB ${dbPrefix}: ${endTime - startTime}ms`,
                    false,
                    prefix
                );
            }, 0);
        } else {
            const startTime = Date.now();

            try {
                db.write();
            } catch (error) {
                logMsg(
                    `Write in DB ${dbPrefix} error: ${error}`,
                    false,
                    prefix
                );
            }

            const endTime = Date.now();

            logMsg(
                `Write in DB ${dbPrefix}: ${endTime - startTime}ms`,
                false,
                prefix
            );
        }

        // Add sleep tick
        if (dbPrefix && waitTimeout) {
            setTimeout(() => {
                writeCache[dbPrefix] = false;
            }, 10_000);
        } else {
            writeCache[dbPrefix] = false;
        }
    } catch (error) {
        logMsg(`Write DB error: ${error.message}`, false, prefix);

        if (dbPrefix) {
            writeCache[dbPrefix] = false;
        }
    }

    return true;
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
export function dbItemCheck(dbPrefix, itemId, prefix) {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!");
        return false;
    }

    if (!(itemId in db.data)) {
        db.data[itemId] = {
            id: itemId,
            reviews: [],
            tags: [],
            brand: undefined,
        };

        dbWrite(dbPrefix, true, prefix);
    }

    if (!("reviews" in db.data[itemId])) {
        db.data[itemId].reviews = {};
        dbWrite(dbPrefix, true, prefix);
    }

    if (!("tags" in db.data[itemId])) {
        db.data[itemId].tags = [];
        dbWrite(dbPrefix, true, prefix);
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
export function addItem(prefix, itemId, data = {}) {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (itemId in db.data && !options.force) {
        logMsg("Item already in DB", itemId, prefix);
    } else {
        logMsg("Add new item", itemId, prefix);

        db.data[itemId] = {
            id: itemId,
            reviews: [],
            tags: options.query ? [options.query] : [],
            time: 0,
            brand: undefined,
            ...data,
        };

        dbWrite(dbPrefix, true, prefix);
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
export function deleteItem(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!is.string(itemId) && !is.number(itemId)) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbItem = getItem(prefix, itemId);

    if (!dbItem) {
        logMsg(`Item ${itemId} not found in adapter ${prefix}`);
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    db.data[itemId].deleted = true;
    dbWrite(dbPrefix, true, prefix);

    const thumbnailFilePath = path.resolve(
        options.directory,
        "thumbnails",
        prefix,
        `${itemId}.webp`
    );

    const itemDownloadFolder = path.resolve(
        options.directory,
        "download",
        prefix,
        itemId
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
 * @param   {Boolean}  write   Write flag
 *
 * @return  {Boolean}          Result
 */
export function updateItem(prefix, itemId, data, write = true) {
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

    loadDB(dbPrefix);

    const item = getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    const newObject = { ...item, ...data };

    if (!deepEqual(newObject, item)) {
        dbCache[dbPrefix].data[itemId] = newObject;
        dbWrite(dbPrefix, write, prefix);
    }

    return true;
}

/**
 * Get item from DB by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Object}          DB item
 */
export function getItem(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    if (itemId in dbCache[dbPrefix].data) {
        return dbCache[dbPrefix].data[itemId];
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
export function updateTime(prefix, itemId, time = Date.now()) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    if (!dbItemCheck(dbPrefix, itemId, prefix)) {
        return false;
    }

    dbCache[dbPrefix].data[itemId].time = time;

    dbWrite(dbPrefix, true, prefix);

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
export function updateTags(prefix, itemId, tag) {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!dbItemCheck(dbPrefix, itemId, prefix)) {
        return false;
    }

    if (tag) {
        tag = tag.trim();
    }

    if (!tag || !tag.length) {
        // logMsg("Tag not defined!");
        return false;
    }

    if (!("tags" in db.data[itemId])) {
        db.data[itemId].tags = [tag];
        dbWrite(dbPrefix, true, prefix);
    } else if (!db.data[itemId].tags.includes(tag)) {
        db.data[itemId].tags.push(tag);
        dbWrite(dbPrefix, true, prefix);
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
export function updateBrand(prefix, itemId, brand) {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!dbItemCheck(dbPrefix, itemId, prefix)) {
        return false;
    }

    if (brand?.length) {
        brand = brand.trim();
    } else {
        console.trace();
        logMsg("Brand not defined!");

        return false;
    }

    // Add brand id if not defined
    if (!("brand" in db.data[itemId])) {
        db.data[itemId].brand = brand;
        dbWrite(dbPrefix, true, prefix);
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
export function getItems(
    prefix = false,
    force = options.force,
    deleted = false,
    objects = false
) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    const time = options.time * 60 * 60 * 1000;

    const items = Object.keys(db.data)
        .filter((id) => {
            const item = db.data[id];

            if (options.favorite) {
                const favoriteFlag = isFavorite(prefix, id);

                if (!favoriteFlag) {
                    return false;
                }
            }

            if (item?.time && Date.now() - item.time <= time && !force) {
                logMsg(`Already updated by time`, id, prefix);
                return false;
            }

            if ("deleted" in item && item.deleted && !deleted) {
                logMsg(`Deleted item`, id, prefix);

                return false;
            }

            if (options.id?.length && id.toString() != options.id) {
                return false;
            }

            return true;
        })
        .sort((a, b) => {
            const aReviewsCount = a.reviews ? Object.keys(a.reviews).length : 0;
            const bReviewsCount = b.reviews ? Object.keys(b.reviews).length : 0;

            return aReviewsCount - bReviewsCount;
        });

    if (objects) {
        return items.map((id) => db.data[id]);
    }

    return items;
}

/**
 * Get items brands from DB
 *
 * @param   {String}   prefix     Log prefix
 * @param   {Boolean}  withNames  Get with names flag
 *
 * @return  {Array}               Array of brands
 */
export function getBrands(prefix, withNames = false) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    db.read();

    const brands = withNames ? {} : [];

    for (const itemId in db.data) {
        const item = db.data[itemId];

        if (!withNames && item?.brand?.length && !brands.includes(item.brand)) {
            brands.push(item.brand);
        }

        if (withNames && item?.brand?.length && !(item.brand in brands)) {
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
            .map((item) => item.trim())
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
export function getTags(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    db.read();

    let tags = [];

    for (const itemId in db.data) {
        const item = db.data[itemId];

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

    loadDB(dbReviewsPrefix);

    const results = {};

    const reviews = await dbCache[dbReviewsPrefix].all();

    for (const reviewId in reviews) {
        const reviewItem = reviews[reviewId];

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

    const item = getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    if (!item.reviews.includes(reviewId)) {
        return false;
    }

    const dbReviewsPrefix = `${prefix}-reviews`;

    loadDB(dbReviewsPrefix);

    return await dbCache[dbReviewsPrefix].get(reviewId);
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

    loadDB(dbReviewsPrefix);

    const reviews = await dbCache[dbReviewsPrefix].all();

    if (!query || !is.object(query)) {
        return reviews;
        // logMsg("Query not defined!");
        // return false;
    }

    const results = [];

    for (const reviewId in reviews) {
        const reviewItem = reviews[reviewId];

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
 * @param   {Boolean}  write        Write flag
 * @return  {Boolean}               Result
 */
export async function addReview(
    prefix,
    itemId,
    reviewId,
    review,
    write = true
) {
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

    loadDB(dbProductsPrefix);
    loadDB(dbReviewsPrefix);

    const productsDB = dbCache[dbProductsPrefix];
    const reviewsDB = dbCache[dbReviewsPrefix];

    if (options.force) {
        await reviewsDB.set(reviewId, review);

        logMsg(`Force update review ${reviewId} in DB`, itemId, prefix);

        return true;
    }

    let isWrite = false;

    // Add item if not defined
    if (!(itemId in productsDB.data)) {
        addItem(prefix, itemId);
    }

    // Convert old object reviews to new array type
    if (!Array.isArray(productsDB.data[itemId].reviews)) {
        productsDB.data[itemId].reviews = Object.keys(
            productsDB.data[itemId].reviews
        );
        dbWrite(dbProductsPrefix, write, prefix);
        isWrite = true;
    }

    // Check is review in product item
    if (!productsDB.data[itemId].reviews.includes(reviewId)) {
        productsDB.data[itemId].reviews.push(reviewId);
        dbWrite(dbProductsPrefix, write, prefix);
        isWrite = true;
    }

    let reviewItem = await reviewsDB.get(reviewId);

    if (!reviewItem) {
        reviewItem = await reviewsDB.set(reviewId, review);
        logMsg(`Force add/update review ${reviewId} in DB`, itemId, prefix);
    } else if (deepEqual(reviewItem, review)) {
        logMsg(`Review ${reviewId} already saved in DB`, itemId, prefix);
    } else {
        reviewItem = await reviewsDB.set(reviewId, review);
        logMsg(`Update review ${reviewId} in DB`, itemId, prefix);
    }

    return { result: true, isWrite };
}

/**
 * Update DB with files for given item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export function updateFiles(prefix, itemId) {
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
        itemId
    );

    if (!fs.existsSync(folderPath)) {
        return false;
    }

    const dbPrefix = `${prefix}-files`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const folderFiles = getFilesFromFolder(folderPath)
        .map((filepath) => path.basename(filepath))
        .sort();

    if (!(itemId in db.data) || db.data[itemId] != folderFiles) {
        db.data[itemId] = folderFiles;
        dbWrite(dbPrefix, true, prefix);
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
export function getFiles(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-files`;

    loadDB(dbPrefix);

    if (!(itemId in dbCache[dbPrefix].data)) {
        return false;
    }

    return dbCache[dbPrefix].data[itemId];
}

/**
 * Get files size by files from DB by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Number}          Files size
 */
export function getFilesSize(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const files = getFiles(prefix, itemId);

    if (!files || !files.length || !Array.isArray(files)) {
        return 0;
    }

    return files.reduce((previous, current) => {
        const filepath = path.resolve(
            options.directory,
            "download",
            prefix,
            itemId,
            current
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
export function addPrediction(prefix, itemId, filename, predictions) {
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
            prefix
        );
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!(itemId in db.data)) {
        db.data[itemId] = {};
        dbWrite(dbPrefix, true, prefix, false);
    }

    if (!(filename in db.data[itemId])) {
        db.data[itemId][filename] = predictions;
        dbWrite(dbPrefix, true, prefix, false);
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
export function getItemPredictions(prefix, itemId, filename) {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!(itemId in db.data)) {
        return false;
    }

    if (!(filename in db.data[itemId])) {
        return false;
    }

    return db.data[itemId][filename];
}

/**
 * Get all predictions from DB
 *
 * @param   {String}  prefix  Prefix
 *
 * @return  {Object}          Predictions object
 */
export function getPredictions(prefix) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const allPredictions = {};

    for (const itemId in db.data) {
        const item = db.data[itemId];

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
export function getPredictionsForFile(prefix, itemId, filename) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!(itemId in db.data)) {
        logMsg("Predictions for item not found!", itemId, prefix);
        return false;
    }

    if (!(filename in db.data[itemId])) {
        logMsg(`Predictions for file ${filename} not found!`, itemId, prefix);
        return false;
    }

    return db.data[itemId][filename];
}

/**
 * Get all predictions for item by item ID
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Object}          Predictions object
 */
export function getPredictionsForItem(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!(itemId in db.data)) {
        logMsg("Predictions for item not found!", itemId, prefix);
        return false;
    }

    return db.data[itemId];
}

/**
 * Add item to favorites
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export function addToFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!(itemId in db.data)) {
        db.data[itemId] = true;
        db.write();
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
export function removeFromFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (itemId in db.data) {
        db.data[itemId] = false;
        db.write();
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
export function toggleFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    return itemId in db.data && db.data[itemId]
        ? removeFromFavorite(prefix, itemId)
        : addToFavorite(prefix, itemId);
}

/**
 * Check is item favorite
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export function isFavorite(prefix, itemId) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-favorites`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    // Check and return result
    if (itemId in db.data && db.data[itemId]) {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const dbItem = await db.get(id.toString());

    // Update user data
    if (dbItem) {
        if (!dbItem.reviews.includes(reviewId)) {
            dbItem.reviews.push(reviewId);
            await db.set(id.toString(), dbItem);
        }

        if (!deepEqual(dbItem.info, data)) {
            for (const dataId in data) {
                if (dbItem.info[dataId] != data[dataId]) {
                    if (dataId == "country") {
                        continue;
                    }

                    dbItem.info[dataId] = data[dataId];

                    await db.set(id.toString(), dbItem);
                }
            }
        }
    } else {
        // Create new user if not defined
        await db.set(id.toString(), {
            id,
            info: { ...data },
            reviews: [reviewId],
        });
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    return await db.all();
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const result = await db.delete(userId);

    return result ? true : false;
}

export default updateTime;
