import axios from "axios";

import PaginationBlock from "../../components/PaginationBlock/PaginationBlock.vue";

export default {
    name: "UserView",

    components: {
        PaginationBlock,
    },

    data() {
        return {
            adapter: this.$route.params.id,
            users: [],

            count: 0,

            page: 1,
            limit: 10,
            sortId: false,

            query: "",

            isPhotos: true,
            isFavorite: false,
        };
    },

    methods: {
        changeRoute() {
            console.log("Change route call");

            let { page, limit, isPhotos, sortId, isFavorite } = this;

            this.$router.push({
                query: {
                    page,
                    limit,
                    photos: isPhotos,
                    favorite: isFavorite,
                    sort: sortId,
                },
            });
        },

        getRouterParams() {
            let {
                page,
                limit,
                photos,
                sort,

                favorite,
            } = this.$route.query;

            this.page = page ? parseInt(page, 10) : 1;
            this.limit = limit ? parseInt(limit, 10) : 10;
            this.isPhotos = photos == "true";
            this.isFavorite = favorite == "true";
            this.sortId = sort || false;

            this.getItems();
        },

        async getItems() {
            this.emitter.emit("triggerSpinner", true);

            let { page, limit, isPhotos, sortId, isFavorite } = this;

            try {
                const request = await axios(`/users/${this.adapter}`, {
                    params: {
                        page,
                        limit,
                        photos: isPhotos,
                        favorite: isFavorite,
                        sort: sortId,
                    },
                });

                let { users, count } = request.data;

                this.users = users;
                this.count = count;
            } catch (error) {
                console.error(error.message);
            }

            this.emitter.emit("triggerSpinner", false);
        },
    },

    async mounted() {
        await this.getItems();
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

    beforeMount() {
        this.emitter.on("changeRoute", this.changeRoute);
    },

    beforeUnmout() {
        this.emitter.off("changeRoute", this.changeRoute);
    },
};
