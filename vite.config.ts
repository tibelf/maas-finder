import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import { marked } from "marked";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    {
      name: "serve-markdown-preview",
      configureServer(server: ViteDevServer) {
        server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const [requestPath, rawQuery = ""] = (req.url ?? "").split("?");
          if (!requestPath.endsWith(".md")) {
            next();
            return;
          }

          const filePath = path.join(process.cwd(), decodeURIComponent(requestPath.slice(1)));
          if (!fs.existsSync(filePath)) {
            next();
            return;
          }

          const markdown = fs.readFileSync(filePath, "utf8");
          const wantsRaw = new URLSearchParams(rawQuery).get("raw") === "1";
          if (wantsRaw) {
            res.setHeader("Content-Type", "text/markdown; charset=utf-8");
            res.end(markdown);
            return;
          }

          const htmlBody = marked.parse(markdown);
          const escapedTitle = path.basename(filePath).replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f8fafc; color: #0f172a; }
      .container { max-width: 920px; margin: 0 auto; padding: 32px 20px 56px; }
      article { background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
      h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.6em; line-height: 1.3; }
      p, li { line-height: 1.75; }
      code { background: #f1f5f9; padding: 0.15em 0.45em; border-radius: 6px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
      pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 10px; overflow-x: auto; }
      pre code { background: transparent; padding: 0; }
      img { max-width: 100%; height: auto; border-radius: 8px; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
      a { color: #2563eb; }
      blockquote { border-left: 4px solid #94a3b8; margin: 1em 0; padding: 0.25em 1em; color: #334155; background: #f8fafc; }
      @media (prefers-color-scheme: dark) {
        body { background: #020617; color: #e2e8f0; }
        article { background: #0f172a; box-shadow: none; }
        code { background: #1e293b; }
        th, td { border-color: #334155; }
        a { color: #60a5fa; }
        blockquote { color: #cbd5e1; background: #0b1220; border-left-color: #475569; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <article>${htmlBody}</article>
    </div>
  </body>
</html>`;

          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        });
      },
    },
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
