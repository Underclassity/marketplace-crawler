import axios from "axios";

import { nextTick } from "vue";
import { mapGetters } from "vuex";

import sleep from "../../../helpers/sleep.js";

export default {
    name: "AnalyzeView",

    data() {
        return {
            adapters: {},
            files: {},

            imgSrc: false,

            adapter: false,
            itemId: false,
            filename: false,
        };
    },

    computed: {
        ...mapGetters(["isModel"]),
    },

    methods: {
        async getAdapters() {
            try {
                const request = await axios("http://localhost:3000/adapters");

                const { adapters } = request.data;

                console.log(
                    `Adapters: ${adapters.map((item) => item.id).join(", ")}`
                );

                this.adapters = adapters;
            } catch (error) {
                console.log(error.message);
            }
        },

        async addPredictions(predictions, adapter, itemId, filename) {
            try {
                const request = await axios(
                    `http://localhost:3000/predictions/${adapter}/${itemId}/${filename}`,
                    {
                        method: "POST",
                        data: predictions,
                    }
                );

                const { result } = request.data;

                console.log(
                    `[${adapter}][${itemId}]: Add predictions result ${filename}: ${result}`
                );

                return result;
            } catch (error) {
                console.log(error.message);
            }

            return false;
        },

        async getAdapterFiles(adapter) {
            try {
                const request = await axios(
                    `http://localhost:3000/adapters/${adapter}/files`
                );

                const { files } = request.data;

                this.files[adapter] = files;

                return files;
            } catch (error) {
                console.log(error.message);
            }
        },

        async getAdaptersFiles() {
            const { adapters } = this;

            if (!adapters) {
                return false;
            }

            for (const adapterItem of adapters) {
                const { id: adapter } = adapterItem;

                await this.getAdapterFiles(adapter);
            }
        },

        getImageSrc(adapter, itemId, filename) {
            return `http://localhost:3000/static/${adapter}/${itemId}/${filename}`;
        },

        async processFiles() {
            const { adapters } = this;

            if (!adapters) {
                return false;
            }

            if (!this.isModel) {
                console.log("Wait for model load");
                this.emitter.emit("triggerSpinner", true);
                while (!this.isModel) {
                    await sleep(100);
                }
                this.emitter.emit("triggerSpinner", false);
            }

            for (const adapterItem of adapters) {
                const { id: adapter } = adapterItem;
                const files = this.files[adapter];

                if (!files || !Object.keys(files).length) {
                    continue;
                }

                console.log(`Process ${adapter} files`);

                for (const itemId in files) {
                    for (const filename of files[itemId]) {
                        const filepath = this.getImageSrc(
                            adapter,
                            itemId,
                            filename
                        );

                        this.adapter = adapter;
                        this.itemId = itemId;
                        this.filename = filename;

                        this.imgSrc = filepath;

                        console.log(
                            `[${adapter}][${itemId}]: Load image ${filename}`
                        );

                        await nextTick();

                        const image = this.$refs.image;

                        const isLoaded = await new Promise((resolve) => {
                            image.onload = () => {
                                console.log(
                                    `[${adapter}][${itemId}]: Image loaded ${filename}`
                                );
                                resolve(true);
                            };

                            image.onerror = () => {
                                console.log(
                                    `[${adapter}][${itemId}]: Image load error ${filename}`
                                );
                                resolve(false);
                            };
                        });

                        if (!isLoaded) {
                            continue;
                        }

                        console.log(
                            `[${adapter}][${itemId}]: Start analyze ${filename}`
                        );

                        const predictions = await this.$store.dispatch(
                            "analyzeImage",
                            image
                        );

                        console.log(
                            `[${adapter}][${itemId}]: Image ${filename} predictions: ${JSON.stringify(
                                predictions
                            )}`
                        );

                        await this.addPredictions(
                            predictions,
                            adapter,
                            itemId,
                            filename
                        );
                    }
                }
            }
        },
    },

    async beforeMount() {
        await this.$store.dispatch("loadModel");
    },

    async mounted() {
        await this.getAdapters();
        await this.getAdaptersFiles();
        await this.processFiles();
    },
};
