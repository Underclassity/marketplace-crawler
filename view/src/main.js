import axios from "axios";

import { createApp } from "vue";

import App from "./App.vue";
import router from "./router";
import store from "./store";

axios.defaults.baseURL = "http://localhost:3000/";

createApp(App).use(store).use(router).mount("#app");
