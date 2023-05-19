import log from "./log.js";

import options from "../options.js";
import priorities from "./priorities.js";

/**
 * Log message helper
 *
 * @param   {String}  msg     Message string
 * @param   {String}  id      ID
 * @param   {String}  prefix  Prfix
 *
 * @return  {Boolean}         Log result
 */
export function logMsg(msg, id, prefix) {
    if (!msg || !id || !prefix) {
        if (msg == undefined) {
            console.log("Message not defined!");
            console.trace();
        }

        if (id == undefined) {
            console.log("ID not defined!");
            console.trace();
        }

        if (prefix == undefined) {
            console.log("Prefix not defined!");
            console.trace();
        }

        // return false;
    }

    const query = options.query || "";

    if (id) {
        return log(`[${prefix}] ${query}: ${id} - ${msg}`);
    }

    return log(`[${prefix}] ${query}: ${msg}`);
}

/**
 * Log queue state
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export function logQueue(queue) {
    if (!queue) {
        return false;
    }

    logMsg(
        `Queue size: page-${queue.sizeBy({
            priority: priorities.page,
        })} items-${queue.sizeBy({
            priority: priorities.item,
        })} reviews-${queue.sizeBy({
            priority: priorities.review,
        })} download-${queue.sizeBy({
            priority: priorities.download,
        })}`
    );

    return true;
}

export default logMsg;
