import express from "express";

import { addToFavorite, loadDB, removeFromFavorite } from "../helpers/db.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";

const adapters = getAdaptersIds();

export const favoriteRouter = express.Router();

favoriteRouter.get("/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    const dbFavoritePrefix = `${adapter}-favorite`;

    const dbFavorite = loadDB(dbFavoritePrefix);

    if (!(itemId in dbFavorite.data) && !dbFavorite.data[itemId]) {
        return res.json({
            result: false,
            error: false,
        });
    }

    return res.json({
        result: true,
        error: false,
    });
});

favoriteRouter.post("/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    const result = addToFavorite(adapter, itemId);

    return res.json({
        result,
        error: false,
    });
});

favoriteRouter.delete("/:adapter/:itemId", (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    const result = removeFromFavorite(adapter, itemId);

    return res.json({
        result,
        error: false,
    });
});

export default favoriteRouter;
