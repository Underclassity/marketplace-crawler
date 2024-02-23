import path from "node:path";
import process from "node:process";
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
    .option("brand", {
        describe: "Brand ID",
        type: "string",
        default: false,
    })
    .option("brands", {
        describe: "Update items by brands",
        type: "boolean",
        default: false,
    })
    .option("tags", {
        describe: "Update items by tags",
        type: "boolean",
        default: false,
    })
    .option("category", {
        describe: "Category ID",
        type: "string",
        default: false,
    })
    .option("subject", {
        describe: "Category subject",
        type: "string",
        default: false,
    })
    .option("xsubject", {
        describe: "Category x subject",
        type: "string",
        default: false,
    })
    .option("favorite", {
        describe: "Update only favorite items",
        type: "boolean",
        default: false,
    })
    .option("proxy", {
        describe: "Proxy use flag",
        default: false,
        type: "boolean",
    })
    .option("download", {
        describe: "Download reviews flag",
        default: true,
        type: "boolean",
    })
    .option("thumbnail", {
        describe: "Thumbnail generate flag",
        default: false,
        type: "boolean",
    })
    .option("image", {
        describe: "Download image flag",
        default: true,
        type: "boolean",
    })
    .option("video", {
        describe: "Download video flag",
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
        default: 3,
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
        default: 10000,
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
    .option("cookies", {
        describe: "Run browser for update cookies and session",
        default: false,
        type: "boolean",
    })
    .option("logs", {
        describe: "Logs flag",
        default: true,
        type: "boolean",
    })
    .option("id", {
        describe: "ID to get",
        default: false,
        type: "string",
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
    })
    .option("stats", {
        describe: "Show products stats",
        default: false,
        type: "boolean",
    })
    .option("info", {
        describe: "Update products info",
        default: false,
        type: "boolean",
    })
    .option("reverse", {
        describe: "Reverse priority queue flag",
        default: false,
        type: "boolean",
    }).argv;

console.log("Options:");
console.log(options);

export default options;
