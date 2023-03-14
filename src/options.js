import path from "node:path";
import { fileURLToPath } from "node:url";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export const options = yargs(hideBin(process.argv))
  .option("directory", {
    describe: "Base dir",
    default: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../"),
    type: "string",
  })
  .option("query", {
    describe: "Query to search",
    type: "string",
    default: false,
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
  .option("time", {
    describe: "Time to update",
    default: 4,
    type: "number",
  })
  .option("logs", {
    describe: "Logs flag",
    default: false,
    type: "boolean",
  }).argv;

console.log("Options:");
console.log(options);

export default options;
