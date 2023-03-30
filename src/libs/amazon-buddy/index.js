import AmazonScraper from "./Amazon.js";
import constants from "./constant.js";

export const INIT_OPTIONS = {
    bulk: true,
    number: constants.defaultItemLimit,
    filetype: "",
    rating: [1, 5],
    page: 1,
    cookie: "",
    asyncTasks: 5,
    sponsored: false,
    category: "aps",
    cli: false,
    sort: false,
    discount: false,
    reviewFilter: {
        // Sort by recent/top reviews
        sortBy: "recent",
        // Show only reviews with verified purchase
        verifiedPurchaseOnly: false,
        // Show only reviews with specific rating or positive/critical
        filterByStar: "",
        formatType: "all_formats",
    },
};

export async function products(options) {
    options = { ...INIT_OPTIONS, ...options };
    options.geo = constants.geo[options.country]
        ? constants.geo[options.country]
        : constants.geo.US;
    options.scrapeType = "products";
    if (!options.bulk) {
        options.asyncTasks = 1;
    }

    return await new AmazonScraper(options).startScraper();
}

export async function reviews(options) {
    options = { ...INIT_OPTIONS, ...options };
    options.geo = constants.geo[options.country]
        ? constants.geo[options.country]
        : constants.geo.US;
    options.scrapeType = "reviews";
    if (!options.bulk) {
        options.asyncTasks = 1;
    }

    return await new AmazonScraper(options).startScraper();
}

export async function asin(options) {
    options = { ...INIT_OPTIONS, ...options };
    options.geo = constants.geo[options.country]
        ? constants.geo[options.country]
        : constants.geo.US;
    options.scrapeType = "asin";
    options.asyncTasks = 1;

    return await new AmazonScraper(options).startScraper();
}

export async function categories(options) {
    options = { ...INIT_OPTIONS, ...options };
    options.geo = constants.geo[options.country]
        ? constants.geo[options.country]
        : constants.geo.US;

    return await new AmazonScraper(options).extractCategories();
}

export async function countries() {
    const output = [];
    for (const item in constants.geo) {
        output.push({
            country: constants.geo[item].country,
            country_code: item,
            currency: constants.geo[item].currency,
            host: constants.geo[item].host,
        });
    }
    return output;
}

export default products;
