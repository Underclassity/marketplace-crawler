import log from "./log.js";

import options from "../options.js";
import priorities from "./priorities.js";

let prefixLength = 0;
let idLength = 0;

/**
 * Log message helper
 *
 * @param   {String}  msg     Message string
 * @param   {String}  id      ID
 * @param   {String}  prefix  Prfix
 *
 * @return  {Boolean}         Log result
 */
export function logMsg(msg, id = "Common", prefix = "Common") {
    if ((!msg || !id || !prefix) && prefix == undefined) {
        log("Prefix not defined!");
        console.trace();
    }

    if (!id) {
        id = "Common";
    }

    if (!prefix) {
        prefix = "Common";
    }

    const query = options.query || options.brand || "";

    if (prefix && (!prefixLength || prefixLength < prefix.length)) {
        prefixLength = prefix.length;
    }

    if (id && (!idLength || idLength < id.length)) {
        idLength = id.length;
    }

    if (prefix && prefixLength) {
        prefix = prefix.toString().padEnd(prefixLength, " ");
    }

    if (id && idLength) {
        id = id.toString().padEnd(idLength, " ");
    }

    return log(
        `${prefix ? `[${prefix}] ` : ""}${query ? `${query}: ` : ""}${
            id ? `${id} - ` : ""
        }${msg}`
    );
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
        })}`,
        false,
        false
    );

    return true;
}

export default logMsg;
