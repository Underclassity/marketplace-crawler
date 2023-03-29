/**
 * Generate uuid part
 * @return {String} UUID part
 */
export function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
}

/**
 * Generate unique id (UUID)
 * @param  {Number} num UUID length
 * @return {String}     Result UUID
 */
export function guid(num) {
    // eslint-disable-line
    // check input number
    if (Number.isInteger(num)) {
        let resId = "";

        for (let i = 0; i < num; i++) {
            resId = i ? `${resId}-${s4()}` : resId + s4();
        }

        return resId;
    }

    return (
        s4() +
        s4() +
        "-" +
        s4() +
        "-" +
        s4() +
        "-" +
        s4() +
        "-" +
        s4() +
        s4() +
        s4()
    );
}

export default guid;
