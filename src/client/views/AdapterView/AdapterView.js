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
            categories: {},
            predictions: {},
            count: 0,

            page: 1,
            limit: 12,
            sortId: false,
            brand: false,
            tag: false,
            category: false,
            prediction: false,

            query: "",

            isPhotos: true,
            isFavorite: false,

            itemsForDelete: [],
        };
    },

    computed: {
        categoriesItems() {
            const { categories } = this;

            if (!categories || !Object.keys(categories).length) {
                return [];
            }

            const results = [];

            for (const categoryId in categories) {
                for (const subCategoryId in categories[categoryId]) {
                    const item = categories[categoryId][subCategoryId];

                    results.push({
                        title: `${categoryId}-${subCategoryId}`,
                        ...item,
                    });
                }
            }

            results.sort((a, b) => a.title.localeCompare(b.title));

            return results;
        },
    },

    methods: {
        async getBrands() {
            this.brands = await this.$store.dispatch("getBrands", this.adapter);
        },

        async getTags() {
            this.tags = await this.$store.dispatch("getTags", this.adapter);
        },

        async getCategories() {
            this.categories = await this.$store.dispatch(
                "getCategories",
                this.adapter
            );
        },

        async getPredictions() {
            this.predictions = await this.$store.dispatch(
                "getPredictions",
                this.adapter
            );
        },

        async getItems() {
            this.emitter.emit("triggerSpinner", true);

            let {
                page,
                limit,
                isPhotos,
                sortId,
                category,
                brand,
                tag,
                isFavorite,
            } = this;

            try {
                const request = await axios(`/adapters/${this.adapter}`, {
                    params: {
                        page,
                        limit,
                        photos: isPhotos,
                        favorite: isFavorite,
                        sort: sortId,
                        category,
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

        changeFilter() {
            this.page = 1;
            this.changeRoute();
        },

        changeRoute() {
            console.log("Change route call");

            let {
                page,
                limit,
                isPhotos,
                sortId,
                brand,
                category,
                prediction,
                tag,
                isFavorite,
            } = this;

            this.$router.push({
                query: {
                    page,
                    limit,
                    photos: isPhotos,
                    favorite: isFavorite,
                    sort: sortId,
                    brand,
                    category,
                    prediction,
                    tag,
                },
            });
        },

        getRouterParams() {
            let {
                page,
                limit,
                photos,
                sort,
                brand,
                category,
                prediction,
                tag,
                favorite,
            } = this.$route.query;

            this.page = page ? parseInt(page, 10) : 1;
            this.limit = limit ? parseInt(limit, 10) : 12;
            this.isPhotos = photos == "true";
            this.isFavorite = favorite == "true";
            this.sortId = sort || false;
            this.brand = brand == "false" ? false : brand;
            this.prediction = prediction || false;
            this.tag = tag || false;
            this.category = category || false;

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

            const { adapter, items } = this;

            const { result } = await this.$store.dispatch("updateItems", {
                items: items.map((item) => item.id),
                adapter,
            });

            console.log(
                `Update items on page result: ${JSON.stringify(result)}`
            );

            this.emitter.emit("triggerSpinner", false);

            return await this.getItems();
        },

        async updateBrand() {
            const { adapter, brand } = this;

            if (!brand || !brand.length) {
                return false;
            }

            this.emitter.emit("triggerSpinner", true);

            const { result } = await this.$store.dispatch("updateBrand", {
                adapter,
                brand,
            });

            console.log(`Update brand ${brand} result: ${result}`);

            this.emitter.emit("triggerSpinner", false);

            return await this.getItems();
        },

        async getItemsByQuery() {
            const { adapter, query } = this;

            if (!query || !query.length) {
                return false;
            }

            this.emitter.emit("triggerSpinner", true);

            const { result } = await this.$store.dispatch("getItemsByQuery", {
                adapter,
                query,
            });

            console.log(`Get items by query ${query} result: ${result}`);

            this.emitter.emit("triggerSpinner", false);

            return await this.getItems();
        },
    },

    async mounted() {
        await this.getItems();
        await this.getBrands();
        await this.getTags();
        await this.getCategories();
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
