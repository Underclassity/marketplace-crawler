import NavigationBar from "./components/NavigationBar/NavigationBar.vue";
import OverlayBlock from "./components/OverlayBlock/OverlayBlock.vue";
import QueueStatus from "./components/QueueStatus/QueueStatus.vue";

export default {
    name: "App",

    components: {
        NavigationBar,
        OverlayBlock,
        QueueStatus,
    },

    mounted() {
        this.emitter.on("analyze", this.analyze);

        this.$store.dispatch("loadModel");
    },
};
