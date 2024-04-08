import sleep from "./sleep.js";

import options from "../options.js";

/**
 * Call async function in queue with priority support
 *
 * @param   {Function}  fn        Async function
 * @param   {Object}    queue     Queue instance
 * @param   {Number}    priority  Priority number
 *
 * @return  {Object}              Result
 */
export async function queueCall(fn, queue, priority) {
    if (!queue || !options.queue) {
        return await fn();
    }

    let result = undefined;
    let getResult = false;

    await queue.add(
        async () => {
            result = await fn();
            getResult = true;
        },
        { priority }
    );

    while (!getResult) {
        await sleep(10);
    }

    return result;
}

export default queueCall;
