import PQueue from "p-queue";

import options from "../options.js";

/**
 * Create queue based on options
 *
 * @return  {Object}  Queue instance
 */
export function createQueue() {
    return new PQueue({
        concurrency: options.throat,
        timeout: options.timeout,
        autoStart: true,
        carryoverConcurrencyCount: true,
    });
}

export default createQueue;
