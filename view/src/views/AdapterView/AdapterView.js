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
            tags: [],
            predictions: {},
            count: 0,

            page: 1,
            limit: 12,
            sortId: false,
            brand: false,
            tag: false,
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

        async getTags() {
            try {
                const request = await axios(`/tags/${this.adapter}`);

                let { tags } = request.data;

                this.tags = tags;
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

            let { page, limit, isPhotos, sortId, brand, tag } = this;

            try {
                const request = await axios(`/adapters/${this.adapter}`, {
                    params: {
                        page,
                        limit,
                        photos: isPhotos,
                        sort: sortId,
                        brand,
                        tag,
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

            let { page, limit, isPhotos, sortId, brand, prediction, tag } =
                this;

            this.$router.push({
                query: {
                    page,
                    limit,
                    photos: isPhotos,
                    sort: sortId,
                    brand,
                    prediction,
                    tag,
                },
            });
        },

        getRouterParams() {
            let { page, limit, photos, sort, brand, prediction, tag } =
                this.$route.query;

            this.page = page ? parseInt(page, 10) : 1;
            this.limit = limit ? parseInt(limit, 10) : 12;
            this.isPhotos = photos == "true";
            this.sortId = sort || false;
            this.brand = brand || false;
            this.prediction = prediction || false;
            this.tag = tag || false;

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

        async updateAllOnPage() {
            console.log("Update all on page click");

            this.emitter.emit("triggerSpinner", true);

            const { items, adapter } = this;

            const { result } = await this.$store.dispatch("updateItems", {
                items: items.map((item) => item.id),
                adapter,
            });

            console.log("Update result: ", result);

            this.emitter.emit("triggerSpinner", false);

            return await this.getItems();
        },
    },

    async mounted() {
        await this.getItems();
        await this.getBrands();
        await this.getTags();
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
