import path from "node:path";

import { defineConfig } from "@vue/cli-service";
// import copyWebpackPlugin from "copy-webpack-plugin";

export default defineConfig({
    transpileDependencies: true,

    pages: {
        index: {
            entry: "view/src/main.js",
            template: "view/public/index.html",
        },
    },
    configureWebpack: {
        resolve: {
            alias: {
                "@": path.resolve("./view/src"),
            },
        },
    },
    // chainWebpack: (config) => {
    //     config.plugin("copy").use([
    //         [
    //             {
    //                 from: path.resolve("./view/public"),
    //                 to: path.resolve("./dist"),
    //                 toType: "dir",
    //                 ignore: [".DS_Store"],
    //             },
    //         ],
    //     ]);
    // },
});
