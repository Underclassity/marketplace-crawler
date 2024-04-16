import fs from "node:fs";
import path from "node:path";

/**
 * Get directory stats(files,size)
 *
 * @param   {String}  dir  Directory filepath
 *
 * @return  {Object}       Results
 */
export function readDirStats(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return {
            files: 0,
            size: 0,
            dir: false,
        };
    }

    const files = fs.readdirSync(dir);

    const size = files.reduce((current, file) => {
        const stats = fs.statSync(path.join(dir, file));

        current += stats.size;

        return current;
    }, 0);

    return { files: files.length, size, dir: true };
}

export default readDirStats;
