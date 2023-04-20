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
        console.log("DB not defined!");
        return false;
    }

    if (!itemId) {
        console.log("Item ID not defined!");
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
        console.log("Tag not defined!");
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

export function getItems(db, prefix) {
    if (!db || !db.write) {
        logMsg("DB not defined!", false, false);
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

            return true;
        })
        .sort((a, b) => a.localeCompare(b));
}

export default updateTime;
