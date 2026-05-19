var _a;
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
var basePath = (_a = process.env.VITE_BASE_PATH) !== null && _a !== void 0 ? _a : "/";
var base = basePath.endsWith("/") ? basePath : "".concat(basePath, "/");
var withBase = function (path) { return "".concat(base).concat(path.replace(/^\//, "")); };
export default defineConfig({
    base: base,
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/app-icon-192.png", "icons/app-icon-512.png"],
            manifest: {
                name: "Fauward Go",
                short_name: "FGo",
                description: "Field operations PWA for execution, sync, and proof-of-delivery workflows.",
                theme_color: "#161617",
                background_color: "#f4efe5",
                display: "standalone",
                start_url: base,
                scope: base,
                icons: [
                    {
                        src: withBase("icons/app-icon-192.png"),
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "any"
                    },
                    {
                        src: withBase("icons/app-icon-512.png"),
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any maskable"
                    }
                ]
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,webp}"],
                navigateFallback: withBase("index.html")
            }
        })
    ],
    server: {
        port: 5176
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url))
        }
    }
});
