import { mapState } from "vuex";

import axios from "axios";
import prettyBytes from "pretty-bytes";

export default {
    name: "ItemView",

    data() {
        return {
            reviews: [],
            count: 0,
            size: 0,
        };
    },

    computed: {
        ...mapState(["categories"]),

        adapter() {
            return this.$route.params.id;
        },

        itemId() {
            return this.$route.params.itemId;
        },

        prettySize() {
            return prettyBytes(this.size);
        },
    },

    methods: {
        getImageSrc(file) {
            const { adapter, itemId } = this;

            // return `http://localhost:3000/static/${adapter}/${itemId}/${image}?w=200`;
            return `http://localhost:3000/static/${adapter}/${itemId}/${file}`;
        },

        getVideoSrc(file) {
            const { adapter, itemId } = this;

            return `http://localhost:3000/${adapter}/${itemId}/${file}`;
        },

        async getData() {
            const { adapter, itemId } = this;

            try {
                const request = await axios(`/adapters/${adapter}/${itemId}`);

                const { reviews, count, size } = request.data;

                this.reviews = reviews;
                this.count = count;
                this.size = size;
            } catch (error) {
                console.log(error.message);
            }
        },

        async analyze(file) {
            const { adapter, itemId } = this;

            if (!this.$store.state.model) {
                return false;
            }

            const image = this.$refs[file][0];

            const predictions = await this.$store.dispatch(
                "analyzeImage",
                image
            );

            console.log(`${adapter}-${itemId}-${file}: `, predictions);
        },
    },

    mounted() {
        this.getData();
    },
};
