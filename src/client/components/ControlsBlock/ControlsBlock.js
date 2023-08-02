import axios from "axios";

export default {
    name: "ControlsBlock",

    props: {
        items: {
            type: Array,
            required: true,
        },

        adapter: {
            type: String,
            required: true,
        },
    },

    methods: {
        async deleteItems() {
            const { items, adapter } = this;

            if (!items.length) {
                console.log("No items for delete found!");
                return false;
            }

            console.log(`Delete items click: ${items.join(", ")}`);

            this.emitter.emit("triggerSpinner");

            for (const itemsId of items) {
                try {
                    const request = await axios(
                        `/adapters/${adapter}/${itemsId}`,
                        {
                            method: "DELETE",
                        }
                    );

                    console.log(request.data);
                } catch (error) {
                    console.log(error);
                }
            }

            this.emitter.emit("triggerSpinner");

            this.emitter.emit("updateItems");

            return true;
        },
    },
};
