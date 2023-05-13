import path from "node:path";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import options from "./src/options.js";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

async function analyzeDb(db, id) {
    logMsg(`Analyze reviews`, id, false);

    let urls = [];

    for (const itemId in db.data) {
        const item = db.data[itemId];

        if (!("reviews" in item) || !Object.keys(item.reviews).length) {
            continue;
        }

        for (const reviewId in item.reviews) {
            const review = item.reviews[reviewId];

            switch (id) {
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

    logMsg(`Before sort ${urls.length}`, id, false);

    urls = urls.filter((item, index, array) => array.indexOf(item) === index);

    logMsg(`After sort ${urls.length}`, id, false);
    logMsg(new Array(25).join("-"), id, false);

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
