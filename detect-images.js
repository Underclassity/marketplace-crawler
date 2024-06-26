import fs from "node:fs";
import path from "node:path";

import {
    addPrediction,
    getFiles,
    getItems,
    getItemPredictions,
} from "./src/helpers/db.js";
import { detectImage, loadModel, readImage } from "./src/helpers/detect.js";
import { logMsg, logQueue } from "./src/helpers/log-msg.js";
import getAdaptersIds from "./src/helpers/get-adapters-ids.js";
import createQueue from "./src/helpers/create-queue.js";
import sleep from "./src/helpers/sleep.js";

import options from "./src/options.js";
// import priorities from "./src/helpers/priorities.js";

const adapters = getAdaptersIds();

const queue = createQueue();

// Time counter
let counter = 0;

/**
 * Get predictions for given file
 *
 * @param   {String}  adapter   Adapter
 * @param   {String}  itemId    Item ID
 * @param   {String}  filename  Filename
 *
 * @return  {Boolean}           Result
 */
async function getFilePredictions(adapter, itemId, filename) {
    const dbPredictions = await getItemPredictions(adapter, itemId, filename);

    if (Array.isArray(dbPredictions) && !options.force) {
        // logMsg(`Predictions for ${filename} already in DB`, itemId, adapter);
        return false;
    }

    // Wait for 10 sec every 60 sec, for memory clear
    if (counter >= 120) {
        counter = 0;
        await sleep(10 * 1000);
    }

    const filepath = path.resolve(
        options.directory,
        "download",
        adapter,
        itemId,
        filename
    );

    if (!fs.existsSync(filepath)) {
        // logMsg(`File ${filename} not found`, itemId, adapter);
        return false;
    }

    logMsg(`Process file ${filename}`, itemId, adapter);

    let image = await readImage(filepath);

    const predictions = await detectImage(image);

    if (!predictions) {
        await addPrediction(adapter, itemId, filename, []);
        logMsg(`No predictions found for ${filename}`, itemId, adapter);
        return false;
    }

    image = null;

    const predictionsLog =
        predictions && Array.isArray(predictions) && predictions.length
            ? predictions
                  .map((item) => item.class)
                  .filter(
                      (element, index, array) =>
                          array.indexOf(element) === index
                  )
                  .join(", ")
            : "none";

    logMsg(
        `Predictions results for ${filename}: ${predictionsLog}`,
        itemId,
        adapter
    );

    await addPrediction(adapter, itemId, filename, predictions);

    return true;
}

/**
 * Process item with files
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  itemId   Item ID
 *
 * @return  {Boolean}          Result
 */
async function processItem(adapter, itemId) {
    let filenames = await getFiles(adapter, itemId);

    filenames = Array.isArray(filenames)
        ? filenames.filter((filename) => path.parse(filename).ext != ".mp4")
        : [];

    if (!filenames?.length) {
        // logMsg("No files found for item", itemId, adapter);
        return false;
    }

    const filteredFilenames = [];

    for (const filename of filenames) {
        const dbPredictions = await getItemPredictions(
            adapter,
            itemId,
            filename
        );

        if (Array.isArray(dbPredictions) && !options.force) {
            // logMsg(
            //     `Predictions for ${filename} already in DB`,
            //     itemId,
            //     adapter
            // );
            continue;
        }

        filteredFilenames.push(filename);
    }

    // Save results
    filenames = [...filteredFilenames];

    logMsg(`Process ${filenames.length} files`, itemId, adapter);

    for (const filename of filenames) {
        await getFilePredictions(adapter, itemId, filename);

        // queue.add(() => getFilePredictions(adapter, itemId, filename), {
        //     priority: priorities.download,
        // });
    }

    return true;
}

/**
 * Process adapter
 *
 * @param   {String}  adapter  Adapter
 *
 * @return  {Boolean}          Result
 */
async function processAdapter(adapter) {
    const items = await getItems(adapter, true);

    if (!items?.length) {
        logMsg("Items not found in adapter", false, adapter);
        return false;
    }

    logMsg(`Start process ${items.length} items`, false, adapter);

    for (const itemId of items) {
        await processItem(adapter, itemId);
    }

    return true;
}

(async () => {
    await loadModel();

    for (const adapter of adapters) {
        processAdapter(adapter);
    }

    while (queue.size || queue.pending) {
        await sleep(1000);
        logQueue(queue);

        // counter++;
    }

    return true;
})();
