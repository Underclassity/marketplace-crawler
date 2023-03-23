import sleep from "./sleep.js";

/**
 * Autoscroll puppeteer page
 *
 * @param   {Object}  page  Puppeteer page
 *
 * @return  {Object}        Promise
 */
export async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = Math.floor(document.body.offsetHeight / 2);

            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;

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
    await page.evaluate(async () => {
        let distance = Math.floor(document.body.offsetHeight / 2);

        // let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);

        return true;
    });

    await sleep(50);
}

export default autoScroll;
