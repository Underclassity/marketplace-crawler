import options from "../options.js";

/**
 * Adapters IDs storage
 *
 * @var {Array}
 */
export let ids = [
    "aliexpress",
    "amazon",
    "decathlon",
    "ebay",
    "joom",
    "kufar",
    "onliner",
    "ozon",
    "tokopedia",
    "trendyol",
    "wiggle",
    "wildberries",
];

/**
 * Get adapters IDs array based on choosen options
 *
 * @return  {Array}  Array of adapters IDs
 */
export function getAdaptersIds() {
    if (!options.include.length && !options.exclude.length) {
        return ids;
    }

    // filter by include
    if (options.include.length) {
        ids = ids.filter((id) => {
            return options.include.includes(id) ? true : false;
        });
    }

    // filter by exclude
    if (options.exclude.length) {
        ids = ids.filter((id) => {
            return options.exclude.includes(id) ? false : true;
        });
    }

    return ids;
}

export default getAdaptersIds;
