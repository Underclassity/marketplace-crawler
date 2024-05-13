import log from "./log.js";

import options from "../options.js";
import priorities from "./priorities.js";

import getAdaptersIds from "./get-adapters-ids.js";

let prefixLength = 0;
let idLength = 0;

const ids = getAdaptersIds();

for (const id of ids) {
    if (id.length >= idLength) {
        idLength = id.length;
    }
}

/**
 * Log message helper
 *
 * @param   {String}  msg                Message string
 * @param   {String}  [id="Common"]      ID
 * @param   {String}  [prefix="Common"]  Prefix
 *
 * @return  {Boolean}                    Log result
 */
export function logMsg(msg, id = "Common", prefix = "Common") {
    if ((!msg || !id || !prefix) && prefix == undefined) {
        log("Prefix not defined!");
        console.trace();
    }

    if (!id) {
        id = "Common";
    }

    if (!prefix) {
        prefix = "Common";
    }

    const query = options.query || options.brand || "";

    if (prefix && (!prefixLength || prefixLength < prefix.length)) {
        prefixLength = prefix.length;
    }

    if (id && (!idLength || idLength < id.length)) {
        idLength = id.length;
    }

    if (prefix && prefixLength) {
        prefix = prefix.toString().padEnd(prefixLength, " ");
    }

    if (id && idLength) {
        id = id.toString().padEnd(idLength, " ");
    }

    const date = new Date();

    return log(
        `${
            prefix
                ? `${date.toLocaleTimeString()} [${prefix}] `
                : "${date.toLocaleTimeString()} "
        }${query ? `${query}: ` : ""}${id ? `${id} - ` : ""}${msg}`
    );
}

/**
 * Log queue state
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export function logQueue(queue) {
    if (!queue) {
        return false;
    }

    const { size } = queue;

    const estimate = queue?.eta?.estimate() || 0;

    const queueLogString = `Queue-${options.throat} size ${size} ${
        `${estimate.toFixed(2)}s` || ""
    }: ${Object.keys(priorities)
        .map(
            (priority) =>
                `${priorities[priority]}-${priority}-${queue.sizeBy({
                    priority: priorities[priority],
                })}`
        )
        .join(", ")}`;

    console.log(queueLogString);

    return true;
}

export default logMsg;
