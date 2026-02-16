import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { viteSingleFile } from "vite-plugin-singlefile";

// В dev: /admin и /cms отдают index.html (постоянная ссылка на админку)
function adminRewrite() {
  return {
    name: "admin-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = req.url?.split("?")[0] || "";
        if (p === "/admin" || p === "/cms" || p.startsWith("/admin/") || p.startsWith("/cms/")) {
          req.url = "/";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), viteSingleFile(), adminRewrite()],
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    sourcemap: true,
  },
});
