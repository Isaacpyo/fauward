var config = {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                canvas: "#f7f9fc",
                ink: "#0d1f3c",
                brand: {
                    DEFAULT: "#0d1f3c",
                    deep: "#08162d",
                    soft: "#e8eef9",
                },
                signal: {
                    info: "#1d77e8",
                    success: "#0c8d68",
                    warn: "#b36a00",
                    danger: "#c43d4b",
                },
            },
            fontFamily: {
                sans: ["IBM Plex Sans", "sans-serif"],
                display: ["Sora", "sans-serif"],
            },
            boxShadow: {
                panel: "0 24px 70px rgba(13, 31, 60, 0.1)",
            },
            backgroundImage: {
                "field-grid": "linear-gradient(to right, rgba(13, 31, 60, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(13, 31, 60, 0.05) 1px, transparent 1px)",
            },
        },
    },
    plugins: [],
};
export default config;
