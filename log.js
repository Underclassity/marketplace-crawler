import { getItems, getItem, getReviews } from "./src/helpers/db.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

const ids = getAdaptersIds();

(async () => {
    // Get all tags and log
    for (const adapter of ids) {
        let tags = [];

        const items = getItems(adapter, true);

        for (const itemId of items) {
            const item = getItem(adapter, itemId);

            tags.push(...(item?.tags || []));
        }

        tags = tags.filter(
            (item, index, array) => array.indexOf(item) === index
        );

        logMsg(`Tags: ${tags.join(",")}`, false, adapter);

        // Create users cache
        if (adapter == "wildberries") {
            const reviews = await getReviews(adapter, false);

            const usersCache = {};

            for (const reviewId in reviews) {
                const review = reviews[reviewId];

                const { wbUserId } = review;

                if (wbUserId in usersCache) {
                    usersCache[wbUserId].push(reviewId);
                } else {
                    usersCache[wbUserId] = [reviewId];
                }
            }
        }
    }
})();
