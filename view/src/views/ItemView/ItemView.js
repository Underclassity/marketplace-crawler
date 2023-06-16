import axios from "axios";

export default {
    name: "ItemView",

    data() {
        return {
            files: [],
            count: 0,
        };
    },

    computed: {
        adapter() {
            return this.$route.params.id;
        },

        itemId() {
            return this.$route.params.itemId;
        },
    },

    methods: {
        getImageSrc(image) {
            const { adapter, itemId } = this;

            return `http://localhost:3000/static/${adapter}/${itemId}/${image}?w=200`;
        },

        async getData() {
            const { adapter, itemId } = this;

            try {
                const request = await axios(`/adapters/${adapter}/${itemId}`);

                const { files, count } = request.data;

                this.files = files;
                this.count = count;
            } catch (error) {
                console.log(error.message);
            }
        },
    },

    mounted() {
        this.getData();
    },
};
