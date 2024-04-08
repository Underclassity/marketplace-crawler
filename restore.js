import inquirer from "inquirer";

import { addItem, getItem, getReviews, updateItem } from "./src/helpers/db.js";

import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import logMsg from "./src/helpers/log-msg.js";

import options from "./src/options.js";

const ids = getAdaptersIds();

async function restorePrefix(prefix) {
    logMsg("Start to restore", false, prefix);

    const reviews = await getReviews(prefix);

    for (const review of reviews) {
        if (prefix == "wildberries") {
            const { value } = review;
            const { nmId } = value;

            if (!nmId) {
                logMsg(
                    `Item ID not found in review ${review.id}!`,
                    false,
                    prefix
                );
                continue;
            }

            const dbItem = getItem(prefix, nmId);

            if (dbItem) {
                if (!dbItem.reviews.includes(review.id)) {
                    logMsg(`Add review ${review.id} to item`, nmId, prefix);

                    updateItem(
                        prefix,
                        nmId,
                        {
                            reviews: [...dbItem.reviews, review.id],
                        },
                        true
                    );
                }
            } else {
                logMsg("Add new item", nmId, prefix);

                addItem(prefix, nmId, {
                    reviews: [review.id],
                });
            }
        }
    }

    return true;
}

(async () => {
    for (const prefix of ids) {
        if (options.force) {
            await restorePrefix(prefix);
            continue;
        }

        let stoped = false;

        while (!stoped) {
            const answer = await inquirer.prompt([
                {
                    type: "boolean",
                    name: "prefix",
                    message: `Restore ${prefix}?`,
                    default: false,
                },
            ]);

            if (answer.prefix == "true") {
                await restorePrefix(prefix);
            } else {
                stoped = true;
            }
        }
    }
})();
