import fs from "node:fs";
import path from "node:path";

/**
 * Check path is directory
 *
 * @param   {String}  inputPath   Input path
 *
 * @return  {Boolean}             Result
 */
export function isDirectory(inputPath) {
    return fs.statSync(inputPath).isDirectory();
}

/**
 * Check path is file
 *
 * @param   {String}  inputPath   Input path
 *
 * @return  {Boolean}             Result
 */
export function isFile(inputPath) {
    return fs.statSync(inputPath).isFile();
}

/**
 * Get path directories
 *
 * @param   {String}  inputPath  Input path
 *
 * @return  {Array}              Directories
 */
export function getDirectories(inputPath) {
    return fs
        .readdirSync(inputPath)
        .map((name) => path.join(inputPath, name))
        .filter(isDirectory);
}

/**
 * Get files from path
 *
 * @param   {String}  inputPath  Input path
 *
 * @return  {Array}              Files
 */
export function getFiles(inputPath) {
    return fs
        .readdirSync(inputPath)
        .map((name) => path.join(inputPath, name))
        .filter(isFile);
}

/**
 * Get files recursively from path
 *
 * @param   {String}  inputPath  Input path
 *
 * @return  {Array}              Files
 */
export function getFilesRecursively(inputPath) {
    const dirs = getDirectories(inputPath);

    const files = dirs
        .map((dir) => getFilesRecursively(dir))
        .reduce((a, b) => a.concat(b), []);

    return files.concat(getFiles(inputPath));
}

export default getFilesRecursively;
