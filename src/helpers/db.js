import fs from "node:fs";
import path from "node:path";

import { QuickDB } from "quick.db";

import is from "is_js";

import logMsg from "./log-msg.js";
import { getFiles as getFilesFromFolder } from "./get-files.js";

import deepEqual from "./deep-equal.js";

import options from "../options.js";

const dbPath = path.resolve(options.directory, "db");

const dbCache = {};

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
        dbCache[dbPrefix] = new QuickDB({
            filePath: path.resolve(dbPath, `${dbPrefix}.sqlite`),
        });
    }

    return dbCache[dbPrefix];
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db) {
        logMsg("DB not defined!");
        return false;
    }

    let item = await db.get(itemId.toString());

    if (!item) {
        await db.set(itemId.toString(), {
            id: itemId,
            reviews: [],
            tags: [],
            brand: undefined,
        });
        item = await db.get(itemId.toString());
    }

    if (!("reviews" in item)) {
        await db.set(itemId.toString(), {
            ...item,
            reviews: {},
        });
    }

    if (!("tags" in item)) {
        await db.set(itemId.toString(), {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await getItem(prefix, itemId);

    if (item && !options.force) {
        logMsg("Item already in DB", itemId, prefix);
    } else {
        logMsg("Add new item", itemId, prefix);

        await db.set(itemId.toString(), {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    await db.set(itemId.toString(), {
        ...dbItem,
        deleted: true,
    });

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
        itemId.toString()
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

    loadDB(dbPrefix);

    const item = await getItem(prefix, itemId);

    if (!item) {
        return false;
    }

    const newObject = { ...item, ...data };

    if (!deepEqual(newObject, item)) {
        await dbCache[dbPrefix].set(itemId.toString(), newObject);
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

    loadDB(dbPrefix);

    const item = await dbCache[dbPrefix].get(itemId.toString());

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

    loadDB(dbPrefix);

    if (!(await dbItemCheck(dbPrefix, itemId, prefix))) {
        return false;
    }

    const item = await dbCache[dbPrefix].get(itemId.toString());

    await dbCache[dbPrefix].set(itemId.toString(), {
        ...item,
        time,
    });

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

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

    const item = await db.get(itemId.toString());

    if (!("tags" in item)) {
        await db.set(itemId.toString(), {
            ...item,
            tags: [tag],
        });
    } else if (!item.tags.includes(tag)) {
        await db.set(itemId.toString(), {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

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

    const item = await db.get(itemId.toString());

    // Add brand id if not defined
    if (!("brand" in item)) {
        await db.set(itemId.toString(), {
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
    objects = false
) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    const time = options.time * 60 * 60 * 1000;

    const items = await db.all();

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
            logMsg(`Already updated by time`, id, prefix);
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    const items = await db.all();

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
export async function getBrands(prefix, withNames = false) {
    if (!prefix || !prefix.length) {
        logMsg("Prefix not defined!");
        return false;
    }

    const dbPrefix = `${prefix}-products`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    const items = await db.all();

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    if (!db) {
        logMsg("DB not defined!", false, prefix);
        return false;
    }

    const items = await db.all();

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

    loadDB(dbReviewsPrefix);

    const results = {};

    const reviews = await dbCache[dbReviewsPrefix].all();

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

    loadDB(dbReviewsPrefix);

    return await dbCache[dbReviewsPrefix].get(reviewId.toString());
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

    loadDB(dbProductsPrefix);
    loadDB(dbReviewsPrefix);

    const productsDB = dbCache[dbProductsPrefix];
    const reviewsDB = dbCache[dbReviewsPrefix];

    if (options.force) {
        await reviewsDB.set(reviewId.toString(), review);

        logMsg(`Force update review ${reviewId} in DB`, itemId, prefix);

        return true;
    }

    let item = await productsDB.get(itemId.toString());

    // Add item if not defined
    if (!item) {
        await addItem(prefix, itemId);

        item = await productsDB.get(itemId.toString());
    }

    // Convert old object reviews to new array type
    if (!Array.isArray(item.reviews)) {
        await productsDB.set(itemId.toString(), {
            ...item,
            reviews: Object.keys(item.reviews),
        });
    }

    // Check is review in product item
    if (!item.reviews.includes(reviewId)) {
        await productsDB.set(itemId.toString(), {
            ...item,
            reviews: [...item.reviews, reviewId],
        });
    }

    let reviewItem = await reviewsDB.get(reviewId.toString());

    if (!reviewItem) {
        reviewItem = await reviewsDB.set(reviewId.toString(), review);
        logMsg(`Force add/update review ${reviewId} in DB`, itemId, prefix);
    } else if (deepEqual(reviewItem, review)) {
        logMsg(`Review ${reviewId} already saved in DB`, itemId, prefix);
    } else {
        reviewItem = await reviewsDB.set(reviewId.toString(), review);
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

    const item = await db.get(itemId.toString());

    if (!item || item != folderFiles) {
        await db.set(itemId.toString(), folderFiles);
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

    loadDB(dbPrefix);

    const files = await dbCache[dbPrefix].get(itemId.toString());

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
            prefix
        );
        return false;
    }

    const dbPrefix = `${prefix}-predictions`;

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    let item = await db.get(itemId.toString());

    if (!item) {
        await db.set(itemId.toString(), {});
        item = await db.get(itemId.toString());
    }

    if (!(filename in item)) {
        item[filename] = predictions;

        await db.set(itemId.toString(), {
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const items = await db.all();

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

    if (!item) {
        await db.set(itemId.toString(), true);

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

    if (item) {
        await db.set(itemId.toString(), false);
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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const item = await db.get(itemId.toString());

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    let dbItem = await db.get(id.toString());

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
        try {
            // Create new user if not defined
            await db.set(id.toString(), {
                id,
                info: { ...data },
                reviews: [reviewId],
            });
        } catch (error) {
            dbItem = await db.get(id.toString());

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const users = await db.all();

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

    loadDB(dbPrefix);

    const db = dbCache[dbPrefix];

    const result = await db.delete(userId);

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
        itemId.toString()
    );

    if (!fs.existsSync(itemFolderPath)) {
        return [];
    }

    return fs.readdirSync(itemFolderPath);
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
        itemId.toString()
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

export default updateTime;
