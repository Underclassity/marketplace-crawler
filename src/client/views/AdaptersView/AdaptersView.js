import axios from "axios";

export default {
    name: "AdaptersView",

    data() {
        return {
            adapters: {},
        };
    },

    async mounted() {
        try {
            const request = await axios("http://localhost:3000/adapters");

            const { adapters } = request.data;

            console.log(
                `Adapters: ${adapters.map((item) => item.id).join(", ")}`
            );

            this.adapters = adapters;
        } catch (error) {
            console.log(error.message);
        }
    },
};
