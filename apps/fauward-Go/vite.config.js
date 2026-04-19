import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/app-icon.svg"],
            manifest: {
                name: "Fauward Go",
                short_name: "FGo",
                description: "Field operations PWA for execution, sync, and proof-of-delivery workflows.",
                theme_color: "#161617",
                background_color: "#f4efe5",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "/icons/app-icon.svg",
                        sizes: "any",
                        type: "image/svg+xml",
                        purpose: "any maskable"
                    }
                ]
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,webp}"],
                navigateFallback: "/offline.html"
            }
        })
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url))
        }
    }
});
