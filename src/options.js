import path from "node:path";
import { fileURLToPath } from "node:url";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export const options = yargs(hideBin(process.argv))
    .option("directory", {
        describe: "Base dir",
        default: path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../"
        ),
        type: "string",
    })
    .option("query", {
        describe: "Query to search",
        type: "string",
        default: false,
    })
    .option("proxy", {
        describe: "Proxy use flag",
        default: true,
        type: "boolean",
    })
    .option("download", {
        describe: "Download reviews flag",
        default: true,
        type: "boolean",
    })
    .option("thumbnail", {
        describe: "Thumbnail generate flag",
        default: true,
        type: "boolean",
    })
    .option("update", {
        describe: "Update items flag",
        default: false,
        type: "boolean",
    })
    .option("reviews", {
        describe: "Update reviews flag",
        default: false,
        type: "boolean",
    })
    .option("throat", {
        describe: "Throat number",
        default: 1,
        type: "number",
    })
    .option("pages", {
        describe: "Max pages number",
        default: 100500,
        type: "number",
    })
    .option("start", {
        describe: "Start page",
        default: 1,
        type: "number",
    })
    .option("timeout", {
        describe: "XHR timeout",
        default: 30000,
        type: "number",
    })
    .option("force", {
        describe: "Force update flag",
        default: false,
        type: "boolean",
    })
    .option("headless", {
        describe: "Headless browser startup flag",
        default: true,
        type: "boolean",
    })
    .option("time", {
        describe: "Time to update",
        default: 4,
        type: "number",
    })
    .option("logs", {
        describe: "Logs flag",
        default: true,
        type: "boolean",
    })
    .option("id", {
        describe: "ID to get",
        default: false,
        type: "number",
    })
    .option("time", {
        describe: "Time to update in hours",
        default: 12,
        type: "number",
    })
    .option("include", {
        type: "array",
        describe: "Include adapters array",
        default: [],
    })
    .option("exclude", {
        type: "array",
        describe: "Exclude adapters array",
        default: [],
    })
    .option("pageSize", {
        type: "number",
        describe: "Scrape item page size",
        default: 100,
    }).argv;

console.log("Options:");
console.log(options);

export default options;
