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

export default updateTime;
