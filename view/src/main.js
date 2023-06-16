import axios from "axios";

import LazyLoad from "lazy-load-vue3";

import { createApp } from "vue";

import App from "./App.vue";
import router from "./router";
import store from "./store";

axios.defaults.baseURL = "http://localhost:3000/";

createApp(App)
    .use(store)
    .use(router)
    .use(LazyLoad)
    .mount("#app");
