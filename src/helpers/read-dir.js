import fs from "node:fs";
import path from "node:path";

/**
 * Read dir files
 *
 * @param   {String}  dir  Dir path
 *
 * @return  {Array}        Files array
 */
export function readDir(dir) {
    return fs
        .readdirSync(dir)
        .reduce(
            (files, file) =>
                fs.statSync(path.join(dir, file)).isDirectory()
                    ? files.concat(readDir(path.join(dir, file)))
                    : files.concat(path.join(dir, file)),
            []
        );
}

export default readDir;
