import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import which from "which";

import axios from "axios";
import prettyBytes from "pretty-bytes";

import { updateFiles } from "./db.js";
import commandCall from "./command-call.js";
import generateThumbail from "./generate-thumbnail.js";
import getHeaders from "./get-headers.js";
import logMsg from "./log-msg.js";
import priorities from "./priorities.js";
import queueCall from "./queue-call.js";
import sleep from "./sleep.js";

import options from "../options.js";

const isWin = process.platform === "win32";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const tempDirPath = path.resolve(options.directory, "temp");

const downloadCache = {};

/**
 * Delete file by filepath helper
 *
 * @param   {String}  filepath  File filepath
 * @param   {String}  itemId    Item ID
 * @param   {String}  prefix    Prefix
 *
 * @return  {Boolean}           Result
 */
function deleteHelper(filepath, itemId, prefix) {
    if (!fs.existsSync(filepath)) {
        // logMsg(`${filepath} not exists`, id, prefix);
        return false;
    }

    try {
        fs.unlinkSync(filepath);
        logMsg(`Deleted ${filepath}`, itemId, prefix);
        return true;
    } catch (error) {
        logMsg(`Delete error ${filepath}: ${error.message}`, itemId, prefix);
        return false;
    }
}

/**
 * Delete file by filepath helper
 *
 * @param   {String}  videoFilePath  Video file filepath
 * @param   {Number}  fps            FPS to extract
 * @param   {Number}  r              Rate frames per second
 * @param   {String}  id             ID
 * @param   {String}  prefix         Prefix
 *
 * @return  {Array}                  Frame array
 */
export async function extractVideoFrames(
    videoFilePath,
    fps = 5,
    r = 1,
    id,
    prefix,
) {
    if (!which("ffmpeg", { nothrow: true })) {
        logMsg("ffmpeg binary not found!", id, prefix);
        return false;
    }

    const parsedPath = path.parse(videoFilePath);

    let videoFrames = fs
        .readdirSync(tempDirPath)
        .filter((filename) => filename.includes(`${parsedPath.name}-frame`))
        .map((filename) => path.resolve(tempDirPath, filename));

    if (videoFrames.length) {
        return videoFrames;
    }

    logMsg(`Get video frames from ${parsedPath.base}`, id, prefix);

    const command = `ffmpeg -i "${videoFilePath}" ${
        fps ? `-vf fps=${fps}` : ""
    } ${r ? `-r ${r}` : ""} "${tempDirPath}/${parsedPath.name}-frame%04d.jpg"`;

    try {
        const { result, error } = await commandCall(command);

        if (result) {
            videoFrames = fs
                .readdirSync(tempDirPath)
                .filter((filename) =>
                    filename.includes(`${parsedPath.name}-frame`),
                )
                .map((filename) => path.resolve(tempDirPath, filename));

            logMsg(
                `Get ${videoFrames.length} video frames for ${parsedPath.base}`,
                id,
                prefix,
            );
        } else {
            logMsg(
                `Get video frames for ${parsedPath.base} error: ${error}`,
                id,
                prefix,
            );
        }

        return videoFrames;
    } catch (error) {
        logMsg(
            `Get frames error for ${parsedPath.base}: ${error.message}`,
            id,
            prefix,
        );
        return [];
    }
}

/**
 * Convert video file with ffmpeg
 *
 * @param   {String}  filepath  Filepath
 * @param   {String}  itemId    Item ID
 * @param   {String}  prefix    Prefix
 *
 * @return  {Boolean}           Result
 */
