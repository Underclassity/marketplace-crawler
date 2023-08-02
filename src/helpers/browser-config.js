import fs from "node:fs";
import path from "node:path";

import { getProxy } from "./proxy-helpers.js";
import logMsg from "./log-msg.js";

import options from "../options.js";

const puppeteerPath = path.resolve(options.directory, "./puppeteer/");

if (!fs.existsSync(puppeteerPath)) {
    fs.mkdirSync(puppeteerPath);
}

/**
 * Browser config for Puppeteer
 *
 * @var {Object}
 */
export const browserConfig = {
    args: ["--disable-notifications"],
    defaultViewport: { width: 1920, height: 1080 },
    devtools: options.headless ? false : true,
    headless: options.headless,
    userDataDir: path.resolve(options.directory, "puppeteer"),
};

if (options.proxy) {
    const { url: randomProxy } = getProxy(true);

    logMsg(`Use random proxy for browser: ${randomProxy}`);

    browserConfig.args.push(`--proxy-server =${randomProxy}`);
}

export default browserConfig;
