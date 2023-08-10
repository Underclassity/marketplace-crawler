/**
 * Get random items from array
 *
 * @param   {Array}   arr      Input array
 * @param   {Number}  [n=1]    Result array length
 *
 * @return  {Array}            Result array
 */
export function getRandom(arr, n = 1) {
    const result = new Array(n);
    let len = arr.length;
    const taken = new Array(len);

    if (n > len) {
        throw new RangeError("getRandom: more elements taken than available");
    }

    while (n--) {
        const x = Math.floor(Math.random() * len);
        result[n] = arr[x in taken ? taken[x] : x];
        taken[x] = --len in taken ? taken[len] : len;
    }

    return result;
}

export default getRandom;
