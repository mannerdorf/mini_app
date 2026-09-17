import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync } from "fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const builtAt = new Date().toISOString();
let commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
const buildInfo = { id: `${commit}-${randomUUID().slice(0, 8)}`, commit, builtAt };
function buildIdentity() {
  return { name: "build-identity", generateBundle() {
    this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify(buildInfo) });
  } };
}

// В dev: /admin и /cms отдают index.html (постоянная ссылка на админку)
function adminRewrite() {
  return {
    name: "admin-rewrite",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const p = req.url?.split("?")[0] || "";
        if (p === "/admin" || p === "/cms" || p.startsWith("/admin/") || p.startsWith("/cms/")) {
          req.url = "/";
        } else if (
          p === "/wildberries" ||
          p.startsWith("/wildberries/") ||
          p === "/red-returns" ||
          p.startsWith("/red-returns/")
        ) {
          req.url = "/";
        } else if (
          p === "/kalkulyator" ||
          p === "/faq" ||
          p === "/sklady" ||
          p === "/o-kompanii" ||
          p === "/about" ||
          p === "/app" ||
          p === "/login" ||
          p === "/forgot" ||
          p === "/blog" ||
          p.startsWith("/blog/") ||
          p === "/perevozka-moskva-kaliningrad" ||
          p === "/perevozka-kaliningrad-moskva"
        ) {
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
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_BUILD_INFO": JSON.stringify(buildInfo),
  },
  plugins: [react(), buildIdentity(), ...(useSingleFilePlugin() ? [viteSingleFile()] : []), adminRewrite()],
  server: {
    // Guest/CMS fetch('/api/...') same-origin → local API (api:dev on :3000)
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // В Docker/CI gzip-отчёт по каждому чанку заметно замедляет финальный этап сборки.
    reportCompressedSize: !process.env.CI,
    manifest: true,
    // Без singlefile — разумный лимит инлайна мелких ассетов
    assetsInlineLimit: useSingleFilePlugin() ? 100000000 : 4096,
    cssCodeSplit: !useSingleFilePlugin(),
    // Прод source map включаем только флагом для точечной отладки:
    // VITE_PROD_SOURCEMAP=1 npm run build
    sourcemap: command === "serve" || process.env.VITE_PROD_SOURCEMAP === "1",
    rollupOptions: {
      output: useSingleFilePlugin()
        ? {}
        : {
            manualChunks(id) {
              if (!id.includes("node_modules")) return;
              if (/node_modules\/(react|react-dom|scheduler|react-is|clsx)\//.test(id)) return "react-vendor";
              if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
              if (id.includes("recharts")) return "recharts";
              if (id.includes("lucide-react")) return "lucide";
              if (id.includes("pdfjs-dist")) return "pdfjs";
              if (id.includes("exceljs")) return "exceljs";
              if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("html2pdf")) return "pdf-tools";
              if (id.includes("date-fns")) return "date-fns";
            },
          },
    },
  },
}));
