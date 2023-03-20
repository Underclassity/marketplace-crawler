/**
 * Async sleep helper
 *
 * @param   {Number}  ms  Sleep duration in ms
 *
 * @return  {Object}      Promise
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export default sleep;
