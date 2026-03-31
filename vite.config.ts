import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";
import pkg from "./package.json";

const APP_VERSION = pkg.version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    vue(),
    {
      name: "inject-app-version",
      transformIndexHtml(html) {
        return html.replace(/%APP_VERSION%/g, APP_VERSION);
      },
    },
    viteStaticCopy({
      targets: [{ src: "data", dest: "." }],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
