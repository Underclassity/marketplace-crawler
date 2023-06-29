export default {
    name: "PaginationBlock",

    props: {
        count: {
            type: Number,
            default: 0,
        },
    },

    data() {
        return {
            page: 1,
            limit: 10,

            min: 1,
        };
    },

    computed: {
        offset() {
            return (this.page - 1) * this.limit;
        },

        max() {
            if (!this.count) {
                return this.min || 1;
            }

            const pages = this.count / this.limit;

            return pages == parseInt(pages, 10)
                ? parseInt(pages, 10)
                : parseInt(pages, 10) + 1;
        },

        isEnd() {
            return this.page === this.max;
        },

        isStart() {
            return this.page == this.min;
        },

        filterArray() {
            let { page, max, min } = this;

            if (page == min) {
                // console.log(`Page ${page} equal to min ${min}`);
                return [];
            }

            if (page == max) {
                // console.log(`Page ${page} equal to max ${max}`);
                return [];
            }

            if (page - min == 1 && page >= 2) {
                // console.log(`Page ${page} diff with min ${min} equal to 1`);
                return [0];
            }

            if (page - min <= 2 && page >= 2) {
                // console.log(`Page ${page} diff with min ${min} equal or less then 2`);
                return [-1, 0];
            }

            if (max - page == 1) {
                // console.log(`Page ${page} diff with max ${max} equal to 1`);
                return [0];
            }

            if (max - page <= 2) {
                // console.log(`Page ${page} diff with max ${max} equal or less then 2`);
                return [0, 1];
            }

            // console.log("Return default filtered array");

            return [-1, 0, 1];
        },
    },

    methods: {
        goToPage() {
            this.$router.push({
                path: this.$route.path,
                query: {
                    ...this.$route.query,
                    page: this.page,
                    limit: this.limit,
                },
            });
        },

        prevCall() {
            this.page--;

            if (this.page <= this.min) {
                this.page = this.min;
            }

            this.goToPage();
        },

        nextCall() {
            this.page += 1;

            if (this.page >= this.max) {
                this.page = this.max;
            }

            this.goToPage();
        },

        changePage(event) {
            let { target } = event;

            const page = parseInt(target.textContent, 10);

            this.page = page;

            this.goToPage();
        },

        goToStart() {
            this.page = this.min;

            this.goToPage();
        },

        goToEnd() {
            this.page = this.max;

            this.goToPage();
        },

        getRouterParams() {
            let { page, limit } = this.$route.query;

            this.page = page ? parseInt(page, 10) : 1;
            this.limit = limit ? parseInt(limit, 10) : 10;
        },
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