export async function convertVideoItem(filepath, itemId, prefix) {
    if (!filepath.includes(".mp4")) {
        logMsg(`Input filepath ${filepath} is not a video file!`);
        return false;
    }

    if (!which("ffmpeg", { nothrow: true })) {
        logMsg("ffmpeg binary not found!", itemId, prefix);
        return false;
    }

    const exportFilePath = path.resolve(
        options.directory,
        "temp",
        path.parse(filepath).base,
    );

    if (fs.existsSync(exportFilePath)) {
        fs.unlinkSync(exportFilePath);
    }

    const command = `ffmpeg -i ${filepath} -map_metadata -1 -c:v copy -c:a copy -movflags +faststart ${exportFilePath}`;

    let result = false;

    try {
        result = await commandCall(command);
    } catch (error) {
        logMsg(error.message);
    }

    if (result) {
        const sizeBefore = fs.statSync(filepath);
        const sizeAfter = fs.statSync(exportFilePath);

        logMsg(
            `Before ${prettyBytes(sizeBefore.size)} - After ${prettyBytes(
                sizeAfter.size,
            )}`,
            itemId,
            prefix,
        );

        if (sizeAfter.size < sizeBefore.size) {
            fs.renameSync(exportFilePath, filepath);

            logMsg("Update video file", itemId, prefix);
        }
    }

    // Delete file if its larger
    if (fs.existsSync(exportFilePath)) {
        fs.unlinkSync(exportFilePath);
    }

    return true;
}

/**
 * Convert image to webp
 *
 * @param   {String}  filepath  Input filepath
 * @param   {Object}  queue     Queue instance`
 * @param   {String}  itemId    Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function processFile(filepath, queue, itemId, prefix) {
    if (!which("cwebp", { nothrow: true })) {
        logMsg("cwebp binary not found!", itemId, prefix);
        return false;
    }

    if (!fs.existsSync(filepath)) {
        logMsg(`File ${filepath} not found to convert`, itemId, prefix);
        return false;
    }

    const parsed = path.parse(filepath);

    if (!fs.existsSync(tempDirPath)) {
        fs.mkdirSync(tempDirPath);
    }

    const tempWebpFilepath = path.resolve(tempDirPath, `${parsed.name}.webp`);
    const outputFilename = path.resolve(
        path.dirname(filepath),
        `${parsed.name}.webp`,
    );

    const command = `cwebp${
        isWin ? ".exe" : ""
    } -quiet -preset photo -q 80 -mt -m 6 -preset photo ${filepath} -o ${tempWebpFilepath}`;

    logMsg(`Convert to webp ${path.basename(filepath)}`, itemId, prefix);

    try {
        await queue.add(
            async () => {
                return await commandCall(command);
            },
            { priority: priorities.download },
        );

        const tempSize = fs.statSync(tempWebpFilepath).size;
        const originalSize = fs.statSync(filepath).size;

        if (tempSize < originalSize) {
            logMsg(
                `${filepath}: ${prettyBytes(tempSize)} < ${prettyBytes(
                    originalSize,
                )}`,
                itemId,
                prefix,
            );

            deleteHelper(filepath, itemId, prefix);

            fs.renameSync(tempWebpFilepath, outputFilename);
        } else {
            logMsg(
                `${filepath}: ${prettyBytes(tempSize)} > ${prettyBytes(
                    originalSize,
                )}`,
                itemId,
                prefix,
            );

            deleteHelper(tempWebpFilepath, itemId, prefix);
        }

        return true;
    } catch (error) {
        logMsg(`Convert error ${filepath}: ${error.message}`, itemId, prefix);
        return false;
    }
}

/**
 * Download file
 *
 * @param   {String}  url       File url
 * @param   {String}  filepath  Download filepath
 * @param   {Object}  queue     Queue instance
 * @param   {String}  itemId    Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function downloadFile(url, filepath, queue, itemId, prefix) {
    if (!options.image) {
        return true;
    }

    const filename = path.basename(filepath);

    let result = true;

    await queue.add(
        async () => {
            logMsg(
                `Try to download ${filename} to ${path.dirname(filepath)}`,
                itemId,
                prefix,
            );

            try {
                const fileRequest = await axios(url, {
                    responseType: "arraybuffer",
                    // timeout: options.timeout * 2,
                    headers: getHeaders(),
                });

                fs.writeFileSync(filepath, fileRequest.data);

                // res.data.pipe(fs.createWriteStream(filepath));

                logMsg(
                    `Downloaded ${filename} to ${path.dirname(
                        filepath,
                    )}(size ${prettyBytes(fs.statSync(filepath).size)})`,
                    itemId,
                    prefix,
                );

                return true;
            } catch (error) {
                logMsg(
                    `Download error ${filename} to ${path.dirname(filepath)}: ${
                        error.message
                    }`,
                    itemId,
                    prefix,
                );

                result = false;

                return false;
            }
        },
        { priority: priorities.download },
    );

    // wait for file
    if (result && !fs.existsSync(filepath)) {
        let counter = 0;

        while (result && !fs.existsSync(filepath) && counter <= 10) {
            logMsg(`Wait for file ${filename}`, itemId, prefix);
            await sleep(1000);
            counter++;
        }
    }

    return result;
}

/**
 * Download video
 *
 * @param   {String}  url       File url
 * @param   {String}  filepath  Download filepath
 * @param   {Object}  queue     Queue instance
 * @param   {String}  itemId    Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function downloadVideo(url, filepath, queue, itemId, prefix) {
    if (!options.video) {
        return true;
    }

    if (!which("yt-dlp", { nothrow: true })) {
        logMsg("yt-dlp binary not found!", itemId, prefix);
        return false;
    }

    const filename = path.basename(filepath);

    const ytDlpCommand = `yt-dlp${
        isWin ? ".exe" : ""
    } --quiet --downloader ffmpeg --hls-use-mpegts -o "${filepath.toString()}" "${url}"`;

    // const ffmpegCommand = `ffmpeg${
    //     isWin ? ".exe" : ""
    // } -i "${url}" "${filepath.toString()}"`;

    let commandResult;

    await queue.add(
        async () => {
            logMsg(`Start video download ${filename}`, itemId, prefix);

            commandResult = await commandCall(ytDlpCommand);

            return commandResult;
        },
        {
            priority: priorities.download,
        },
    );

    while (!commandResult) {
        await sleep(500);
    }

    if (commandResult.result && fs.existsSync(filepath)) {
        logMsg(
            `Downloaded video ${filename}: ${commandResult.result}`,
            itemId,
            prefix,
        );
    } else {
        logMsg(
            `Download error video ${filename}: ${commandResult.stderr}`,
            itemId,
            prefix,
        );
    }

    return commandResult.result;
}

/**
 * Check if file exists on remote server and return size
 *
 * @param   {String}  url    URL
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Object}         Result object
 */
