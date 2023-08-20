/**
 * Close browser and all pages
 *
 * @param   {Object}  browser  Puppeteer browser
 *
 * @return  {Boolean}          Result
 */
export async function browserClose(browser) {
    if (!browser) {
        return false;
    }

    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));

    await browser.close();

    return true;
}

export default browserClose;
