import fs from "node:fs";
import path, { parse } from "node:path";

import axios from "axios";
import prettyBytes from "pretty-bytes";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import commandCall from "./command-call.js";
import log from "./log.js";
import priorities from "./priorities.js";

import options from "../options.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const convertAdapter = new JSONFileSync(path.resolve(dbPath, "convert.json"));
const convertDb = new LowSync(convertAdapter);

convertDb.read();

if (!convertDb.data) {
    convertDb.data = [];
    convertDb.write();
}

const tempDirPath = path.resolve(options.directory, "temp");

if (!fs.existsSync(tempDirPath)) {
    fs.mkdirSync(tempDirPath);
}

/**
 * Log message helper
 *
 * @param   {String}  msg     Message string
 * @param   {String}  id      ID
 * @param   {String}  prefix  Prfix
 *
 * @return  {Boolean}         Log result
 */
function logMsg(msg, id, prefix) {
    if (!msg || !id || !prefix) {
        if (!msg) {
            console.log("Message not defined!");
        }

        if (!id) {
            console.log("ID not defined!");
        }

        if (!prefix) {
            console.log("Prefix not defined!");
        }

        console.trace();
        return false;
    }

    const query = options.query || "";

    if (id) {
        return log(`[${prefix}] ${query}: ${id} - ${msg}`);
    }

    return log(`[${prefix}] ${query}: ${msg}`);
}

/**
 * Convert image to webp
 *
 * @param   {String}  filepath  Input filepath
 * @param   {Object}  queue     Queue instance`
 * @param   {String}  id        Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function processFile(filepath, queue, id, prefix) {
    if (!fs.existsSync(filepath)) {
        logMsg(`File ${filepath} not found to convert`, id, prefix);
        return false;
    }

    if (convertDb.data.includes(filepath)) {
        logMsg(`File ${filepath} found in convert cache`, id, prefix);
        return false;
    }

    const parsed = path.parse(filepath);

    const tempWebpFilepath = path.resolve(tempDirPath, `${parsed.name}.webp`);
    const outputFilename = path.resolve(
        path.dirname(filepath),
        `${parsed.name}.webp`
    );

    const command = `cwebp.exe -quiet -preset photo -q 80 -mt -m 6 -preset photo ${filepath} -o ${tempWebpFilepath}`;

    logMsg(`Convert to webp ${path.basename(filepath)}`, id, prefix);

    try {
        await queue.add(
            async () => {
                return await commandCall(command);
            },
            { priority: priorities.download }
        );

        const tempSize = fs.statSync(tempWebpFilepath).size;
        const originalSize = fs.statSync(filepath).size;

        if (tempSize < originalSize) {
            logMsg(
                `${filepath}: ${prettyBytes(tempSize)} < ${prettyBytes(
                    originalSize
                )}`,
                id,
                prefix
            );

            fs.unlinkSync(filepath);
            fs.renameSync(tempWebpFilepath, outputFilename);
        } else {
            logMsg(
                `${filepath}: ${prettyBytes(tempSize)} > ${prettyBytes(
                    originalSize
                )}`,
                id,
                prefix
            );

            fs.unlinkSync(tempWebpFilepath);

            convertDb.data.push(filepath);
            convertDb.write();
        }

        return true;
    } catch (err) {
        logMsg(`Convert error ${filepath}`, id, prefix);
        console.log(err);
        return false;
    }
}

/**
 * Download file
 *
 * @param   {String}  url       File url
 * @param   {String}  filepath  Download filepath
 * @param   {Object}  queue     Queue instance
 * @param   {String}  id        Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function downloadFile(url, filepath, queue, id, prefix) {
    const filename = path.basename(filepath);

    logMsg(
        `Try to download ${filename} to ${path.dirname(filepath)}`,
        id,
        prefix
    );

    return await queue.add(
        async () => {
            try {
                const res = await axios(url, {
                    responseType: "stream",
                    timeout: options.timeout * 2,
                });

                res.data.pipe(fs.createWriteStream(filepath));

                logMsg(
                    `Downloaded ${filename} to ${path.dirname(filepath)}`,
                    id,
                    prefix
                );
                return true;
            } catch (error) {
                logMsg(
                    `Download error ${filename} to ${path.dirname(filepath)}`,
                    id,
                    prefix
                );
                console.error(error.message);
                return false;
            }
        },
        { priority: priorities.download }
    );
}

/**
 * Download video
 *
 * @param   {String}  url       File url
 * @param   {String}  filepath  Download filepath
 * @param   {Object}  queue     Queue instance
 * @param   {String}  id        Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function downloadVideo(url, filepath, queue, id, prefix) {
    const filename = path.basename(filepath);

    return queue.add(
        async () => {
            try {
                const ffmpegCommand = `ffmpeg${
                    isWin ? ".exe" : ""
                } -i "${url}" "${filepath.toString()}"`;

                await commandCall(ffmpegCommand);

                logMsg(`Downloaded video ${filename}`, id, prefix);

                return true;
            } catch (error) {
                logMsg(`Download error video ${filename}`, id, prefix);
                console.log(error.message);
                return false;
            }
        },
        { priority: priorities.download }
    );
}

/**
 * Check file size
 *
 * @param   {String}  url       File url
 * @param   {String}  filepath  Download filepath
 * @param   {Object}  queue     Queue instance
 * @param   {String}  id        Item ID
 * @param   {String}  prefix    Prefix for logs
 *
 * @return  {Boolean}           Result
 */
