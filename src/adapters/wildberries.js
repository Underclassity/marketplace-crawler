import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import options from "../options.js";
import log from "../helpers/log.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath);
}

const wildberriesAdapter = new JSONFileSync(path.resolve(dbPath, "users.json"));
const wildberriesDb = new LowSync(wildberriesAdapter);

wildberriesDb.read();

if (!wildberriesDb.data) {
  wildberriesDb.data = {};
  wildberriesDb.write();
}

export async function getFeedback(id, feedback, query, queue) {
  if (!(feedback.id in wildberriesDb.data)) {
    wildberriesDb.data[feedback.id] = feedback;
    wildberriesDb.write();
  }

  const photos = feedback.photos.map(
    (item) => `https://feedbackphotos.wbstatic.net/${item.fullSizeUri}`
  );

  log(
    `[Wildberries] ${query}: ${id} - Try to download ${photos.length} photos`
  );

  const saveDirPath = path.resolve(options.directory, "./download");

  if (!fs.existsSync(saveDirPath)) {
    fs.mkdirSync(saveDirPath);
  }

  const itemFolderPath = path.resolve(saveDirPath, id.toString());

  if (!fs.existsSync(itemFolderPath)) {
    fs.mkdirSync(itemFolderPath);
  }

  for (const photo of photos) {
    const filename = path.parse(photo).base;

    const filepath = path.resolve(itemFolderPath, filename);
    const filepathWebp = path.resolve(
      itemFolderPath,
      `${path.parse(photo).name}.webp`
    );

    let isSizeEqual = true;

    if (fs.existsSync(filepath) && !fs.existsSync(filepathWebp)) {
      log(
        `[Wildberries] ${query}: ${id} - Try to check filesize for ${filename}`
      );

      await queue.add(
        async () => {
          try {
            const headRequest = await axios(photo, {
              method: "head",
              timeout: options.timeout,
            });
            const { headers } = headRequest;

            const contentLength = parseInt(headers["content-length"]);
            const size = fs.statSync(filepath).size;

            isSizeEqual = contentLength === size;

            log(
              `[Wildberries] ${query}: ${id} - Filesize for ${filename} equal`
            );

            return true;
          } catch (error) {
            console.log(
              `[Wildberries] ${query}: ${id} - Filesize ${filename} check eror`
            );
            console.error(error.message);

            return false;
          }
        },
        { priority: 4 }
      );
    }

    if (
      (!fs.existsSync(filepath) && !fs.existsSync(filepathWebp)) ||
      !isSizeEqual ||
      options.force
    ) {
      log(`[Wildberries] ${query}: ${id} - Download ${filename}`);

      await queue.add(
        async () => {
          try {
            const res = await axios(photo, {
              responseType: "stream",
            });

            res.data.pipe(fs.createWriteStream(filepath));

            log(`[Wildberries] ${query}: ${id} - Downloaded ${filename}`);
          } catch (error) {
            console.error(error.message);
          }
        },
        { priority: 5 }
      );
    } else {
      log(`[Wildberries] ${query}: ${id} - File ${filename} exists`);
    }
  }

  return true;
}

export async function getItemInfo(id, query) {
  log(`[Wildberries] ${query}: ${id} - Get full info`);

  try {
    const request = await axios(
      "https://feedbacks.wildberries.ru/api/v1/summary/full",
      {
        data: {
          imtId: id,
          take: 30,
          skip: 0,
        },
        method: "POST",
        timeout: options.timeout,
      }
    );

    return request.data;
  } catch (error) {
    console.error(error.message);
  }

  return false;
}

export async function getFeedbacks(id, query, queue) {
  log(`[Wildberries] ${query}: ${id} - Feedbacks get`);

  const feedbacks = [];

  const fullInfo = await queue.add(() => getItemInfo(id, query), {
    priority: 2,
  });

  if (!fullInfo) {
    log(`[Wildberries] ${query}: ${id} - No feedbacks found`);

    return feedbacks;
  }

  log(
    `[Wildberries] ${query}: ${id} - Found ${fullInfo.feedbackCountWithPhoto} feedbacks`
  );

  const itterations = Math.round(fullInfo.feedbackCountWithPhoto / 30);

  for (let i = 0; i <= itterations; i++) {
    await queue.add(
      async () => {
        const itterData = await feedbacksRequest(id, query, i * 30);

        if (!itterData) {
          return false;
        }

        itterData.feedbacks.forEach((item) => feedbacks.push(item));
      },
      { priority: 3 }
    );
  }

  return feedbacks;
}

export async function feedbacksRequest(id, query, skip) {
  log(`[Wildberries] ${query}: ${id} - Get feedbacks with skip ${skip}`);

  try {
    const request = await axios(
      "https://feedbacks.wildberries.ru/api/v1/feedbacks/site",
      {
        data: {
          hasPhoto: true,
          imtId: id,
          order: "dateDesc",
          take: 30,
          skip,
        },
        // headers: {
        //   'content-type': 'application/json'
        // },
        method: "POST",
        timeout: options.timeout,
      }
    );

    return request.data;
  } catch (error) {
    console.error(error.message);
  }

  return false;
}

export async function itemsRequest(query, page = 1) {
  log(`[Wildberries] ${query}: Page ${page} items get`);

  try {
    const getItemsRequest = await axios(
      `
        https://search.wb.ru/exactmatch/sng/common/v4/search?query=${query}&resultset=catalog&limit=100&sort=popular&page=4&appType=128&curr=byn&locale=by&lang=ru&dest=12358386,12358404,3,-59208&regions=1,4,22,30,31,33,40,48,66,68,69,70,80,83&emp=0&reg=1&pricemarginCoeff=1.0&offlineBonus=0&onlineBonus=0&spp=0&page=${page}
        `,
      {
        timeout: options.timeout,
      }
    );

    return getItemsRequest.data;
  } catch (error) {
    console.error(error.message);
  }

  return false;
}

export async function getItemsByQuery(query, queue) {
  log(`[Wildberries] ${query}: Get items call`);

  for (let page = 1; page <= options.pages; page++) {
    const getItemsData = await queue.add(() => itemsRequest(query, page), {
      priority: 0,
    });

    if (!getItemsData || !getItemsData.data) {
      log(`[Wildberries] ${query}: No items left`);
      page = options.pages;
      continue;
    }

    if (!getItemsData.data.products.length) {
      page = options.pages;
      continue;
    }

    let results = getItemsData.data.products
      .map((item) => item.root)
      .filter((item, index, array) => array.indexOf(item) === index)
      .map((item) => (item = parseInt(item, 10)));

    log(`[Wildberries] ${query}: Page ${page} found ${results.length} items`);

    for (let itemId of results) {
      let feedbacks = await queue.add(
        () => getFeedbacks(itemId, query, queue),
        {
          priority: 1,
        }
      );

      for (let feedback of feedbacks) {
        queue.add(() => getFeedback(itemId, feedback, query, queue), {
          priority: 3,
        });
      }
    }
  }

  return true;
}

export default getItemsByQuery;
