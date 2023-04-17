import options from "../options.js";

let ids = [
    "aliexpress",
    "amazon",
    "decathlon",
    "ebay",
    "onliner",
    "ozon",
    "wildberries",
];

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