export async function checkSize(url, filepath, queue, id, prefix) {
    const filename = path.basename(filepath);

    if (!fs.existsSync(filepath)) {
        logMsg(`File ${filepath} not found for check size`, id, prefix);
        return false;
    }

    if (!fs.statSync(filepath).size) {
        logMsg(`File ${filename} is empty`, id, prefix);
        return false;
    }

    logMsg(`Try to check size ${filename}`, id, prefix);

    const result = await queue.add(
        async () => {
            let isSizeEqual = false;

            try {
                const headRequest = await axios(url, {
                    method: "head",
                    timeout: 5000,
                });
                const { headers } = headRequest;

                const contentLength = parseInt(headers["content-length"]);
                const size = fs.statSync(filepath).size;

                isSizeEqual = contentLength === size;

                logMsg(
                    `Filesize for ${filename} equal is ${isSizeEqual}(r ${prettyBytes(
                        contentLength
                    )} f ${prettyBytes(size)})`,
                    id,
                    prefix
                );
            } catch (error) {
                logMsg(`Filesize ${filename} check error`, id, prefix);
                console.error(error);
            }

            return isSizeEqual;
        },
        { priority: priorities.checkSize }
    );

    logMsg(`Check size ${filename} result ${result}`, id, prefix);

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
    if (!url) {
        console.error("Url not defined!");
        return false;
    }

    if (!filepath) {
        console.log("Filepath not defined!");
        return false;
    }

    if (!queue) {
        console.log("Queue not defined!");
        return false;
    }

    const parsedPath = path.parse(filepath);

    const id = path.basename(path.dirname(filepath));

    // create item directory if not exist
    if (!fs.existsSync(path.dirname(filepath))) {
        fs.mkdirSync(path.dirname(filepath), { recursive: true });
    }

    let prefix = path.basename(path.dirname(path.resolve(filepath, "../")));
    prefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    const webpFilepath = path.resolve(
        path.dirname(filepath),
        `${parsedPath.name}.webp`
    );

    if (fs.existsSync(webpFilepath)) {
        logMsg("Webp file exists", id, prefix);
        return true;
    }

    const isSizeEqual = await checkSize(url, filepath, queue, id, prefix);

    const tempFilepath = path.resolve(tempDirPath, path.basename(filepath));
    let isDownloaded = false;

    if (isSizeEqual) {
        isDownloaded = true;
    } else {
        isDownloaded = isVideo
            ? await downloadVideo(url, tempFilepath, queue, id, prefix)
            : await downloadFile(url, tempFilepath, queue, id, prefix);

        if (isDownloaded && fs.existsSync(tempFilepath)) {
            logMsg(
                `Moved ${parsedPath.name} from temp to ${parsedPath.dir}`,
                id,
                prefix
            );

            fs.renameSync(tempFilepath, filepath);
        } else if (fs.existsSync(tempFilepath)) {
            fs.unlinkSync(tempFilepath);
        }
    }

    if (isDownloaded && !isVideo && fs.existsSync(filepath)) {
        await processFile(filepath, queue, id, prefix);
    }

    return true;
}

export default downloadItem;
