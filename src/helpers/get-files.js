import fs from "fs";
import path from "node:path";

export function isDirectory(inputPath) {
    return fs.statSync(inputPath).isDirectory();
}

export function getDirectories(inputPath) {
    return fs
        .readdirSync(inputPath)
        .map(function (name) {
            return path.join(inputPath, name);
        })
        .filter(isDirectory);
}

export function isFile(inputPath) {
    return fs.statSync(inputPath).isFile();
}

export function getFiles(inputPath) {
    return fs
        .readdirSync(inputPath)
        .map(function (name) {
            return path.join(inputPath, name);
        })
        .filter(isFile);
}

export function getFilesRecursively(inputPath) {
    let dirs = getDirectories(inputPath);

    let files = dirs
        .map(function (dir) {
            return getFilesRecursively(dir);
        })
        .reduce(function (a, b) {
            return a.concat(b);
        }, []);

    return files.concat(getFiles(inputPath));
}

export default getFilesRecursively;
