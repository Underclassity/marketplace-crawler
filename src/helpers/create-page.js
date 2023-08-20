import getUserAgent from "./get-user-agent.js";
import logMsg from "./log-msg.js";

/**
 * Create page in puppeteer
 *
 * @param   {Object}       browser                                   Browser instance
 * @param   {Boolean}      [intersection=false]                      Intersection enable flag
 * @param   {Array}        [types=["image", "font", "stylesheet"]]   Intersection types array
 *
 * @return  {Object}                                                 Puppeteer Page instance
 */
export async function createPage(
    browser,
    intersection = false,
    types = ["image", "font", "stylesheet"]
) {
    if (!browser) {
        logMsg("Browser not defined!");
        return false;
    }

    const page = await browser.newPage();

    await page.setUserAgent(getUserAgent());

    await page.setViewport({
        width: 1920,
        height: 1080,
    });

    await page.setCacheEnabled(true);

    if (intersection) {
        await page.setRequestInterception(true);
        await page.setDefaultNavigationTimeout(0);

        page.on("request", (req) => {
            // ["image", "other", "script", "font", "stylesheet"].indexOf(req.resourceType()) != -1
            return types.includes(req.resourceType())
                ? Promise.resolve()
                      .then(() => req.abort())
                      .catch(() => {})
                : Promise.resolve()
                      .then(() => req.continue())
                      .catch(() => {});
        });
    }

    return page;
}

export default createPage;
