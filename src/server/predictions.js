import express from "express";

import {
    addPrediction,
    getPredictions,
    getPredictionsForFile,
    getPredictionsForItem,
} from "../helpers/db.js";

import getAdaptersIds from "../helpers/get-adapters-ids.js";

const adapters = getAdaptersIds();

export const predictionsRouter = express.Router();

predictionsRouter.get("/:adapter", async (req, res) => {
    const { adapter } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    return res.json({
        predictions: await getPredictions(adapter),
        error: false,
    });
});

predictionsRouter.get("/:adapter/:itemId", async (req, res) => {
    const { adapter, itemId } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    if (!itemId) {
        return res.json({
            result: false,
            error: `${itemId} not found in adapter ${adapter}`,
        });
    }

    return res.json({
        predictions: await getPredictionsForItem(adapter, itemId),
        error: false,
    });
});

predictionsRouter.get("/:adapter/:itemId/:filename", async (req, res) => {
    const { adapter, itemId, filename } = req.params;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    if (!itemId) {
        return res.json({
            result: false,
            error: `${itemId} not found in adapter ${adapter}`,
        });
    }

    return res.json({
        predictions: await getPredictionsForFile(adapter, itemId, filename),
        error: false,
    });
});

predictionsRouter.post("/:adapter/:itemId/:filename", async (req, res) => {
    const { adapter, itemId, filename } = req.params;
    const predictions = req.body;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    if (!itemId) {
        return res.json({
            result: false,
            error: `${itemId} not found in adapter ${adapter}`,
        });
    }

    if (!Array.isArray(predictions)) {
        return res.json({
            result: false,
            error: "Predictions is not an array",
        });
    }

    return res.json({
        result: await addPrediction(adapter, itemId, filename, predictions),
        error: false,
    });
});

export default predictionsRouter;