export async function isExist(url, queue) {
    return await queueCall(
        async () => {
            try {
                if (url.includes("undefined")) {
                    debugger;
                }

                const headRequest = await axios(url, {
                    method: "head",
                    timeout: 3000,
                    headers: getHeaders(),
                });

                const { headers } = headRequest;

                const contentLength = parseInt(headers["content-length"]);

                return {
                    size: contentLength,
                    exists: true,
                    error: false,
                };
            } catch (error) {
                return {
                    size: false,
                    exists: false,
                    error,
                };
            }
        },
        queue,
        priorities.checkSize,
    );
}

/**
 * Check file size
 *
 * @param   {String}   url       File url
 * @param   {String}   filepath  Download filepath
 * @param   {Object}   queue     Queue instance
 * @param   {String}   itemId    Item ID
 * @param   {String}   prefix    Prefix for logs
 * @param   {Boolean}  isVideo   Is video flag
 *
 * @return  {Boolean}            Result
 */
export async function checkSize(
    url,
    filepath,
    queue,
    itemId,
    prefix,
    isVideo = false,
) {
    const filename = path.basename(filepath);

    if (!fs.existsSync(filepath)) {
        logMsg(`File ${filepath} not found for check size`, itemId, prefix);
        return false;
    }

    if (!fs.statSync(filepath).size) {
        logMsg(`File ${filename} is empty`, itemId, prefix);
        return false;
    }

    if (isVideo) {
        logMsg(
            `File ${filename} is video with size ${prettyBytes(
                fs.statSync(filepath).size,
            )}`,
            itemId,
            prefix,
        );

        return true;
    }

    logMsg(`Try to check size ${filename}`, itemId, prefix);

    const result = await queue.add(
        async () => {
            let isSizeEqual = false;

            try {
                const headRequest = await axios(url, {
                    method: "head",
                    timeout: options.timeout,
                    headers: getHeaders(),
                });
                const { headers } = headRequest;

                const contentLength = parseInt(headers["content-length"]);
                const size = fs.statSync(filepath).size;

                isSizeEqual = contentLength === size;

                logMsg(
                    `Filesize for ${filename} equal is ${isSizeEqual}(r ${prettyBytes(
                        contentLength,
                    )} f ${prettyBytes(size)})`,
                    itemId,
                    prefix,
                );
            } catch (error) {
                logMsg(
                    `Filesize ${filename} check error: ${error.message}`,
                    itemId,
                    prefix,
                );
            }

            return isSizeEqual;
        },
        { priority: priorities.checkSize },
    );

    logMsg(`Check size ${filename} result ${result}`, itemId, prefix);

    return result;
}

