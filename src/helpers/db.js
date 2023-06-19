import fs from "node:fs";
import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import options from "../options.js";
import logMsg from "./log-msg.js";
import { getFiles } from "./get-files.js";

const dbPath = path.resolve(options.directory, "db");

const writeCache = {};
const dbCache = {};

/**
 * Load DB by prefix
 *
 * @param   {String}  dbPrefix  DB prefix
 *
 * @return  {Object}            DB instance
 */
export function loadDB(dbPrefix) {
    if (!(dbPrefix in dbCache)) {
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

    // dbCache[dbPrefix].read();

    return dbCache[dbPrefix];
}

/**
 * Write in DB helper
 *
 * @param   {String}   dbPrefix    DB prefix
 * @param   {Boolean}  write       Write flag
 * @param   {String}   prefix      Prefix
 *
 * @return  {Boolean}              Result
 */
export function dbWrite(dbPrefix, write = true, prefix = false) {
    if (typeof dbPrefix != "string") {
        console.trace();
        logMsg(`Input DB prefix ${dbPrefix} is not a string!`, false, prefix);
        return false;
    }

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!");
        return false;
    }

    if (!write) {
        return false;
    }

    if (dbPrefix && dbPrefix in writeCache && writeCache[dbPrefix]) {
        logMsg(`Already writing in DB`, false, prefix);
        return false;
    }

    try {
        if (dbPrefix) {
            writeCache[dbPrefix] = true;
        }

        const startTime = Date.now();

        db.write();

        const endTime = Date.now();

        logMsg(
            `Write in DB ${dbPrefix}: ${endTime - startTime}ms`,
            false,
            prefix
        );

        if (dbPrefix) {
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
export function dbItemCheck(dbPrefix, itemId, prefix = false) {
    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!");
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!");
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
export function addItem(prefix, itemId, data) {
    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (itemId in db.data && !options.force) {
        logMsg("Item already in DB", itemId, prefix);
    } else {
        logMsg("Add new item", itemId, prefix);

        db.data[itemId] = {
            id: itemId,
            reviews: {},
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
 * Update item data`
 *
 * @param   {String}  prefix  Prefix
 * @param   {String}  itemId  Item ID
 * @param   {Object}  data    Data
 *
 * @return  {Boolean}         Result
 */
export function updateItem(prefix, itemId, data) {
    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const item = getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    dbCache[dbPrefix].data[itemId] = {
        ...item,
        ...data,
    };

    dbWrite(dbPrefix, true, prefix);

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
 * @param   {String}  prefix  Log prefix
 *
 * @return  {Array}           Items IDs array
 */
export function getItems(prefix = false) {
    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    const time = options.time * 60 * 60 * 1000;

    return Object.keys(db.data)
        .filter((id) => {
            const item = db.data[id];

            if (
                item?.time &&
                Date.now() - item.time <= time &&
                !options.force
            ) {
                logMsg(`Already updated by time`, id, prefix);
                return false;
            }

            if ("deleted" in item && item.deleted) {
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
}

/**
 * Get items brands from DB
 *
 * @param   {String}  prefix  Log prefix
 *
 * @return  {Array}           Array of brands
 */
export function getBrands(prefix) {
    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db || !db.write) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    db.read();

    let brands = [];

    for (const itemId in db.data) {
        const item = db.data[itemId];

        if (item?.brand?.length && !brands.includes(item.brand)) {
            brands.push(item.brand);
        }
    }

    // fitler brands
    brands = brands
        .filter((item) => item)
        .map((item) => item.trim())
        .filter((item, index, array) => array.indexOf(item) === index);

    return brands;
}

/**
 * Get items tags from DB
 *
 * @param   {String}  prefix  Log prefix
 *
 * @return  {Array}           Array of tags
 */
export function getTags(prefix = false) {
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

        if (item?.tags.length) {
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
 * Get review item from DB
 *
 * @param   {String}  prefix    Prefix
 * @param   {String}  itemId    Item ID
 * @param   {String}  reviewId  Review ID
 *
 * @return  {Object}            Review item
 */
export function getReview(prefix, itemId, reviewId) {
    const item = getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    if (!item.reviews.includes(reviewId)) {
        return false;
    }

    const dbReviewsPrefix = `${prefix}-reviews`;

    loadDB(dbReviewsPrefix);

    return dbCache[dbReviewsPrefix].data[reviewId];
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
export function addReview(prefix, itemId, reviewId, review, write = true) {
    const dbReviewsPrefix = `${prefix}-reviews`;
    const dbProductsPrefix = `${prefix}-products`;

    loadDB(dbReviewsPrefix);
    loadDB(dbProductsPrefix);

    if (!dbItemCheck(dbReviewsPrefix, itemId, prefix)) {
        return false;
    }

    if (!review || !reviewId) {
        logMsg("Review not defined!", itemId, prefix);
        return false;
    }

    if (options.force) {
        dbCache[dbReviewsPrefix].data[reviewId] = review;
        dbWrite(dbReviewsPrefix, true, prefix);

        logMsg(`Update review ${reviewId} in DB`, itemId, prefix);

        return true;
    }

    const reviewsDB = dbCache[dbReviewsPrefix];
    const productsDB = dbCache[dbProductsPrefix];

    if (!productsDB.data[itemId]?.reviews?.includes(reviewId)) {
        productsDB.data[itemId].reviews.push(reviewId);
        dbWrite(dbProductsPrefix, true, prefix);
    }

    if (!(reviewId in reviewsDB.data)) {
        reviewsDB.data[reviewId] = review;
        dbWrite(dbReviewsPrefix, write, prefix);

        logMsg(`Force add/update review ${reviewId} in DB`, itemId, prefix);
    } else if (
        JSON.stringify(reviewsDB.data[reviewId]) == JSON.stringify(review)
    ) {
        logMsg(`Review ${reviewId} already saved in DB`, itemId, prefix);
    } else {
        reviewsDB.data[reviewId] = review;
        dbWrite(dbReviewsPrefix, write, prefix);

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
export function updateFiles(prefix, itemId) {
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

    const folderFiles = getFiles(folderPath)
        .map((filepath) => path.basename(filepath))
        .sort();

    if (!(itemId in db.data) || db.data[itemId] != folderFiles) {
        db.data[itemId] = folderFiles;
        dbWrite(dbPrefix, true, prefix);
    }

    return true;
}

export default updateTime;
