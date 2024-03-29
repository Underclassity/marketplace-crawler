import fs from "node:fs";
import path from "node:path";

import { LowSync, MemorySync } from "lowdb";

import express from "express";

import {
    deleteItem,
    getFiles,
    getFilesSize,
    getItem,
    getItems,
    isFavorite,
    loadDB,
} from "../helpers/db.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";
import getRandom from "../helpers/random.js";
import logMsg from "../helpers/log-msg.js";

import options from "../options.js";

const adapters = getAdaptersIds();

const sizeDb = new LowSync(new MemorySync(), {});

sizeDb.read();

if (!sizeDb.data) {
    sizeDb.data = {};
    sizeDb.write();
}

/**
 * Get random files for item ID
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  itemId   Item ID
 *
 * @return  {Array}            Files array
 */
function getRandomFilesIds(adapter, itemId) {
    if (!adapter || !itemId) {
        return [];
    }

    const dbPrefix = `${adapter}-files`;

    const db = loadDB(dbPrefix);

    if (itemId in db.data) {
        let files = db.data[itemId];

        if (!Array.isArray(files)) {
            return [];
        }

        files = files.filter((filename) => path.extname(filename) != ".mp4");

        return files.length >= 9 ? getRandom(files, 9) : files;
    } else {
        return [];
    }
}

export const adapterRouter = express.Router();

adapterRouter.get("/", (req, res) => {
    const data = adapters.map((adapter) => {
        const items = getItems(adapter, true);
        const files = items
            .map((itemId) => getFiles(adapter, itemId)?.length || 0)
            .reduce((a, b) => a + b, 0);
        const reviews = items.reduce((prev, current) => {
            prev += getItem(adapter, current)?.reviews?.length || 0;
            return prev;
        }, 0);

        return {
            id: adapter,
            items: items.length,
            files,
            reviews,
        };
    });

    return res.json({ adapters: data });
});