/**
 * Download by URL
 *
 * @param   {String}   url       Input url
 * @param   {String}   filepath  Filepath
 * @param   {Object}   queue     Queue
 * @param   {Boolean}  isVideo   Is video flag
 *
 * @return  {Boolean}            Result
 */
export async function downloadItem(url, filepath, queue, isVideo = false) {
    if (!options.download) {
        return true;
    }

    if (!url) {
        logMsg("Url not defined!");
        return false;
    }

    if (!filepath) {
        logMsg("Filepath not defined!");
        return false;
    }

    if (!queue) {
        logMsg("Queue not defined!");
        return false;
    }

    const parsedPath = path.parse(filepath);

    const id = path.basename(path.dirname(filepath));

    // create item directory if not exist
    if (!fs.existsSync(path.dirname(filepath))) {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }

    const prefix = path.basename(path.dirname(path.resolve(filepath, "../")));

    const webpFilepath = path.resolve(
        path.dirname(filepath),
        `${parsedPath.name}.webp`,
    );

    if (url in downloadCache) {
        logMsg(
            `File ${parsedPath.name} already in download process`,
            id,
            prefix,
        );
        return false;
    }

    if (fs.existsSync(webpFilepath) && webpFilepath != filepath && !isVideo) {
        deleteHelper(filepath, id, prefix);

        // logMsg("Webp file exists", id, prefix);
        return true;
    }

    if (fs.existsSync(webpFilepath) && webpFilepath == filepath && !isVideo) {
        // logMsg("Webp file exists", id, prefix);
        return true;
    }

    let exists = false;
    let size = false;
    let isSizeEqual = false;

    const isFileExists = fs.existsSync(filepath);

    if (isFileExists) {
        exists = true;
        isSizeEqual = true;
        size = fs.statSync(filepath).size;
    } else if (!isVideo) {
        const result = await isExist(url, queue);

        exists = result.exists;
        size = result.size;

        isSizeEqual =
            isFileExists && size && size == fs.statSync(filepath).size
                ? true
                : false;
    }

    if (!fs.existsSync(tempDirPath)) {
        fs.mkdirSync(tempDirPath);
    }

    const tempFilepath = path.resolve(tempDirPath, path.basename(filepath));
    let isDownloaded = false;

    let isDownload = false;

    if (isVideo) {
        exists = true;
    }

    if (isSizeEqual || !exists) {
        isDownloaded = true;
    } else {
        downloadCache[url] = true;

        isDownloaded = isVideo
            ? await downloadVideo(url, tempFilepath, queue, id, prefix)
            : await downloadFile(url, tempFilepath, queue, id, prefix);

        const isTempExist = fs.existsSync(tempFilepath);

        logMsg(
            `Downloaded ${parsedPath.base} is ${isDownloaded}, exist ${isTempExist}`,
            id,
            prefix,
        );

        if (isDownloaded && isTempExist) {
            logMsg(
                `Moved ${parsedPath.base} from temp to ${parsedPath.dir}`,
                id,
                prefix,
            );

            try {
                fs.renameSync(tempFilepath, filepath);
            } catch (error) {
                logMsg(`Error rename: ${error.message}`, id, prefix);

                try {
                    fs.copyFileSync(tempFilepath, filepath);
                } catch (error) {
                    logMsg(`Error copy: ${error.message}`, id, prefix);
                }
            }

            isDownload = true;
        } else if (isTempExist) {
            deleteHelper(tempFilepath, id, prefix);
        }
    }

    if (isDownloaded && !isVideo && fs.existsSync(filepath)) {
        await processFile(filepath, queue, id, prefix);
    }

    await generateThumbail(path.dirname(filepath), prefix, queue, true);

    if (url in downloadCache) {
        delete downloadCache[url];
    }

    if (isDownload) {
        await updateFiles(prefix, id);
    }

    return true;
}

export default downloadItem;
