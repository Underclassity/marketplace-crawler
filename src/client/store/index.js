import { createStore } from "vuex";

import axios from "axios";

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
        predictions: {},
    },
    getters: {},
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
        async getPredictions(context, adapter) {
            context.state.predictions[adapter] = await getPredictions(adapter);

            return context.state.predictions[adapter];
        },
    },
    modules: {},
});
