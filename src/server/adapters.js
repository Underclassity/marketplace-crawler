import path from "node:path";

import express from "express";

import {
    deleteItem,
    getFiles,
    getItem,
    getItemFiles,
    getItemsData,
    getItemsDataByParams,
    getReview,
    isFavorite,
    loadDB,
} from "../helpers/db.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";
import getRandom from "../helpers/random.js";
import logMsg from "../helpers/log-msg.js";

import options from "../options.js";

const adapters = getAdaptersIds();

export const adapterRouter = express.Router();

adapterRouter.get("/", async (req, res) => {
    const data = [];

    for (const adapter of adapters) {
        const items = await getItemsData(adapter);

        let files = 0;
        let reviews = 0;

        for (const { value: item } of items) {
            if (item?.stats?.count?.files) {
                files += item.stats.count.files;
            }

            if (item?.reviews?.length) {
                reviews += item.reviews.length;
            }
        }

        data.push({
            id: adapter,
            items: items.length,
            files: 0,
            reviews: 0,
        });
    }

    return res.json({ adapters: data });
});

adapterRouter.get("/:adapter", async (req, res) => {
    const { adapter } = req.params;

    logMsg("Get params for request", adapter);

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;
    const isFavoriteFlag = req.query.favorite == "true" || false;
    const sortId = req.query.sort || false;
    let brand = req.query.brand || false;
    let tag = req.query.tag || false;
    let category = req.query.category || false;
    const deleted = req.query.deleted || false;

    if (brand == "false" || brand == "true") {
        brand = false;
    }

    if (tag == "false") {
        tag = false;
    }

    if (category == "false") {
        category = false;
    }

    if (!adapters.includes(adapter)) {
        return res.json({
            items: {},
            count: 0,
            error: `${adapter} not found in adapters`,
        });
    }

    const params = {
        page,
        limit,

        photos: isPhotos,
        favorite: isFavoriteFlag,

        sort: sortId,
        brand,
        tag,
        category,

        deleted,
    };

    const { items, count } = await getItemsDataByParams(adapter, params);

    const resultItems = [];

    for (const { id: itemId, value: item } of items) {
        // delete item.info;
        delete item.ids;
        delete item.prices;

        const itemFolderPath = path.resolve(
            options.directory,
            "download",
            adapter,
            itemId.toString(),
        );

        const files = await getItemFiles(adapter, itemId).map((item) => {
            return item.replace(itemFolderPath, "").replace(`/`, "");
        });

        item.id = itemId;
        item.reviews = item?.reviews?.length || 0;
        item.images = files?.length >= 9 ? getRandom(files, 9) : [];

        item.favorite = await isFavorite(adapter, itemId);
        item.category = item?.info?.data?.subject_id;

        resultItems.push(item);
    }

    logMsg(
        `Get page ${page} for adapter ${adapter} with limit ${limit}: ${resultItems.length} items from ${count}`,
        false,
        adapter,
    );

    return res.json({ items: resultItems, count, error: false });
});

adapterRouter.get("/:adapter/files", (req, res) => {
    const { adapter } = req.params;

    const dbFilesPrefix = `${adapter}-files`;
    const dbPredictionsPrefix = `${adapter}-predictions`;
    const dbProductsPrefix = `${adapter}-products`;

    const dbFiles = loadDB(dbFilesPrefix);
    const dbPredictions = loadDB(dbPredictionsPrefix);
    const dbProducts = loadDB(dbProductsPrefix);

    const files = {};

    for (const itemId in dbFiles.data) {
        if (!(itemId in dbFiles.data)) {
            continue;
        }

        if (dbProducts.data[itemId]?.deleted) {
            continue;
        }

        let itemFiles = dbFiles.data[itemId];

        if (!Array.isArray(itemFiles) || !itemFiles?.length) {
            continue;
        }

        itemFiles = itemFiles.filter((item) => !item.includes(".mp4"));

        for (const filename of itemFiles) {
            if (
                !dbPredictions.data[itemId] ||
                !(filename in dbPredictions.data[itemId])
            ) {
                if (!(itemId in files)) {
                    files[itemId] = [];
                }

                files[itemId].push(filename);
            }
        }
    }

    return res.json({ files });
});

adapterRouter.get("/:adapter/:itemId", async (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            info: {},
            files: [],
            count: 0,
            size: 0,
            error: `${adapter} not found in adapters`,
        });
    }

    const info = await getItem(adapter, itemId);
    const files = await getFiles(adapter, itemId);
    const filesNames = files.map((filename) => path.parse(filename).name);

    const reviews = [];

    for (const reviewId of info.reviews) {
        const review = await getReview(adapter, itemId, reviewId);

        let images = [];

        if (Array.isArray(review.images)) {
            images.push(...review.images);
        }

        if (Array.isArray(review?.additionalReview?.images)) {
            images.push(...review.additionalReview.images);
        }

        if (Array.isArray(review.photos)) {
            images.push(
                ...review.photos.map((item) => {
                    return {
                        url: `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`,
                    };
                }),
            );
        }

        images = images
            .filter((item) => item?.url)
            .map((item) => path.basename(item.url))
            .filter((filename) =>
                filesNames.includes(path.parse(filename).name),
            );
        // .map((filename) => {
        //     const parsedFilename = path.parse(filename);
        //     const webpFilename = `${parsedFilename.name}.webp`;

        //     if (files.includes(webpFilename)) {
        //         return webpFilename;
        //     }

        //     return filename;
        // });

        if (!images?.length) {
            continue;
        }

        reviews.push({
            id: review.id,
            images,
        });
    }

    return res.json({
        info: {
            id: info.id,
            tags: info.tags,
            time: info.time,
        },
        reviews,
        count: info.stats.count.files,
        size: info.stats.size,
        error: false,
    });
});

adapterRouter.delete("/:adapter/:itemId", async (req, res) => {
    const { adapter, itemId } = req.params;

    // found db item and set delete param to true
    const { result } = await deleteItem(adapter, itemId);

    return res.json({
        result,
        error: false,
    });
});

export default adapterRouter;
