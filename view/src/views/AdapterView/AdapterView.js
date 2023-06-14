import axios from "axios";

import ItemBlock from "../../components/ItemBlock/ItemBlock.vue";
import PaginationBlock from "../../components/PaginationBlock/PaginationBlock.vue";

export default {
    name: "AdapterView",

    components: {
        ItemBlock,
        PaginationBlock,
    },

    data() {
        return {
            adapter: this.$route.params.id,
            items: [],
            count: 0,

            page: 1,
            limit: 10,

            isPhotos: false,
        };
    },

    methods: {
        async getItems() {
            let { page, limit, isPhotos } = this;

            try {
                const request = await axios(`/adapters/${this.adapter}`, {
                    params: {
                        page,
                        limit,
                        photos: isPhotos,
                    },
                });

                let { items, count } = request.data;

                this.items = items;
                this.count = count;
            } catch (error) {
                console.log(error.message);
            }
        },

        changeRoute() {
            let { page, limit, isPhotos } = this;

            this.$router.push({
                query: {
                    page,
                    limit,
                    photos: isPhotos,
                },
            });
        },

        getRouterParams() {
            let { page, limit, photos } = this.$route.query;

            this.page = page ? parseInt(page, 10) : 1;
            this.limit = limit ? parseInt(limit, 10) : 10;
            this.isPhotos = photos == "true" ? true : false;

            this.getItems();
        },
    },

    mounted() {
        this.getItems();
    },

    created() {
        this.$watch(
            () => this.$route.params,
            () => {
                this.getRouterParams();
            },
            { immediate: true }
        );
    },
};
