import axios from "axios";
import prettyBytes from "pretty-bytes";

export default {
    name: "ItemView",

    data() {
        return {
            files: [],
            count: 0,
            size: 0,
        };
    },

    computed: {
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

                const { files, count, size } = request.data;

                this.files = files;
                this.count = count;
                this.size = size;
            } catch (error) {
                console.log(error.message);
            }
        },
    },

    mounted() {
        this.getData();
    },
};
