import axios from "axios";

import cheerio from "cheerio";

import { getItems } from "./src/helpers/db.js";

const prefix = "ozon";

async function getItemLink(itemId) {
    try {
        const request = await axios(
            `https://ozon.by/search/?text=${itemId}&from_global=true`,
            {
                method: "GET",
                responseType: "document",
                timeout: 5_000,
            }
        );

        const $ = cheerio.load(request.data);

        let link = false;

        $("[data-state]").each((index, element) => {
            const dataText = $(element).attr("data-state");
            // const id = $(element).attr("id");
            const data = JSON.parse(dataText);

            if (!dataText.includes(itemId) || !data.items) {
                return false;
            }

            const { items } = data;

            for (const item of items) {
                if (item.action.link) {
                    link = link.action.link;
                }
            }
        });

        return link;
    } catch (error) {
        console.log(error.message);
    }

    return false;
}

(async () => {
    const items = await getItems(prefix, true, false, true);

    const cache = {};

    for (const item of items) {
        if (item.link) {
            const id = item.link
                .slice(0, item.link.lastIndexOf("-"))
                .replace("https://ozon.by/product/", "");

            const itemId = item.link.slice(item.link.lastIndexOf("-") + 1);

            if (id in cache) {
                cache[id].reviews.push(...item.reviews);
                cache[id].reviews = cache[id].reviews
                    .filter(
                        (element, index, array) =>
                            array.indexOf(element) === index
                    )
                    .sort((a, b) => a.localeCompare(b));
                cache[id].ids.push(itemId);

                cache[id].ids = cache[id].ids
                    .filter(
                        (element, index, array) =>
                            array.indexOf(element) === index
                    )
                    .sort((a, b) => a.localeCompare(b));
            } else {
                cache[id] = { ...item, ids: [itemId] };
            }
        } else {
            const link = await getItemLink(item.id);

            if (link) {
                console.log(link);
                debugger;
            }
        }
    }

    debugger;
})();
