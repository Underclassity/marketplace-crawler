import axios from "axios";
import mitt from "mitt";

import LazyLoad from "lazy-load-vue3";

import "viewerjs/dist/viewer.css";
import VueViewer from "v-viewer";

import { createApp } from "vue";

import App from "./App.vue";
import router from "./router";
import store from "./store";

const app = createApp(App).use(store).use(router).use(VueViewer).use(LazyLoad);

const emitter = mitt();

app.config.globalProperties.emitter = emitter;

// save emitter link for testing
document.emitter = emitter;

axios.defaults.baseURL = "http://localhost:3000/";

app.mount("#app");
