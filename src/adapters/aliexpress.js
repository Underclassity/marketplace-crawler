import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import createPage from "../helpers/create-page.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
import sleep from "../helpers/sleep.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const aliexpressAdapter = new JSONFileSync(
    path.resolve(dbPath, "aliexpress.json")
);
const aliexpressDb = new LowSync(aliexpressAdapter);

aliexpressDb.read();

if (!aliexpressDb.data) {
    aliexpressDb.data = {};
    aliexpressDb.write();
}

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

export async function processPage(pageId, query = "", browser, totalFound) {
    aliexpressDb.read();

    log(`Process page ${pageId} for ${query}`);

    const page = await createPage(browser, true);

    if (options.url && options.url.length) {
        let url = options.url;

        url = url.replace(/&page=\d+/g, "");

        await page.goto(`${url}&page=${pageId}`, goSettings);
    } else {
        await page.goto(
            `https://aliexpress.com/wholesale?trafficChannel=main&d=y&CatId=0&SearchText=${query.replace(
                /\s/g,
                "+"
            )}&ltype=wholesale&SortType=total_tranpro_desc&page=${pageId}`,
            goSettings
        );
    }

    let isCaptcha = await page.evaluate(() => {
        if (document.querySelector(".captcha-tips")) {
            return true;
        } else {
            return false;
        }
    });

    if (isCaptcha) {
        console.log("CAPTCHA!!!");
        await sleep(10000);
        // await page.waitFor(60000);
        await page.close();
        return 0;
    }

    await autoScroll(page);

    let items = await page.$$eval("a", (links) => {
        return links
            .map((link) => link.href)
            .filter((link) => link.indexOf("/item/") != -1)
            .map((link) =>
                parseInt(
                    link.slice(
                        link.indexOf("/item/") + 6,
                        link.indexOf(".html")
                    ),
                    10
                )
            )
            .filter((value, index, array) => array.indexOf(value) == index);
    });

    log(`Found ${items.length} on page ${pageId} for ${query}`);

    for (let item of items) {
        let inDbDoc = aliexpressDb.data.find(function (productItem) {
            return productItem.id == item;
        });

        if (!inDbDoc) {
            aliexpressDb.data.push({
                id: item,
                tags: [query],
            });
        } else {
            if (inDbDoc.tags.indexOf(query) == -1) {
                inDbDoc.tags = [query].concat(inDbDoc.tags);
            }
        }
    }

    aliexpressDb.write();

    let pagesCount = 0;

    if (!totalFound && !options.pages) {
        try {
            pagesCount = await page.$eval(
                ".total-page",
                (el) => el.textContent
            );
        } catch (err) {
            console.log(err);
            pagesCount = 0;
        }

        let pagesRegex = /\d+/gi;

        pagesCount = parseInt(pagesRegex.exec(pagesCount), 10);

        log(`Total pages count: ${pagesCount}`);
    }

    await page.close();

    return pagesCount;
}

export async function itemsRequest(query, page = 1) {
    try {
        let pageRequest = await axios(
            `https://aliexpress.ru/wholesale?SearchText=${query}`
        );

        console.log(pageRequest.data);

        // let request = await axios(
        //     `https://aliexpress.ru/aer-webapi/v1/search?_bx-v=2.2.3`,
        //     {
        //         method: "POST",
        //         timeout: options.timeout,
        //         data: {
        //             searchText: query,
        //             page: page,
        //             source: "direct",
        //             storeIds: [],
        //             g: "y",
        //             catId: "",

        //             searchInfo: "RvddzAsD4ZWJlTlSIL6sVw==",
        //         },
        //     }
        // );

        // return request.data;
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.log(error.response.data);
            console.log(error.response.status);
            console.log(error.response.headers);
        } else if (error.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.log(error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.log("Error", error.message);
        }

        console.log(error.config);
    }

    return false;
}

export async function getItemsByQuery(query, queue) {
    log(`[Aliexpress] ${query}: Get items call`);

    let totalFound = false;

    let browser = await puppeteer.launch({
        headless: options.headless,
        args: ["--disable-notifications"],
    });

    for (let page = 1; page <= options.pages; page++) {
        let browser = await puppeteer.launch({
            headless: options.headless,
            args: ["--disable-notifications"],
        });

        let pagesCount = await processPage(page, query, browser, totalFound);

        if (pagesCount > 0 && pagesCount < options.pages) {
            console.log(
                `Set total pages to ${pagesCount} for ${options.query}`
            );
            totalFound = true;
            options.pages = pagesCount;
        }
    }

    let pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));

    await browser.close();
}

export default getItemsByQuery;
