import log from "./log.js";

import options from "../options.js";

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
        if (!msg) {
            console.log("Message not defined!");
        }

        if (!id) {
            console.log("ID not defined!");
        }

        if (!prefix) {
            console.log("Prefix not defined!");
        }

        console.trace();
        return false;
    }

    const query = options.query || "";

    if (id) {
        return log(`[${prefix}] ${query}: ${id} - ${msg}`);
    }

    return log(`[${prefix}] ${query}: ${msg}`);
}

export default logMsg;
