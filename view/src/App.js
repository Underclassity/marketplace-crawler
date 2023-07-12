// import axios from "axios";

import OverlayBlock from "./components/OverlayBlock/OverlayBlock.vue";

export default {
    name: "App",

    components: {
        OverlayBlock,
    },

    // async mounted() {
    //     try {
    //         const request = await axios("/queue");

    //         const { queue } = request.data;

    //         console.log(queue);
    //     } catch (error) {
    //         console.error(error);
    //     }
    // },
};
