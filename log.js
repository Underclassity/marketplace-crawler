import { getItems, getItem } from "./src/helpers/db.js";
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
    }
})();
