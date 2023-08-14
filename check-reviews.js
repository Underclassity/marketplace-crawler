import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import options from "./src/options.js";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

/**
 * Analyze DB reviews
 *
 * @param   {Object}  db       LowDB instance
 * @param   {String}  adapter  Adapter
 *
 * @return  {Boolean}          Result
 */
async function analyzeDb(db, adapter) {
    logMsg(`Analyze reviews`, false, adapter);

    let urls = [];

    for (const itemId in db.data) {
        const item = db.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const review = item.reviews[reviewId];

            switch (adapter) {
                case "aliexpress":
                    if (review.images?.length) {
                        urls.push(...review.images);
                    }
                    break;
                case "amazon":
                    if (review.photos?.length) {
                        urls.push(...review.photos);
                    }
                    break;
                case "ebay":
                    urls.push(review.link);
                    break;
                case "ozon":
                    if (review?.content?.photos?.length) {
                        urls.push(...review.content.photos);
                    }

                    if (review?.content?.videos?.length) {
                        urls.push(...review.content.videos);
                    }
                    break;
                case "wildberries":
                    if (review?.photos?.length) {
                        for (const item of review.photos) {
                            urls.push(item.fullSizeUri);
                        }
                    }

                    if (review?.video) {
                        logMsg(review.video);
                    }
                    break;
                default:
                    break;
            }
        }
    }

    logMsg(`Before sort ${urls.length}`, false, adapter);

    urls = urls.filter((item, index, array) => array.indexOf(item) === index);

    logMsg(`After sort ${urls.length}`, false, adapter);
    logMsg(new Array(25).join("-"), false, adapter);

    return true;
}

(async () => {
    const ids = getAdaptersIds();

    for (const id of ids) {
        const dbAdapter = new JSONFileSync(
            path.resolve(options.directory, "db", `${id}.json`)
        );

        const db = new LowSync(dbAdapter);
        db.read();

        await analyzeDb(db, id);
    }
})();
