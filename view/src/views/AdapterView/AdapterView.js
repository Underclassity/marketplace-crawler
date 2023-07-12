import axios from "axios";

import ControlsBlock from "../../components/ControlsBlock/ControlsBlock.vue";
import ItemBlock from "../../components/ItemBlock/ItemBlock.vue";
import PaginationBlock from "../../components/PaginationBlock/PaginationBlock.vue";

export default {
    name: "AdapterView",

    components: {
        ControlsBlock,
        ItemBlock,
        PaginationBlock,
    },

    data() {
        return {
            adapter: this.$route.params.id,
            items: [],
            brands: [],
            predictions: {},
            count: 0,

            page: 1,
            limit: 12,
            sortId: false,
            brand: false,
            prediction: false,

            isPhotos: true,

            itemsForDelete: [],
        };
    },

    methods: {
        async getBrands() {
            try {
                const request = await axios(`/brands/${this.adapter}`);

                let { brands } = request.data;

                this.brands = brands;
            } catch (error) {
                console.error(error.message);
            }
        },

        async getPredictions() {
            try {
                const request = await axios(`/predictions/${this.adapter}`);

                let { predictions } = request.data;

                this.predictions = predictions;
            } catch (error) {
                console.error(error.message);
            }
        },

        async getItems() {
            this.emitter.emit("triggerSpinner", true);

            let { page, limit, isPhotos, sortId, brand } = this;

            try {
                const request = await axios(`/adapters/${this.adapter}`, {
                    params: {
                        page,
                        limit,
                        photos: isPhotos,
                        sort: sortId,
                        brand,
                    },
                });

                let { items, count } = request.data;

                this.items = items;
                this.count = count;
            } catch (error) {
                console.error(error.message);
            }

            this.emitter.emit("triggerSpinner", false);
        },

        changeRoute() {
            console.log("Change route call");

            let { page, limit, isPhotos, sortId, brand, prediction } = this;

            this.$router.push({
                query: {
                    page,
                    limit,
                    photos: isPhotos,
                    sort: sortId,
                    brand,
                    prediction,
                },
            });
        },

        getRouterParams() {
            let { page, limit, photos, sort, brand, prediction } =
                this.$route.query;

            this.page = page ? parseInt(page, 10) : 1;
            this.limit = limit ? parseInt(limit, 10) : 12;
            this.isPhotos = photos == "true";
            this.sortId = sort || false;
            this.brand = brand || false;
            this.prediction = prediction || false;

            // Reset items
            this.itemsForDelete = [];

            this.getItems();
        },

        updateDeleteItems(id) {
            if (this.itemsForDelete.includes(id)) {
                this.itemsForDelete.splice(this.itemsForDelete.indexOf(id), 1);
            } else {
                this.itemsForDelete.push(id);
            }
        },
    },

    async mounted() {
        await this.getItems();
        await this.getBrands();
        await this.getPredictions();
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
        this.emitter.on("updateDeleteItems", this.updateDeleteItems);
        this.emitter.on("updateItems", this.getItems);
    },

    beforeUnmout() {
        this.emitter.off("changeRoute", this.changeRoute);
        this.emitter.off("updateDeleteItems", this.updateDeleteItems);
        this.emitter.off("updateItems", this.getItems);
    },
};
