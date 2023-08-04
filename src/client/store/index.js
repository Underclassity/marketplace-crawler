import { createStore } from "vuex";

import axios from "axios";

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
            try {
                const request = await axios("/queue");

                const { size, pending, isPaused } = request.data;

                context.state.queue.size = size;
                context.state.queue.pending = pending;
                context.state.queue.isPaused = isPaused;
            } catch (error) {
                console.error(error);
            }
        },

        async updateItems(context, { adapter, items }) {
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
        },

        async isFavorite(context, { adapter, itemId }) {
            try {
                const request = await axios(`/favorite/${adapter}/${itemId}`, {
                    method: "GET",
                });

                return request.data;
            } catch (error) {
                console.error(error);
            }
        },

        async addToFavorite(context, { adapter, itemId }) {
            try {
                const request = await axios(`/favorite/${adapter}/${itemId}`, {
                    method: "POST",
                });

                return request.data;
            } catch (error) {
                console.error(error);
            }
        },

        async removeToFavorite(context, { adapter, itemId }) {
            try {
                const request = await axios(`/favorite/${adapter}/${itemId}`, {
                    method: "DELETE",
                });

                return request.data;
            } catch (error) {
                console.error(error);
            }
        },

        async getBrands(context, adapter) {
            try {
                const request = await axios(`/brands/${adapter}`);

                let { brands } = request.data;

                context.state.brands[adapter] = brands;

                return brands;
            } catch (error) {
                console.error(error.message);
            }

            return false;
        },

        async getTags(context, adapter) {
            try {
                const request = await axios(`/tags/${adapter}`);

                let { tags } = request.data;

                context.state.tags[adapter] = tags;

                return tags;
            } catch (error) {
                console.error(error.message);
            }

            return false;
        },

        async getPredictions(context, adapter) {
            try {
                const request = await axios(`/predictions/${adapter}`);

                let { predictions } = request.data;

                context.state.predictions[adapter] = predictions;

                return predictions;
            } catch (error) {
                console.error(error.message);
            }

            return false;
        },
    },
    modules: {},
});
