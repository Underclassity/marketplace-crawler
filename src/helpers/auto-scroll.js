import sleep from "./sleep.js";

/**
 * Autoscroll puppeteer page
 *
 * @param   {Object}          page  Puppeteer page
 *
 * @return  {Object|Boolean}        Promise
 */
export async function autoScroll(page) {
    if (!page) {
        return false;
    }

    return await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = Math.floor(document.body.offsetHeight / 2);

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;

                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

/**
 * Scroll ticj for page
 *
 * @param   {Object}  page  Puppeteer page
 *
 * @return  {Boolean}       Result
 */
export async function scrollTick(page) {
    if (!page) {
        return false;
    }

    await page.evaluate(async () => {
        const distance = Math.floor(document.body.offsetHeight / 2);

        // let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);

        return true;
    });

    await sleep(50);

    return true;
}

export default autoScroll;
