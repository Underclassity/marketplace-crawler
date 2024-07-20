import options from "../options.js";

/**
 * Log message into console
 *
 * @param   {String}  msg   Message string
 *
 * @return  {Boolean}       Result
 */
export function log(msg) {
    if (!msg || !msg.length) {
        return false;
    }

    if (options.logs) {
        console.log(...arguments);
        return true;
    }

    return false;
}

export default log;
