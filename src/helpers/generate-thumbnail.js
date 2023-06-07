import path from "node:path";
import fs from "node:fs";

import sizeOf from "image-size";

import { processFile, extractVideoFrames } from "./download.js";
import commandCall from "./command-call.js";
import priorities from "./priorities.js";
import logMsg from "./log-msg.js";

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
export async function generateThumbail(
    dir,
    prefix = false,
    queue,
    force = false
) {
    if (!options.thumbnail) {
        return false;
    }

    if (!dir || !fs.existsSync(dir)) {
        logMsg("Directory not defined!", false, prefix);
        return false;
    }

    if (!prefix) {
        logMsg("Prefix not defined!", false, prefix);
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
    // .filter((filepath) => !filepath.includes(".mp4"));

    const isExist = fs.existsSync(itemThumbnailPath);
    const isExistWebp = fs.existsSync(itemThumbnailPathWebp);
    const isForce = options.force || force;

    if (!isForce && isExistWebp) {
        logMsg(`Webp thumbnail found`, id, prefix);
        return true;
    }

    if (isExist && !isExistWebp && !isForce) {
        logMsg(`Thumbnail found, convert to webp`, id, prefix);
        processFile(itemThumbnailPath, queue, path.basename(dir), id);
        return true;
    }

    if (
        (isExist || isExistWebp) &&
        !isForce &&
        fs.statSync(itemThumbnailPath).size
    ) {
        logMsg(`Thumbnail found`, id, prefix);
        return false;
    }

    if (isExist && (options.force || force)) {
        try {
            fs.unlinkSync(itemThumbnailPath);
        } catch (error) {
            logMsg(`Unlink thumbnail error: ${error.message}`, id, prefix);
        }
    }

    logMsg(`Process (${options.force}, ${force})`, id, prefix);

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

    const videos = images.filter((item) => item.includes(".mp4"));

    if (videos.length) {
        for (const videoFilePath of videos) {
            let videoFrames = await extractVideoFrames(
                videoFilePath,
                false,
                1,
                id,
                prefix
            );

            videoFrames = videoFrames
                .sort((a, b) => {
                    const aSize = fs.statSync(a).size;
                    const bSize = fs.statSync(b).size;

                    return bSize - aSize;
                })
                .forEach((filepath, index) => {
                    if (index <= 1) {
                        images.push(filepath);
                    } else {
                        try {
                            fs.unlinkSync(filepath);
                        } catch (error) {
                            logMsg(
                                `Delete frame for ${filepath} error: ${error.message} (${options.force}, ${force})`,
                                id,
                                prefix
                            );
                        }
                    }
                });
        }

        images = images.sort(() => Math.random() - Math.random()).slice(0, 16);
    }

    const length = images.length;

    if (length == 0) {
        logMsg(`Images not found (${options.force}, ${force})`, id, prefix);
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

        // if (fs.existsSync(imageCropedPath)) {
        //     counter++;
        //     cropedImages.push(imageCropedPath);
        //     continue;
        // }

        await queue.add(
            async () => {
                logMsg(`Cut ${path.basename(image)}`, id, prefix);

                try {
                    const size = await sizeOf(image);

                    const cropFactor = Math.min(size.width, size.height);

                    const command = `${
                        isWin ? "magick.exe" : ""
                    } convert ${image} -gravity Center -crop ${cropFactor}x${cropFactor}+0+0 ${imageCropedPath}`;

                    const { result, error } = await commandCall(command);

                    if (result) {
                        counter++;
                        cropedImages.push(imageCropedPath);

                        logMsg(`Cuted ${path.basename(image)}`, id, prefix);
                    } else {
                        logMsg(
                            `Cut ${path.basename(image)} error: ${
                                error.message
                            }`,
                            id,
                            prefix
                        );
                    }
                } catch (error) {
                    logMsg(
                        `Cut ${path.basename(image)} error: ${error.message}`,
                        id,
                        prefix
                    );
                }
            },
            { priority: priorities.cut }
        );
    }

    await queue.add(
        async () => {
            try {
                logMsg(
                    `Generate thumbnail ${path.basename(itemThumbnailPath)}`,
                    id,
                    prefix
                );

                const command = `${
                    isWin ? "magick.exe" : ""
                } montage -monitor -geometry ${size}x -tile ${grid} -quality 80 ${cropedImages.join(
                    " "
                )} ${itemThumbnailPath}`;

                const { result, error } = await commandCall(command);

                if (result) {
                    logMsg(
                        `Generated thumbnail ${path.basename(
                            itemThumbnailPath
                        )}`,
                        id,
                        prefix
                    );
                } else {
                    logMsg(
                        `Generate thumbnail ${path.basename(
                            itemThumbnailPath
                        )} error: ${error.message}`,
                        id,
                        prefix
                    );
                }
            } catch (error) {
                logMsg(
                    `Generate thumbnail ${path.basename(
                        itemThumbnailPath
                    )} error: ${error.message}`,
                    id,
                    prefix
                );
            }
        },
        { priority: priorities.thumbnail }
    );

    for (const image of cropedImages) {
        try {
            fs.unlinkSync(image);
        } catch (error) {
            logMsg(`Unlink croped image error: ${error.message}`, id, prefix);
        }
    }

    if (fs.existsSync(itemThumbnailPath)) {
        processFile(itemThumbnailPath, queue, path.basename(dir), id);
    }

    logMsg(`End process`, id, prefix);

    return true;
}

export default generateThumbail;
