import express from "express";

import getAdaptersIds from "../helpers/get-adapters-ids.js";

const adapters = getAdaptersIds();

export const categoriesRouter = express.Router();

categoriesRouter.get("/", async (req, res) => {
    const data = [];

    for (const adapter of adapters) {
        const { getCategories } = await import(`../adapters/${adapter}.js`);

        if (getCategories) {
            const categories = await getCategories(false);

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

export default categoriesRouter;
