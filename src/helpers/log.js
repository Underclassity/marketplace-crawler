import options from "../options.js";

/**
 * Log message into console
 *
 * @param   {String}  msg  Message string
 *
 * @return  {Boolean}       Result
 */
export function log(msg) {
    if (options.logs) {
        console.log(msg);
        return true;
    }

    return false;
}

export default log;
