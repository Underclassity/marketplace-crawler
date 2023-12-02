import { createStore } from "vuex";

import axios from "axios";

import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-backend-webgl";

// import * as mobilenet from "@tensorflow-models/mobilenet";
import * as cocoSSD from "@tensorflow-models/coco-ssd";

/**
 * Get queue status
 *
 * @return  {Object}  Queue status object
 */
async function getQueueStatus() {
    try {
        const request = await axios("/queue");

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Update items by IDs array
 *
 * @param   {String}  adapter  Adapter
 * @param   {Array}  items    Array of items IDs
 *
 * @return  {Object}           Result
 */
async function updateItems(adapter, items) {
    try {
        const request = await axios(`/queue/${adapter}`, {
            method: "POST",
            data: {
                items,
            },
        });

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Update brand by ID
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  brand    Brand ID
 *
 * @return  {Object}           Result
 */
async function updateBrand(adapter, brand) {
    try {
        const request = await axios(`/queue/${adapter}`, {
            method: "POST",
            data: {
                brand,
            },
        });

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Get items by query
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  query    Query
 *
 * @return  {Object}           Result
 */
async function getItemsByQuery(adapter, query) {
    try {
        const request = await axios(`/queue/${adapter}`, {
            method: "POST",
            data: {
                query,
            },
        });

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Check item is favorite
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  itemId   Item ID
 *
 * @return  {Object}           Result
 */
async function isFavorite(adapter, itemId) {
    try {
        const request = await axios(`/favorite/${adapter}/${itemId}`, {
            method: "GET",
        });

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Add item to favorites
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  itemId   Item ID
 *
 * @return  {Object}           Result
 */
async function addToFavorite(adapter, itemId) {
    try {
        const request = await axios(`/favorite/${adapter}/${itemId}`, {
            method: "POST",
        });

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Remove item from favorites
 *
 * @param   {String}  adapter  Adapter
 * @param   {String}  itemId   Item ID
 *
 * @return  {Object}           Result
 */
async function removeToFavorite(adapter, itemId) {
    try {
        const request = await axios(`/favorite/${adapter}/${itemId}`, {
            method: "DELETE",
        });

        return request.data;
    } catch (error) {
        console.error(error);
    }

    return false;
}

/**
 * Get brands for adapter
 *
 * @param   {String}  adapter  Adapter
 *
 * @return  {Object}           Brands
 */
async function getBrands(adapter) {
    try {
        const request = await axios(`/brands/${adapter}`);

        let { brands } = request.data;

        return brands;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

/**
 * Get tags for adapter
 *
 * @param   {String}  adapter  Adapter
 *
 * @return  {Object}           Tags
 */
async function getTags(adapter) {
    try {
        const request = await axios(`/tags/${adapter}`);

        let { tags } = request.data;

        return tags;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

/**
 * Get categories for adapter
 *
 * @param   {String}  adapter  Adapter
 *
 * @return  {Object}           Tags
 */
async function getCategories(adapter) {
    try {
        const request = await axios(`/categories/${adapter}`);

        let { categories } = request.data;

        return categories;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

/**
 * Get predictions for adapter
 *
 * @param   {String}  adapter  Adapter
 *
 * @return  {Object}           Predictions
 */
async function getPredictions(adapter) {
    try {
        const request = await axios(`/predictions/${adapter}`);

        let { predictions } = request.data;

        return predictions;
    } catch (error) {
        console.error(error.message);
    }

    return false;
}

export default createStore({
    state: {
        queue: {
            size: 0,
            pending: 0,
            isPaused: true,
        },

        brands: {},
        tags: {},
        categories: {},
        predictions: {},

        model: undefined,
    },
    getters: {
        isModel(state) {
            return state.model != undefined;
        },
    },
    mutations: {},
    actions: {
        async getQueueStatus(context) {
            context.state.queue = await getQueueStatus();
            return context.state.queue;
        },
        async updateItems(context, { adapter, items }) {
            return await updateItems(adapter, items);
        },
        async updateBrand(context, { adapter, brand }) {
            return updateBrand(adapter, brand);
        },
        async getItemsByQuery(context, { adapter, query }) {
            return await getItemsByQuery(adapter, query);
        },
        async isFavorite(context, { adapter, itemId }) {
            return await isFavorite(adapter, itemId);
        },
        async addToFavorite(context, { adapter, itemId }) {
            return await addToFavorite(adapter, itemId);
        },
        async removeToFavorite(context, { adapter, itemId }) {
            return await removeToFavorite(adapter, itemId);
        },
        async getBrands(context, adapter) {
            context.state.brands[adapter] = await getBrands(adapter);

            return context.state.brands[adapter];
        },
        async getTags(context, adapter) {
            context.state.tags[adapter] = await getTags(adapter);

            return context.state.tags[adapter];
        },
        async getCategories(context, adapter) {
            context.state.categories[adapter] = await getCategories(adapter);

            return context.state.categories[adapter];
        },
        async getPredictions(context, adapter) {
            context.state.predictions[adapter] = await getPredictions(adapter);

            return context.state.predictions[adapter];
        },

        async loadModel(context) {
            if (context.state.model) {
                return false;
            }

            console.debug("[Store]", "Start model load");

            const startTime = Date.now();

            // const model = await mobilenet.load({
            //     version: 2,
            //     alpha: 1.0,
            //     // modelUrl: "/models/ssd_mobilenet_v2/model.json",
            // });

            const model = Object.freeze(await cocoSSD.load());

            context.state.model = model;

            const endTime = Date.now();

            console.debug(
                "[Store]",
                "Model loaded",
                Math.round(endTime - startTime),
                "sec"
            );

            return true;
        },

        async analyzeImage(context, image) {
            if (!context.state.model) {
                console.log("No model found");
                return false;
            }

            // return await context.state.model.classify(image);
            return await context.state.model.detect(image);
        },
    },
    modules: {},
});
