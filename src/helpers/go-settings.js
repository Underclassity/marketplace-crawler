import options from "../options.js";

/**
 * Page goto settings
 *
 * @var {Object}
 */
export const goSettings = {
    waitUntil: "load",
    timeout: options.timeout || 0,
};

export default goSettings;
