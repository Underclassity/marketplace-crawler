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
        path: "/users",
        name: "Users",
        component: () =>
            import(
                /* webpackChunkName: "adapters" */ "../views/UsersView/UsersView.vue"
            ),
    },

    {
        path: "/users/:id",
        name: "UsersView",
        component: () =>
            import(
                /* webpackChunkName: "adapters" */ "../views/UserView/UserView.vue"
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

    {
        path: "/adapter/:id/:itemId",
        name: "ItemView",
        component: () =>
            import(
                /* webpackChunkName: "adapters" */ "../views/ItemView/ItemView.vue"
            ),
    },

    {
        path: "/analyze",
        name: "AnalyzeView",
        component: () =>
            import(
                /* webpackChunkName: "adapters" */ "../views/AnalyzeView/AnalyzeView.vue"
            ),
    },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
    scrollBehavior() {
        window.scrollTo(0, 0);
    },
});

export default router;
