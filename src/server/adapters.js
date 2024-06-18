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
    getItemsData,
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

export const adapterRouter = express.Router();

adapterRouter.get("/", async (req, res) => {
    const data = [];

    for (const adapter of adapters) {
        const items = await getItems(adapter, true);

        let files = 0;
        let reviews = 0;

        for (const itemId of items) {
            if (!itemId) {
                continue;
            }

            const itemFiles = await getFiles(adapter, itemId);

            if (itemFiles?.length) {
                files += itemFiles.length;
            }

            const item = await getItem(adapter, itemId);

            if (item?.reviews?.length) {
                reviews += item.reviews.length;
            }
        }

        data.push({
            id: adapter,
            items: items.length,
            files,
            reviews,
        });
    }

    return res.json({ adapters: data });
});

adapterRouter.get("/:adapter", async (req, res) => {
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

    const allItems = await getItemsData(adapter);

    const count = allItems.length;

    let allItemsIDs = allItems
        .filter(({ value }) => !value?.deleted)
        .filter(({ value }) => {
            if (!tag) {
                return true;
            }

            if (tag == "no-tag") {
                return !value?.tags.length;
            }

            return value.tags.includes(tag);
        })
        .filter(async ({ id }) => {
            if (!isFavoriteFlag) {
                return true;
            }

            if (await isFavorite(adapter, id)) {
                return true;
            }

            return false;
        })
        .filter(async ({ id }) => {
            if (!isPhotos) {
                return true;
            }

            const files = await getFiles(adapter, id);

            return files.length;
        })
        .filter(({ value }) => {
            if (!category) {
                return true;
            }

            if (category == "no-category") {
                return !value?.info;
            }

            const { info } = value;

            if (info?.data?.subject_id == category) {
                return true;
            }

            return false;
        });

    if (brand) {
        allItemsIDs = allItemsIDs.filter(({ value }) => {
            if (brand == "no-brand") {
                return !("brand" in value);
            }

            return value?.brand == brand;
        });
    }

    if (sortId) {
        allItemsIDs = allItemsIDs.sort(
            async ({ value: aValue, id: aId }, { value: bValue, id: bId }) => {
                if (sortId == "reviewsAsc") {
                    return (
                        (aValue?.reviews?.length || 0) -
                        (bValue?.reviews?.length || 0)
                    );
                }

                if (sortId == "reviewsDesc") {
                    return (
                        (bValue?.reviews?.length || 0) -
                        (aValue?.reviews?.length || 0)
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

                const aFiles = await getFiles(adapter, aId);
                const bFiles = await getFiles(adapter, bId);

                const aFilesCount = aFiles?.length ? aFiles.length : 0;
                const bFilesCount = bFiles?.length ? bFiles.length : 0;

                if (sortId == "filesAsc") {
                    return aFilesCount - bFilesCount;
                }

                if (sortId == "filesDesc") {
                    return bFilesCount - aFilesCount;
                }
            },
        );
    }

    // Cut items
    const resultItemsIDs = allItemsIDs.slice(
        (page - 1) * limit,
        (page - 1) * limit + limit,
    );

    const items = [];

    for (const { id: itemId, value: resultItem } of resultItemsIDs) {
        delete resultItem.info;
        delete resultItem.ids;
        delete resultItem.prices;

        const files = await getFiles(adapter, itemId);

        resultItem.id = itemId;
        resultItem.reviews = resultItem?.reviews?.length || 0;
        resultItem.images = files?.length >= 9 ? getRandom(files, 9) : [];
        resultItem.files = files?.length ? files.length : 0;

        resultItem.size = sizeDb.data[`${adapter}-${itemId}`];
        resultItem.favorite = await isFavorite(adapter, itemId);
        resultItem.category = resultItem?.info?.data?.subject_id;

        items.push(resultItem);
    }

    logMsg(
        `Get page ${page} for adapter ${adapter} with limit ${limit}: ${resultItemsIDs.length} items from ${count}`,
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
                    }),
                );
            }

            images = images
                .filter((item) => item?.url)
                .map((item) => path.basename(item.url))
                .filter((filename) =>
                    filesNames.includes(path.parse(filename).name),
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
                    filename,
                ),
            ),
        )
        .reduce((previous, current) => {
            previous += fs.statSync(
                path.resolve(
                    options.directory,
                    "download",
                    adapter,
                    itemId,
                    current,
                ),
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

adapterRouter.delete("/:adapter/:itemId", async (req, res) => {
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
        `${adapter}.webp`,
    );

    const itemDownloadFolder = path.resolve(
        options.directory,
        "download",
        adapter,
        adapter,
    );

    // found db item and set delete param to true
    const { result } = await deleteItem(adapter, itemId);

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
