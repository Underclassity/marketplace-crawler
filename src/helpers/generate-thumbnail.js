import path from "node:path";
import fs from "node:fs";

import sizeOf from "image-size";
import commandCall from "./command-call.js";
import { processFile } from "./download.js";

import options from "../options.js";

const tempFolder = path.resolve(options.directory, "temp");
const isWin = process.platform === "win32";
const resultsFolderPath = path.resolve(options.directory, "thumbnails");

/**
 * Generate thumbnail for directory
 *
 * @param   {String}   dir     Directory path
 * @param   {String}   prefix  Prefix
 * @param   {Boolean}  force   Force update flag
 * @param   {Object}   queue   Queue instance
 *
 * @return  {Boolean}          Result
 */
export async function generateThumbail(dir, prefix, queue, force = false) {
    console.log(dir);

    if (!dir || !fs.existsSync(dir)) {
        console.log("Directory not defined!");
        return false;
    }

    if (!prefix) {
        console.log("Prefix not defined!");
        return false;
    }

    const id = path.basename(dir);

    const prefixResultsFolderPath = path.resolve(resultsFolderPath, prefix);

    const itemThumbnailPath = path.resolve(
        prefixResultsFolderPath,
        `${id}.jpg`
    );
    const itemThumbnailPathWebp = path.resolve(
        prefixResultsFolderPath,
        `${id}.webp`
    );

    if (!fs.existsSync(prefixResultsFolderPath)) {
        fs.mkdirSync(prefixResultsFolderPath, { recursive: true });
    }

    let itemImages = fs
        .readdirSync(dir)
        .filter((filepath) => fs.statSync(path.resolve(dir, filepath)).isFile())
        .filter((filepath) => !filepath.includes(".json"));

    const isExist = fs.existsSync(itemThumbnailPath);
    const isExistWebp = fs.existsSync(itemThumbnailPathWebp);
    const isForce = options.force || force;

    if (!isForce && isExistWebp) {
        console.log(`${dir}: Webp thumbnail found`);
        return true;
    }

    if (isExist && !isExistWebp && !isForce) {
        console.log(`${dir}: Thumbnail found, convert to webp`);
        processFile(itemThumbnailPath, queue, path.basename(dir), id);
        return true;
    }

    if (
        (isExist || isExistWebp) &&
        !isForce &&
        fs.statSync(itemThumbnailPath).size
    ) {
        console.log(`${dir}: Thumbnail found`);
        return false;
    }

    if (isExist && (options.force || force)) {
        fs.unlinkSync(itemThumbnailPath);
    }

    console.log(`${dir}: Process (${options.force}, ${force})`);

    // take random elements
    itemImages = itemImages.sort(() => Math.random() - Math.random());

    // itemImages = itemImages.sort(function (a, b) {
    //   const aBirthtime = fs.statSync(path.resolve(dir, a)).birthtimeMs
    //   const bBirthtime = fs.statSync(path.resolve(dir, b)).birthtimeMs

    //   return bBirthtime - aBirthtime
    // })

    let images = itemImages
        .slice(0, 16)
        .map((filename) => path.resolve(dir, filename));

    const length = images.length;

    if (length == 0) {
        console.log(`${dir}: Images not found (${options.force}, ${force})`);
        return false;
    }

    let grid = "4x4";
    let size = 300;

    if (length < 16 && length >= 9) {
        grid = "3x3";
        size = 400;
        images = images.slice(0, 9);
    }

    if (length < 9) {
        grid = "2x2";
        size = 600;
        images = images.slice(0, 4);
    }

    if (!fs.existsSync(tempFolder)) {
        fs.mkdirSync(tempFolder);
    }

    const cropedImages = [];
    let counter = 0;

    for (const image of images) {
        const imageCropedPath = path.resolve(
            tempFolder,
            `${id}-${counter}.jpg`
        );

        if (fs.existsSync(imageCropedPath)) {
            counter++;
            cropedImages.push(imageCropedPath);
            continue;
        }

        await queue.add(
            async () => {
                console.log(`${dir}: Cut ${path.basename(image)}`);

                try {
                    const size = await sizeOf(image);

                    const cropFactor = Math.min(size.width, size.height);

                    const command = `${
                        isWin ? "magick.exe" : ""
                    } convert ${image} -gravity Center -crop ${cropFactor}x${cropFactor}+0+0 ${imageCropedPath}`;

                    await commandCall(command);
                    counter++;

                    cropedImages.push(imageCropedPath);
                } catch (error) {
                    console.log(error.message);
                }
            },
            { priority: 5 }
        );
    }

    await queue.add(
        async () => {
            try {
                const command = `${
                    isWin ? "magick.exe" : ""
                } montage -monitor -geometry ${size}x -tile ${grid} -quality 80 ${cropedImages.join(
                    " "
                )} ${itemThumbnailPath}`;

                await commandCall(command);
            } catch (error) {
                console.log(error.message);
            }
        },
        { priority: 10 }
    );

    for (const image of cropedImages) {
        fs.unlinkSync(image);
    }

    if (fs.existsSync(itemThumbnailPath)) {
        processFile(itemThumbnailPath, queue, path.basename(dir), id);
    }

    console.log(`${dir}: End process`);

    return true;
}

export default generateThumbail;
