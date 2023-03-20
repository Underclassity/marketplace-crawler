import fs from "node:fs";
import path from "node:path";

import axios from "axios";
import cheerio from "cheerio";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

import createPage from "../helpers/create-page.js";
import goSettings from "../helpers/go-settings.js";
import log from "../helpers/log.js";
import options from "../options.js";
import autoScroll from "../helpers/auto-scroll.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const ebayAdapter = new JSONFileSync(path.resolve(dbPath, "ebay.json"));
const ebayDb = new LowSync(ebayAdapter);

ebayDb.read();

if (!ebayDb.data) {
    ebayDb.data = {};
    ebayDb.write();
}

// Configure puppeteer
puppeteer.use(
    AdblockerPlugin({
        blockTrackers: true,
    })
);

puppeteer.use(StealthPlugin());

function getItemId(link) {
    return link.match(/(\d+)/gim).filter((item) => item.length >= 10)[0];
}

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

async function getPhotosURLs(itemId) {
    try {
        let request = await axios(
            `http://www.isdntek.com/fetch/fetchpgsource.php?cnt=1&deweb=1&delay=50&pg1=https%3A//www.ebay.com/itm/${itemId}%3Forig_cvip%3Dtrue%26nordt%3Dtrue`,
            {
                timeout: options.timeout,
                responseType: "document",
            }
        );

        let html = request.data;

        let $ = cheerio.load(html);

        $ = cheerio.load($("#pagesourcecode").text());

        let imageUrls = [];

        $("img").each(function (index, image) {
            imageUrls.push($(image).attr("src"));
        });

        imageUrls = imageUrls
            .filter((item) => item)
            .filter(
                (imageURL) =>
                    imageURL.indexOf("https://i.ebayimg.com/images/g/") != -1
            )
            .filter(onlyUnique)
            .map(function (imageURL) {
                return {
                    id: imageURL
                        .match(/g\/(.+)\/s/gim)[0]
                        .replace("g/", "")
                        .replace("/s", ""),
                    link: imageURL,
                    ext: imageURL.split(".").pop(),
                };
            });

        return imageUrls;
    } catch (error) {
        console.log(error.message);
    }

    return false;
}

async function download(id, query, photoObject, photoURL, imagePath) {
    log(`[Ebay] ${query}: ${id} - Try to download ${photoObject.id}`);

    const dirPath = path.dirname(imagePath);

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    try {
        const res = await axios(photoURL, {
            responseType: "stream",
            timeout: options.timeout * 2,
        });

        res.data.pipe(fs.createWriteStream(imagePath));

        log(`[Ebay] ${query}: ${id} - Downloaded ${photoObject.id}`);

        return true;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

export async function getItemsByQuery(query, queue) {
    const browser = await puppeteer.launch({
        headless: options.headless,
    });

    let pagesCount = options.pages;
    let itemsPerPage = 200; // 200, 100, 50, 25

    let allItemsCount = 0;

    for (let pageId = 1; pageId <= pagesCount; pageId++) {
        log(`[Ebay] ${query}: Get page ${pageId}`);

        let page = await createPage(browser, true);

        await page.goto(
            `https://www.ebay.com/sch/i.html?_fsrp=1&_sop=12&_nkw=${query.replace(
                /\s/g,
                "+"
            )}&LH_ItemCondition=1500%7C1750%7C3000&rt=nc&_ipg=${itemsPerPage}&_pgn=${pageId}`,
            goSettings
        );

        await autoScroll(page);

        let itemsCount = await page.$eval(
            ".srp-controls__count-heading",
            function (element) {
                return parseInt(element.textContent.replace(",", ""), 10);
            }
        );

        pagesCount = Math.floor(itemsCount / itemsPerPage) + 2;

        let itemsLinks = await page.$$eval(".s-item a", function (items) {
            return Array.from(items).map((item) => item.href);
        });

        await page.close();

        let ids = itemsLinks
            .map(getItemId)
            .map((item) => parseInt(item, 10))
            .filter((item) => item)
            .filter(onlyUnique)
            .map((item) => item.toString());

        if (!ids.length) {
            pageId == pagesCount;
            continue;
        }

        log(`[Ebay] ${query}: Found ${ids.length} on page ${pageId}`);

        allItemsCount += ids.length;

        for (let id of ids) {
            let folderPath = path.resolve(
                options.directory,
                "download",
                "ebay",
                id
            );

            queue.add(
                async () => {
                    log(`[Ebay] ${query}: ${id} - Get photos for ${id}`);

                    let photos = await getPhotosURLs(id);

                    for (let photoObject of photos) {
                        let photoURL = `https://i.ebayimg.com/images/g/${photoObject.id}/s-l1600.${photoObject.ext}`;

                        let imagePath = path.resolve(
                            folderPath,
                            `${photoObject.id}.${photoObject.ext}`
                        );

                        if (fs.existsSync(imagePath)) {
                            continue;
                        }

                        queue.add(
                            async () => {
                                await download(
                                    id,
                                    query,
                                    photoObject,
                                    photoURL,
                                    imagePath
                                );
                            },
                            { priority: 5 }
                        );
                    }
                },
                { priority: 4 }
            );
        }
    }

    log(`Found ${allItemsCount} items`);

    await browser.close();

    return true;
}

export default getItemsByQuery;
