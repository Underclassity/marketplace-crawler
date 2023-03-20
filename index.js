import PQueue from "p-queue";

import options from "./src/options.js";

// import { getItemsByQuery as getItemsByQueryFromWildberries } from "./src/adapters/wildberries.js";
// import { getItemsByQuery as getItemsByQueryFromAliexpress } from "./src/adapters/aliexpress.js";
import { getItemsByQuery as getItemsByQueryFromEbay } from "./src/adapters/ebay.js";

(async () => {
    if (!options.query) {
        console.log("Query not defined!");
        return false;
    }

    console.log(`Get items for query: ${options.query}`);

    let queue = new PQueue({
        concurrency: options.throat,
        timeout: options.timeout,
        autoStart: true,
        carryoverConcurrencyCount: true,
    });

    // queue.on("completed", () => {
    //   console.log("Completed");
    //   // console.log(result);
    // });

    // queue.on("idle", () => {
    //     console.log(
    //         `Queue is idle.  Size: ${queue.size}  Pending: ${queue.pending}`
    //     );
    // });

    // queue.on("add", () => {
    //     console.log(
    //         `Task is added.  Size: ${queue.size}  Pending: ${queue.pending}`
    //     );
    // });

    // queue.on("next", () => {
    //     console.log(
    //         `Task is completed.  Size: ${queue.size}  Pending: ${queue.pending}`
    //     );
    // });

    // getItemsByQueryFromWildberries(options.query, queue);
    // getItemsByQueryFromAliexpress(options.query, queue);
    getItemsByQueryFromEbay(options.query, queue);

    return true;
})();
