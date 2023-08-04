import prettyBytes from "pretty-bytes";
// import axios from "axios";

// import getRandom from "../../../../src/helpers/random.js";

export default {
    name: "ItemBlock",

    props: {
        item: {
            type: Object,
            required: true,
        },

        itemId: {
            type: String,
            required: true,
        },

        adapter: {
            type: String,
            required: true,
        },
    },

    data() {
        return {
            // files: [],
            // count: 0,

            isUpdating: false,
        };
    },

    computed: {
        // images() {
        //     let { files, count } = this;

        //     return count >= 9 ? getRandom(files, 9) : files;
        // },

        isFavorite() {
            return this.item.favorite || false;
        },

        emptyImagesCount() {
            const { count } = this;

            if (count == 0) {
                return 1;
            }

            if (count == 1) {
                return 0;
            }

            if (count > 1 && count <= 4) {
                return 4 - count;
            }

            return 9 - count;
        },

        images() {
            return this.item.images || [];
        },

        count() {
            return this.images.length || 0;
        },

        brand() {
            const brands = this.$store.state.brands[this.adapter];
            const { brand } = this.item;

            if (brands && brand in brands && brands[brand].name) {
                return brands[brand].name;
            }

            return brand;
        },
    },

    methods: {
        // async getImages() {
        //     let { adapter, itemId } = this;

        //     try {
        //         const request = await axios(`/files/${adapter}/${itemId}`);

        //         let { files, count } = request.data;

        //         this.files = files;
        //         this.count = count;
        //     } catch (error) {
        //         console.log(error.message);
        //     }
        // },

        async addToFavorite() {
            let { adapter, itemId } = this;

            console.log(`Add ${adapter} item ${itemId} to favorite`);

            this.emitter.emit("triggerSpinner", true);
            await this.$store.dispatch("addToFavorite", { adapter, itemId });
            this.emitter.emit("triggerSpinner", false);
            this.emitter.emit("updateItems");
        },

        async removeFromFavorite() {
            let { adapter, itemId } = this;

            console.log(`Remove ${adapter} item ${itemId} from favorite`);

            this.emitter.emit("triggerSpinner", true);
            await this.$store.dispatch("removeFromFavorite", {
                adapter,
                itemId,
            });
            this.emitter.emit("triggerSpinner", false);
            this.emitter.emit("updateItems");
        },

        async updateItem() {
            if (this.isUpdating) {
                return false;
            }

            this.isUpdating = true;

            const { itemId, adapter } = this;

            const { result } = await this.$store.dispatch("updateItems", {
                items: [itemId],
                adapter,
            });

            this.isUpdating = false;

            if (result) {
                this.emitter.emit("updateItems");
            }

            return true;
        },

        pretty(size) {
            return prettyBytes(size || 0);
        },

        updateDeleteItems(id) {
            this.emitter.emit("updateDeleteItems", id);
        },

        getImageSrc(image) {
            const { adapter, itemId, count } = this;

            const ratio = count <= 4 ? 2 : 1;

            const size = 100 * ratio;

            return `http://localhost:3000/static/${adapter}/${itemId}/${image}?w=${size}&h=${size}&c=true`;
        },

        getImageClassname() {
            const { count } = this;

            if (count <= 1) {
                return "item-images-1";
            }

            if (count > 1 && count <= 4) {
                return "item-images-4";
            }

            return "item-images-9";
        },

        getTimeClass() {
            const { time } = this.item;

            const currentTime = Date.now();

            const timeDiff = currentTime - time;

            const optTimeDiff = 12 * 60 * 60 * 1000; // 12 hours

            if (timeDiff > optTimeDiff) {
                return "red";
            }

            if (timeDiff >= optTimeDiff / 2) {
                return "yellow";
            }

            return "green";
        },
    },

    // async mounted() {
    //     this.getImages();
    // },
};
