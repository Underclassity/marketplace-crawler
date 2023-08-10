import fs from "node:fs";
import path from "node:path";

/**
 * Walk directory helper
 *
 * @param   {String}  dir  Directory path
 *
 * @return  {Array}        Files array
 */
export async function walk(dir) {
    if (!dir || fs.existsSync(dir)) {
        return [];
    }

    let files = fs.readdirSync(dir);

    files = await Promise.all(
        files.map(async (file) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                return walk(filePath);
            } else if (stats.isFile()) {
                return filePath;
            }
        })
    );

    return files.reduce(
        (all, folderContents) => all.concat(folderContents),
        []
    );
}

export default walk;
