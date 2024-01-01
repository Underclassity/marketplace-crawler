/**
 * Deep equal check for two objects
 *
 * @param   {Object}  x   First object
 * @param   {Object}  y   Second object
 *
 * @return  {Boolean}     Equal result
 */
export function deepEqual(x, y) {
    const ok = Object.keys;
    const tx = typeof x;
    const ty = typeof y;

    return x && y && tx === "object" && tx === ty
        ? ok(x).length === ok(y).length &&
              ok(x).every((key) => deepEqual(x[key], y[key]))
        : x === y;
}

export default deepEqual;
