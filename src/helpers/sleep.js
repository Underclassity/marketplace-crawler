/**
 * Async sleep helper
 *
 * @param   {Number}  [ms=50]  Sleep duration in ms
 *
 * @return  {Object}           Promise
 */
export function sleep(ms=50) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export default sleep;
