import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import tf from "@tensorflow/tfjs-node";

// import mobilenet from '@tensorflow-models/mobilenet';
import cocoSsd from "@tensorflow-models/coco-ssd";

import commandCall from "./command-call.js";
import logMsg from "./log-msg.js";
import sleep from "./sleep.js";

import options from "../options.js";

const isWin = process.platform === "win32";
const extensions = [".bmp", ".jpeg", ".jpg", ".png", ".gif"];

// Model cache
let model;
// let mobilenetModel;

let isModelLoading = false;

/**
 * Load model
 *
 * @return  {Object}  Tensorflow model
 */
export async function loadModel() {
    while (isModelLoading) {
        await sleep(5000);
    }

    if (!model) {
        isModelLoading = true;
        const startTime = Date.now();

        logMsg("Start model load");

        // Load the model.
        // mobilenetModel = await mobilenet.load();
        model = await cocoSsd.load({
            base: "mobilenet_v2",
        });

        const endTime = Date.now();
        isModelLoading = false;

        logMsg(`Model loaded: ${Math.round((endTime - startTime) / 1000)} sec`);
    }

    return model;
}

/**
 * Funny get model helper
 *
 * @return  {Object}  Return model link
 */
export async function getModel() {
    return model;
}

/**
 * Read image for Tensorflow by given filepath
 *
 * @param   {String}  filepath  Filepath
 *
 * @return  {Object}            Tensorflow image object
 */
export async function readImage(filepath) {
    if (!fs.existsSync(filepath)) {
        return false;
    }

    let readFilepath = filepath;

    const parsedPath = path.parse(filepath);

    const tempJpegFilepath = path.join(
        options.directory,
        "temp",
        `${path.basename(filepath, path.extname(filepath))}-temp.jpeg`
    );

    if (!extensions.includes(parsedPath.ext)) {
        const command = `${
            isWin ? "magick.exe" : ""
        } convert -format jpeg ${filepath} ${tempJpegFilepath}`;

        await commandCall(command);

        readFilepath = tempJpegFilepath;
    }

    //reads the entire contents of a file.
    //readFileSync() is synchronous and blocks execution until finished.
    let imageBuffer = fs.readFileSync(readFilepath);
    //Given the encoded bytes of an image,
    //it returns a 3D or 4D tensor of the decoded image. Supports BMP, GIF, JPEG and PNG formats.
    const tfimage = tf.node.decodeImage(imageBuffer);

    imageBuffer = null;

    if (fs.existsSync(tempJpegFilepath)) {
        fs.unlinkSync(tempJpegFilepath);
    }

    return tfimage;
}

/**
 * Detect image with given model
 *
 * @param   {Object}  image  Tensorflow image object
 * @param   {Object}  model  Tensortflow model object
 *
 * @return  {Array}          Predictions array
 */
export async function detectImage(image, model) {
    if (!image) {
        logMsg("Input image not defined!");
        return false;
    }

    if (!model) {
        model = await loadModel();
    }

    try {
        // tf.engine().startScope();

        // Classify the image.
        // const predictions = await mobilenetModel.classify(image);
        const predictions = await model.detect(image);

        image = null;

        // tf.engine().endScope();

        return predictions;
    } catch (err) {
        logMsg(`Error process image: ${err}`);
        return false;
    }
}
