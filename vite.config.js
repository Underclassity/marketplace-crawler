import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        visualizer({
            template: "treemap", // or sunburst
            open: true,
            gzipSize: true,
            brotliSize: true,
            filename: "analyse.html", // will be saved in project's root
        }),
    ],
});
