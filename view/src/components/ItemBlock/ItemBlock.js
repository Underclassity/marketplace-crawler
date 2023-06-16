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

    // data() {
    //     return {
    //         files: [],
    //         count: 0,
    //     };
    // },

    computed: {
        // images() {
        //     let { files, count } = this;

        //     return count >= 9 ? getRandom(files, 9) : files;
        // },

        images() {
            return this.item.images;
        },

        count() {
            return this.images.length;
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

        getImageSrc(image) {
            const { adapter, itemId } = this;

            return `http://localhost:3000/static/${adapter}/${itemId}/${image}?w=100&h=100&c=true`;
        },
    },

    // async mounted() {
    //     this.getImages();
    // },
};
