import path from "node:path";
import fs from "node:fs";

import sizeOf from "image-size";
import commandCall from "./command-call.js";

import options from "../options.js";

const tempFolder = path.resolve(options.directory, "./temp");
const isWin = process.platform === "win32";
const resultsFolderPath = path.resolve(options.directory, "./thumbnails");

/**
 * Generate thumbnail for directory
 *
 * @param   {String}   dir    Directory path
 * @param   {Boolean}  force  Force update flag
 *
 * @return  {Boolean}         Result
 */
export async function generateThumbail(dir, force = false) {
    const itemThumbnailPath = path.resolve(resultsFolderPath, `${dir}.jpg`);
    const itemFolder = path.resolve(options.directory, "./download/", dir);

    let itemImages = fs
        .readdirSync(itemFolder)
        .filter((filepath) =>
            fs.statSync(path.resolve(itemFolder, filepath)).isFile()
        )
        .filter((filepath) => filepath.indexOf(".json") === -1);

    const isExist = fs.existsSync(itemThumbnailPath);

    if (
        isExist &&
        !options.force &&
        !force &&
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
    itemImages = itemImages.sort(function (item) {
        return Math.random() - Math.random();
    });

    // itemImages = itemImages.sort(function (a, b) {
    //   const aBirthtime = fs.statSync(path.resolve(itemFolder, a)).birthtimeMs
    //   const bBirthtime = fs.statSync(path.resolve(itemFolder, b)).birthtimeMs

    //   return bBirthtime - aBirthtime
    // })

    let images = itemImages.slice(0, 16).map(function (filename) {
        return path.resolve(itemFolder, filename);
    });

    const length = images.length;

    if (length == 0) {
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

    if (!fs.existsSync(resultsFolderPath)) {
        fs.mkdirSync(resultsFolderPath);
    }

    const cropedImages = [];
    let counter = 0;

    for (const image of images) {
        const imageCropedPath = path.resolve(
            tempFolder,
            `${dir}-${counter}.jpg`
        );

        if (fs.existsSync(imageCropedPath)) {
            counter += 1;
            cropedImages.push(imageCropedPath);
            continue;
        }

        try {
            const size = await sizeOf(image);

            const cropFactor = Math.min(size.width, size.height);

            const command = `${
                isWin ? "magick.exe" : ""
            } convert ${image} -gravity Center -crop ${cropFactor}x${cropFactor}+0+0 ${imageCropedPath}`;

            await commandCall(command);
            counter += 1;

            cropedImages.push(imageCropedPath);
        } catch (error) {
            console.log(error);
        }
    }

    try {
        const command = `${
            isWin ? "magick.exe" : ""
        } montage -monitor -geometry ${size}x -tile ${grid} -quality 80 ${cropedImages.join(
            " "
        )} ${itemThumbnailPath}`;

        await commandCall(command);
    } catch (error) {
        console.log(error);
    }

    for (const image of cropedImages) {
        fs.unlinkSync(image);
    }

    console.log(`${dir}: End process`);

    return true;
}

export default generateThumbail;
