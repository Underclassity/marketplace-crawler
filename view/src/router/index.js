import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";

const routes = [
    {
        path: "/",
        name: "Home",
        component: HomeView,
    },

    {
        path: "/adapters",
        name: "Adapters",
        component: () =>
            import(
                /* webpackChunkName: "adapters" */ "../views/AdaptersView/AdaptersView.vue"
            ),
    },

    {
        path: "/adapter/:id",
        name: "AdapterView",
        component: () =>
            import(
                /* webpackChunkName: "adapters" */ "../views/AdapterView/AdapterView.vue"
            ),
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;
