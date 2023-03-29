import options from "../options.js";

export const browserConfig = {
    headless: options.headless,
    devtools: options.headless ? false : true,
    args: ["--disable-notifications"],
};

export default browserConfig;
