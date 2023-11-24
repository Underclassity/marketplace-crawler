import express from "express";

import { LowSync, MemorySync } from "lowdb";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import { getFilesSize } from "../helpers/db.js";
import { processCookiesAndSession } from "../adapters/aliexpress.js";
import browserConfig from "../helpers/browser-config.js";
import createQueue from "../helpers/create-queue.js";
import priorities from "../helpers/priorities.js";

import options from "../options.js";

const sizeDb = new LowSync(new MemorySync(), {});

sizeDb.read();

if (!sizeDb.data) {
    sizeDb.data = {};
    sizeDb.write();
}

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

let browser;

export const queue = createQueue();

export const queueRouter = express.Router();

async function launchBrowser() {
    return await puppeteer.launch({
        ...browserConfig,
        headless: false,
        devtools: true,
    });
}

queueRouter.get("/", (req, res) => {
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

queueRouter.post("/:adapter", async (req, res) => {
    const { adapter } = req.params;

    if (adapter == "aliexpress" && options.cookies) {
        await processCookiesAndSession();
    }

    const { items, brand, query } = req.body;

    const result = {};

    if (!browser) {
        browser = await launchBrowser();
    }

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

export default queueRouter;
