import OverlayBlock from "./components/OverlayBlock/OverlayBlock.vue";

export default {
    name: "App",

    components: {
        OverlayBlock,
    },

    data() {
        return {
            updateInterval: undefined,
            size: this.$store.state.queue.size,
            pending: this.$store.state.queue.pending,
            isPaused: this.$store.state.queue.isPaused,
        };
    },

    async mounted() {
        await this.$store.dispatch("getQueueStatus");

        this.updateInterval = setInterval(async () => {
            await this.$store.dispatch("getQueueStatus");

            this.size = this.$store.state.queue.size;
            this.pending = this.$store.state.queue.pending;
            this.isPaused = this.$store.state.queue.isPaused;
        }, 5 * 1000);
    },

    beforeUnmount() {
        clearInterval(this.updateInterval);
    },
};
