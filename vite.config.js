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

/** Один index.html со всем кодом — только если явно VITE_SINGLEFILE=1 (старые сценарии деплоя). */
function useSingleFilePlugin() {
  return process.env.VITE_SINGLEFILE === "1";
}

export default defineConfig(({ command }) => ({
  plugins: [react(), ...(useSingleFilePlugin() ? [viteSingleFile()] : []), adminRewrite()],
  build: {
    // Без singlefile — разумный лимит инлайна мелких ассетов
    assetsInlineLimit: useSingleFilePlugin() ? 100000000 : 4096,
    cssCodeSplit: !useSingleFilePlugin(),
    sourcemap: command === "serve",
    rollupOptions: {
      output: useSingleFilePlugin()
        ? {}
        : {
            manualChunks(id) {
              if (!id.includes("node_modules")) return;
              if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
              if (id.includes("recharts")) return "recharts";
              if (id.includes("lucide-react")) return "lucide";
              if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("html2pdf")) return "pdf";
              if (id.includes("date-fns")) return "date-fns";
            },
          },
    },
  },
}));
