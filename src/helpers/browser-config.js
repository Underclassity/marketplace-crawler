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
};

export default browserConfig;
