export default {
    name: "QueueStatus",

    data() {
        return {
            updateInterval: undefined,
            size: this.$store.state.queue.size,
            pending: this.$store.state.queue.pending,
            isPaused: this.$store.state.queue.isPaused,

            priorities: {
                page: 1,
                item: 2,
                review: 3,
                checkSize: 4,
                download: 5,
                cut: 6,
                thumbnail: 7,
            },

            values: {
                page: 0,
                item: 0,
                review: 0,
                checkSize: 0,
                download: 0,
                cut: 0,
                thumbnail: 0,
            },
        };
    },

    async mounted() {
        await this.$store.dispatch("getQueueStatus");

        this.updateInterval = setInterval(async () => {
            await this.$store.dispatch("getQueueStatus");

            const { size, pending, isPaused } = this.$store.state.queue;

            let isUpdated = false;

            if (size != this.size) {
                this.size = size;
                isUpdated = true;
            }

            if (pending != this.pending) {
                this.pending = pending;
                isUpdated = true;
            }

            if (isPaused != this.isPaused) {
                this.isPaused = isPaused;
                isUpdated = true;
            }

            if (isUpdated) {
                this.emitter.emit("updateItems");
            }

            for (const id in this.values) {
                if (this.values[id] != this.$store.state.queue[id]) {
                    this.values[id] = this.$store.state.queue[id];
                    isUpdated = true;
                }
            }
        }, 5 * 1000);
    },

    beforeUnmount() {
        clearInterval(this.updateInterval);
    },
};
