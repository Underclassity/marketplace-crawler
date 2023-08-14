import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import ViteExpress from "vite-express";

import "dotenv/config";

// Express.js and modules
import { expressSharp, FsAdapter } from "express-sharp";
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
// import morgan from "morgan";

import { LowSync, MemorySync } from "lowdb";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import {
    addToFavorite,
    deleteItem,
    getBrands,
    getFilesSize,
    getItem,
    getPredictions,
    getTags,
    isFavorite,
    loadDB,
    removeFromFavorite,
} from "../helpers/db.js";
import { processCookiesAndSession } from "../adapters/aliexpress.js";
import browserConfig from "../helpers/browser-config.js";
import createQueue from "../helpers/create-queue.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";
import getRandom from "../helpers/random.js";
import logMsg from "../helpers/log-msg.js";
import priorities from "../helpers/priorities.js";

import options from "../options.js";

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
    ...browserConfig,
    headless: false,
    devtools: true,
});

const sizeDb = new LowSync(new MemorySync(), {});

sizeDb.read();

if (!sizeDb.data) {
    sizeDb.data = {};
    sizeDb.write();
}

const app = express();
const port = process.env.port || 3000;

const downloadFolderPath = path.resolve(options.directory, "download");

const queue = createQueue();

app.use(bodyParser.json());
app.use(compression());
app.use(cors());
app.use(express.static(downloadFolderPath));
// app.use(morgan("combined"));

const adapters = getAdaptersIds();

for (const adapter of adapters) {
    app.use(
        `/static/${adapter}`,
        expressSharp({
            imageAdapter: new FsAdapter(
                path.resolve(options.directory, "download", adapter)
            ),
        })
    );
}

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

app.get("/adapters", (req, res) => {
    return res.json({ adapters: getAdaptersIds() });
});

app.get("/adapters/:adapter", (req, res) => {
    const { adapter } = req.params;

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;
    const isFavoriteFlag = req.query.favorite == "true" || false;
    const sortId = req.query.sort || false;
    let brand = req.query.brand || false;
    let tag = req.query.tag || false;

    if (brand == "false" || brand == "true") {
        brand = false;
    }

    if (tag == "false") {
        tag = false;
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

        resultItem.id = itemId;
        resultItem.reviews = db.data[itemId]?.reviews?.length || 0;
        resultItem.images = getRandomFilesIds(adapter, itemId).sort();
        resultItem.files =
            itemId in dbFiles.data ? dbFiles.data[itemId].length : 0;

        resultItem.size = sizeDb.data[`${adapter}-${itemId}`];
        resultItem.favorite = isFavorite(adapter, itemId);

        items.push(resultItem);
    }

    logMsg(
        `Get page ${page} for adapter ${adapter} with limit ${limit}: ${resultItemsIDs.length} items from ${count}`
    );

    return res.json({ items, count: allItemsIDs.length, error: false });
});

app.get("/adapters/:adapter/:itemId", (req, res) => {
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

    const dbPrefix = `${adapter}-products`;
    const dbFilesPrefix = `${adapter}-files`;
    const dbReviewsPrefix = `${adapter}-reviews`;

    const db = loadDB(dbPrefix);
    const dbFiles = loadDB(dbFilesPrefix);
    const dbReviews = loadDB(dbReviewsPrefix);

    const info = db.data[itemId];

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

    delete info.reviews;

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
        info,
        reviews,
        count: files.length,
        size,
        error: false,
    });
});

app.delete("/adapters/:adapter/:itemId", (req, res) => {
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

app.get("/files/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            info: {},
            files: [],
            count: 0,
            error: `${adapter} not found in adapters`,
        });
    }

    const dbFilesPrefix = `${adapter}-files`;

    const dbFiles = loadDB(dbFilesPrefix);

    if (!(itemId in dbFiles.data)) {
        return res.json({
            files: {},
            count: 0,
            error: `${itemId} not found in database`,
        });
    }

    const files = itemId in dbFiles.data ? dbFiles.data[itemId].sort() : [];

    return res.json({
        files,
        count: files.length,
        error: false,
    });
});

app.get("/brands/:adapter", (req, res) => {
    const { adapter } = req.params;

    const brands = getBrands(adapter, true);

    return res.json({
        brands,
        error: false,
    });
});

app.get("/tags/:adapter", (req, res) => {
    const { adapter } = req.params;

    const tags = getTags(adapter);

    return res.json({
        tags,
        error: false,
    });
});

app.get("/predictions/:adapter", (req, res) => {
    const { adapter } = req.params;

    const predictions = getPredictions(adapter);

    return res.json({
        predictions,
        error: false,
    });
});

app.get("/favorite/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    const dbFavoritePrefix = `${adapter}-favorite`;

    const dbFavorite = loadDB(dbFavoritePrefix);

    if (!(itemId in dbFavorite.data) && !dbFavorite.data[itemId]) {
        return res.json({
            result: false,
            error: false,
        });
    }

    return res.json({
        result: true,
        error: false,
    });
});

app.post("/favorite/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    const result = addToFavorite(adapter, itemId);

    return res.json({
        result,
        error: false,
    });
});

app.delete("/favorite/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    const result = removeFromFavorite(adapter, itemId);

    return res.json({
        result,
        error: false,
    });
});

app.get("/queue", (req, res) => {
    const { size, pending, isPaused } = queue;

    const result = {
        size,
        pending,
        isPaused,
        error: false,
    };

    for (const priority in priorities) {
        result[priority] = queue.sizeBy({ priority: priorities[priority] });
    }

    return res.json(result);
});

app.post("/queue/:adapter", async (req, res) => {
    const { adapter } = req.params;

    if (adapter == "aliexpress" && options.cookies) {
        await processCookiesAndSession();
    }

    const { items, brand, query } = req.body;

    const result = {};

    if (Array.isArray(items)) {
        const { updateItemById } = await import(`../adapters/${adapter}.js`);

        if (!updateItemById) {
            return res.json({
                result: false,
                error: true,
            });
        }

        for (const itemId of items) {
            const updateResult = await updateItemById(itemId, queue, browser);

            // Update size DB
            sizeDb.data[`${adapter}-${itemId}`] = getFilesSize(adapter, itemId);
            sizeDb.write();

            result[itemId] = updateResult;
        }
    }

    if (brand?.length) {
        const { getItemsByBrand } = await import(`../adapters/${adapter}.js`);

        if (!getItemsByBrand) {
            return res.json({
                result: false,
                error: true,
            });
        }

        const updateResult = await getItemsByBrand(queue, brand, browser);

        result[brand] = updateResult;
    }

    if (query?.length) {
        const { getItemsByQuery } = await import(`../adapters/${adapter}.js`);

        if (!getItemsByQuery) {
            return res.json({
                result: false,
                error: true,
            });
        }

        const updateResult = await getItemsByQuery(queue, query, browser);

        result[brand] = updateResult;
    }

    return res.json({
        result,
        error: false,
    });
});

// app.listen(port, () => {
//     logMsg(`Example app listening on port ${port}`);
// });

ViteExpress.listen(app, port, () => {
    logMsg(`Example app listening on port ${port}`);
});