adapterRouter.get("/:adapter", (req, res) => {
    const { adapter } = req.params;

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;
    const isFavoriteFlag = req.query.favorite == "true" || false;
    const sortId = req.query.sort || false;
    let brand = req.query.brand || false;
    let tag = req.query.tag || false;
    let category = req.query.category || false;

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

    const dbPrefix = `${adapter}-products`;
    const dbFilesPrefix = `${adapter}-files`;

    const db = loadDB(dbPrefix);
    const dbFiles = loadDB(dbFilesPrefix);

    const count = Object.keys(db.data).length;

    let allItemsIDs = Object.keys(db.data)
        .filter((itemId) => !db.data[itemId]?.deleted)
        .filter((itemId) => {
            if (!tag) {
                return true;
            }

            if (tag == "no-tag") {
                return !db.data[itemId]?.tags.length;
            }

            return db.data[itemId].tags.includes(tag);
        })
        .filter((itemId) => {
            if (!isFavoriteFlag) {
                return true;
            }

            if (isFavorite(adapter, itemId)) {
                return true;
            }

            return false;
        })
        .filter((itemId) => {
            if (!isPhotos) {
                return true;
            }

            if (!(itemId in dbFiles.data)) {
                return false;
            }

            return dbFiles.data[itemId].length;
        })
        .filter((itemId) => {
            if (!category) {
                return true;
            }

            if (category == "no-category") {
                return !db.data[itemId]?.info;
            }

            const { info } = db.data[itemId];

            if (info?.data?.subject_id == category) {
                return true;
            }

            return false;
        });

    if (brand) {
        allItemsIDs = allItemsIDs.filter((itemId) => {
            if (brand == "no-brand") {
                return !("brand" in db.data[itemId]);
            }

            return db.data[itemId]?.brand == brand;
        });
    }

    if (sortId) {
        allItemsIDs = allItemsIDs.sort((a, b) => {
            const aItem = db.data[a];
            const bItem = db.data[b];

            if (!(`${adapter}-${a}` in sizeDb.data)) {
                sizeDb.data[`${adapter}-${a}`] = getFilesSize(adapter, a);
                sizeDb.write();
            }

            if (!(`${adapter}-${b}` in sizeDb.data)) {
                sizeDb.data[`${adapter}-${b}`] = getFilesSize(adapter, b);
                sizeDb.write();
            }

            if (sortId == "reviewsAsc") {
                return (
                    (aItem?.reviews?.length || 0) -
                    (bItem?.reviews?.length || 0)
                );
            }

            if (sortId == "reviewsDesc") {
                return (
                    (bItem?.reviews?.length || 0) -
                    (aItem?.reviews?.length || 0)
                );
            }

            if (sortId == "sizeAsc" || sortId == "sizeDesc") {
                const aSize = sizeDb.data[`${adapter}-${a}`];
                const bSize = sizeDb.data[`${adapter}-${b}`];

                if (sortId == "sizeAsc") {
                    return aSize - bSize;
                }

                if (sortId == "sizeDesc") {
                    return bSize - aSize;
                }
            }

            if (!(sortId == "filesAsc" || sortId == "filesDesc")) {
                return false;
            }

            const aFilesCount = a in dbFiles.data ? dbFiles.data[a].length : 0;
            const bFilesCount = b in dbFiles.data ? dbFiles.data[b].length : 0;

            if (sortId == "filesAsc") {
                return aFilesCount - bFilesCount;
            }

            if (sortId == "filesDesc") {
                return bFilesCount - aFilesCount;
            }
        });
    }

    // Cut items
    const resultItemsIDs = allItemsIDs.slice(
        (page - 1) * limit,
        (page - 1) * limit + limit
    );

    const items = [];

    for (const itemId of resultItemsIDs) {
        const resultItem = { ...db.data[itemId] };

        delete resultItem.info;
        delete resultItem.ids;
        delete resultItem.prices;

        resultItem.id = itemId;
        resultItem.reviews = db.data[itemId]?.reviews?.length || 0;
        resultItem.images = getRandomFilesIds(adapter, itemId).sort();
        resultItem.files =
            itemId in dbFiles.data ? dbFiles.data[itemId].length : 0;

        resultItem.size = sizeDb.data[`${adapter}-${itemId}`];
        resultItem.favorite = isFavorite(adapter, itemId);
        resultItem.category = db.data[itemId]?.info?.data?.subject_id;

        items.push(resultItem);
    }

    logMsg(
        `Get page ${page} for adapter ${adapter} with limit ${limit}: ${resultItemsIDs.length} items from ${count}`
    );

    return res.json({ items, count: allItemsIDs.length, error: false });
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

adapterRouter.get("/:adapter/:itemId", (req, res) => {
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

    const dbFilesPrefix = `${adapter}-files`;
    const dbReviewsPrefix = `${adapter}-reviews`;

    const dbFiles = loadDB(dbFilesPrefix);
    const dbReviews = loadDB(dbReviewsPrefix);

    const info = getItem(adapter, itemId);

    const files = itemId in dbFiles.data ? dbFiles.data[itemId].sort() : [];
    const filesNames = files.map((filename) => path.parse(filename).name);

    const reviews = (info.reviews || [])
        .map((reviewId) => dbReviews.data[reviewId] || [])
        .filter((review) => {
            if (adapter == "aliexpress") {
                return review?.images || review?.additionalReview?.images;
            }

            if (adapter == "wildberries") {
                return review?.photos;
            }
        })
        .map((review) => {
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
                    })
                );
            }

            images = images
                .filter((item) => item?.url)
                .map((item) => path.basename(item.url))
                .filter((filename) =>
                    filesNames.includes(path.parse(filename).name)
                )
                .map((filename) => {
                    const parsedFilename = path.parse(filename);
                    const webpFilename = `${parsedFilename.name}.webp`;

                    if (files.includes(webpFilename)) {
                        return webpFilename;
                    }

                    return filename;
                });

            return {
                id: review.id,
                images,
            };
        });

    // delete info.reviews;

    const size = files
        .filter((filename) =>
            fs.existsSync(
                path.resolve(
                    options.directory,
                    "download",
                    adapter,
                    itemId,
                    filename
                )
            )
        )
        .reduce((previous, current) => {
            previous += fs.statSync(
                path.resolve(
                    options.directory,
                    "download",
                    adapter,
                    itemId,
                    current
                )
            ).size;
            return previous;
        }, 0);

    return res.json({
        info: {
            id: info.id,
            tags: info.tags,
            time: info.time,
        },
        reviews,
        count: files.length,
        size,
        error: false,
    });
});

adapterRouter.delete("/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    const item = getItem(adapter, itemId);

    if (!item || item.deleted) {
        return res.json({
            result: true,
            error: false,
        });
    }

    const thumbnailFilePath = path.resolve(
        options.directory,
        "thumbnails",
        adapter,
        `${adapter}.webp`
    );

    const itemDownloadFolder = path.resolve(
        options.directory,
        "download",
        adapter,
        adapter
    );

    // found db item and set delete param to true
    const { result } = deleteItem(adapter, itemId);

    // delete thumbnail
    if (fs.existsSync(thumbnailFilePath) && result) {
        fs.unlinkSync(thumbnailFilePath);
    }

    // delete item dir if exist
    if (fs.existsSync(itemDownloadFolder) && result) {
        fs.rmSync(itemDownloadFolder, { recursive: true });
    }

    return res.json({
        result,
        error: false,
    });
});

export default adapterRouter;
