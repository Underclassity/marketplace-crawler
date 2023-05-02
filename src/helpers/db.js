import options from "../options.js";
import logMsg from "./log-msg.js";

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
        db.write();
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

    db.write();

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

    db.write();

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
        .sort((a, b) => a.localeCompare(b));
}

/**
 * Add review to DB
 *
 * @param   {Object}  db           Items DB
 * @param   {String}  itemId       Item ID
 * @param   {String}  reviewId     Review ID
 * @param   {Object}  review       Review object
 * @param   {String}  prefix       Log prefix
 * @return  {Boolean}              Result
 */
export function addRewiew(db, itemId, reviewId, review, prefix = false) {
    if (!dbItemCheck(db, itemId)) {
        return false;
    }

    if (!review || !reviewId) {
        logMsg("Review not defined!", id, prefix);
        return false;
    }

    if (!(itemId in db)) {
        db[itemId] = {
            reviews: {},
        };
        db.write();
    }

    if (!("reviews" in db[itemId])) {
        db[itemId].reviews = {};
        db.write();
    }

    if (!(reviewId in db[itemId].reviews) && !options.force) {
        db[itemId].reviews[reviewId] = review;
        db.write();
        logMsg(`Add new review ${reviewId} in DB`, itemId, prefix);
    } else if (db[itemId].reviews[reviewId] != review || options.force) {
        db[itemId].reviews[reviewId] = review;
        db.write();
        logMsg(`Update review ${reviewId} in DB`, itemId, prefix);
    } else {
        logMsg(`Review ${reviewId} already saved in DB`, itemId, prefix);
    }

    return true;
}

export default updateTime;
