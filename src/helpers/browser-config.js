import path from "node:path";

import { getProxy } from "./proxy-helpers.js";

import options from "../options.js";

/**
 * Browser config for Puppeteer
 *
 * @var {Object}
 */
export const browserConfig = {
    headless: options.headless,
    devtools: options.headless ? false : true,
    args: ["--disable-notifications"],
    userDataDir: path.resolve(options.directory, "puppeteer"),
};

if (options.proxy) {
    const { url: randomProxy } = getProxy(true);

    console.log(`Use random proxy for browser: ${randomProxy}`);

    browserConfig.args.push(`--proxy-server =${randomProxy}`);
}

export default browserConfig;
