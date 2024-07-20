import express from "express";

import getAdaptersIds from "../helpers/get-adapters-ids.js";
import { getItemsData, getItem } from "../helpers/db.js";

const adapters = getAdaptersIds();

export const categoriesRouter = express.Router();

function wildberriesCategoriesReducer(category, root, category_id) {
    if (category.id == root || category.id == category_id) {
        if (category.count) {
            category.count++;
        } else {
            category.count = 1;
        }
    }

    if (!category.nodes) {
        return false;
    }

    for (const node of category.nodes) {
        if (node.id == root || node.id == category_id) {
            if (node.count) {
                node.count++;
            } else {
                node.count = 1;
            }
        }

        if (node.nodes) {
            for (const category_item of node.nodes) {
                wildberriesCategoriesReducer(category_item, root, category_id);
            }
        }
    }
}

categoriesRouter.get("/", async (req, res) => {
    const data = [];

    for (const adapter of adapters) {
        const { getCategories } = await import(`../adapters/${adapter}.js`);

        if (getCategories) {
            const categories = await getCategories(false);

            if (adapter == "wildberries") {
                const items = await getItemsData(adapter, true);

                for (const { value: item } of items) {
                    if (!item.info) {
                        continue;
                    }

                    const root = item.info.data.subject_root_id;
                    const id = item.info.data.subject_id;

                    for (const category of categories) {
                        wildberriesCategoriesReducer(category, root, id);
                    }
                }
            }

            data.push({
                id: adapter,
                categories,
            });
        } else {
            data.push({
                id: adapter,
                categories: {},
            });
        }
    }

    return res.json({
        adapters: data,
    });
});

categoriesRouter.get("/:adapter", async (req, res) => {
    const { adapter } = req.params;

    console.time("get items");
    const items = await getItemsData(adapter, true);
    console.timeEnd("get items");

    if (adapter != "wildberries" || !items.length) {
        return res.json({ categories: {} });
    }

    const cache = {};

    for (const { value: product } of items) {
        if (!product.info) {
            continue;
        }

        const { info } = product;

        if (!cache[info.subj_root_name]) {
            cache[info.subj_root_name] = {};
        }

        if (!cache[info.subj_root_name][info.subj_name]) {
            cache[info.subj_root_name][info.subj_name] = {
                count: 0,
                subject_id: info.data.subject_id,
                subject_root_id: info.data.subject_root_id,
            };
        }

        cache[info.subj_root_name][info.subj_name].count++;

        if (
            info.data.subject_id !=
            cache[info.subj_root_name][info.subj_name].subject_id
        ) {
            console.log(info);
        }

        if (
            info.data.subject_root_id !=
            cache[info.subj_root_name][info.subj_name].subject_root_id
        ) {
            console.log(info);
        }
    }

    return res.json({ categories: cache });
});

export default categoriesRouter;
