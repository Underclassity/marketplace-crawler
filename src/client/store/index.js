import { createStore } from "vuex";

import axios from "axios";

export default createStore({
    state: {
        queue: {
            size: 0,
            pending: 0,
            isPaused: true,
        },
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
    },
    modules: {},
});
