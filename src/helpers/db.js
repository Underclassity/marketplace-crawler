import options from "../options.js";
import logMsg from "./log-msg.js";

const writeCache = {};

/**
 * Write in DB helper
 *
 * @param   {Object}   db      DB object
 * @param   {Boolean}  write   Write flag
 * @param   {String}   prefix  DB prefix
 *
 * @return  {Boolean}          Result
 */
export function dbWrite(db, write = true, prefix = false) {
    if (!db || !db.write) {
        logMsg("DB not defined!", false, false);
        return false;
    }

    if (!write) {
        return false;
    }

    if (prefix && prefix in writeCache) {
        return false;
    }

    try {
        if (prefix) {
            writeCache[prefix] = true;
        }

        db.write();

        if (prefix) {
            writeCache[prefix] = false;
        }
    } catch (error) {
        logMsg(`Write DB error: ${error.message}`, false, prefix);
    }

    return true;
}

/**
 * Check DB and item ID
 *
 * @param   {Object}  db      DB instance
 * @param   {String}  itemId  Item ID
 *
 * @return  {Boolean}         Result
 */
export function dbItemCheck(db, itemId) {
    if (!db || !db.write) {
        logMsg("DB not defined!", false, false);
        return false;
    }

    if (!itemId) {
        logMsg("Item ID not defined!", false, false);
        return false;
    }

    if (!(itemId in db.data)) {
        db.data[itemId] = {};

        try {
            db.write();
        } catch (error) {
            console.log(error);
        }
    }

    return true;
}

/**
 * Update DB item time
 *
 * @param   {Object}  db      DB instance
 * @param   {String}  itemId  Item ID
 * @param   {Number}  time    Time in ms
 *
 * @return  {Boolean}         Result
 */
export function updateTime(db, itemId, time = Date.now()) {
    if (!dbItemCheck(db, itemId)) {
        return false;
    }

    if (itemId in db.data) {
        db.data[itemId].time = time;
    } else {
        db.data[itemId] = {
            time,
        };
    }

    dbWrite(db, true, false);

    return true;
}

/**
 * Update DB item tags
 *
 * @param   {Object}  db      DB instance
 * @param   {String}  itemId  Item ID
 * @param   {String}  tag     Tag to add
 *
 * @return  {Boolean}         Result
 */
export function updateTags(db, itemId, tag) {
    if (!dbItemCheck(db, itemId)) {
        return false;
    }

    if (tag) {
        tag = tag.trim();
    }

    if (!tag || !tag.length) {
        logMsg("Tag not defined!", false, false);
        return false;
    }

    if (!("tags" in db.data[itemId])) {
        db.data[itemId].tags = [];
    }

    if (!("tags" in db.data[itemId])) {
        db.data[itemId].tags = [tag];
    } else if (!db.data[itemId].tags.includes(tag)) {
        db.data[itemId].tags.push(tag);
    }

    dbWrite(db, true, false);

    return true;
}

/**
 * Update DB item brand
 *
 * @param   {Object}  db      DB instance
 * @param   {String}  itemId  Item ID
 * @param   {String}  brand   Brand ID
 *
 * @return  {Boolean}         Result
 */
export function updateBrand(db, itemId, brand) {
    if (!dbItemCheck(db, itemId)) {
        return false;
    }

    if (brand?.length) {
        brand = brand.trim();
    } else {
        console.trace();
        logMsg("Brand not defined!", false, false);

        return false;
    }

    // Add brand id if not defined
    if (!("brand" in db.data[itemId])) {
        db.data[itemId].brand = brand;
        dbWrite(db, true, false);
    }

    return true;
}

/**
 * Get items from DB
 *
 * @param   {Object}  db      Items DB
 * @param   {String}  prefix  Log prefix
 *
 * @return  {Array}           Items IDs array
 */
export function getItems(db, prefix = false) {
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
 * Add review to DB
 *
 * @param   {Object}   db           Items DB
 * @param   {String}   itemId       Item ID
 * @param   {String}   reviewId     Review ID
 * @param   {Object}   review       Review object
 * @param   {String}   prefix       Log prefix
 * @param   {Boolean}  write        Log prefix
 * @return  {Boolean}               Result
 */
export function addReview(
    db,
    itemId,
    reviewId,
    review,
    prefix = false,
    write = true
) {
    if (!dbItemCheck(db, itemId)) {
        return false;
    }

    if (!review || !reviewId) {
        logMsg("Review not defined!", itemId, prefix);
        return false;
    }

    if (!(itemId in db.data)) {
        db.data[itemId] = {
            reviews: {},
        };
        dbWrite(db, write, prefix);
    }

    if (!("reviews" in db.data[itemId])) {
        db.data[itemId].reviews = {};
        dbWrite(db, write, prefix);
    }

    if (!(reviewId in db.data[itemId].reviews) && !options.force) {
        db.data[itemId].reviews[reviewId] = review;
        dbWrite(db, write, prefix);

        logMsg(`Add new review ${reviewId} in DB`, itemId, prefix);
    } else if (db.data[itemId].reviews[reviewId] != review || options.force) {
        db.data[itemId].reviews[reviewId] = review;
        dbWrite(db, write, prefix);

        logMsg(`Update review ${reviewId} in DB`, itemId, prefix);
    } else {
        logMsg(`Review ${reviewId} already saved in DB`, itemId, prefix);
    }

    return true;
}

export default updateTime;
