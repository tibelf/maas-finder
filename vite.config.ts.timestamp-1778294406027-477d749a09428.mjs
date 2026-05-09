// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import fs from "fs";
import { marked } from "file:///home/project/node_modules/marked/lib/marked.esm.js";
import { componentTagger } from "file:///home/project/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/home/project";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false
    }
  },
  plugins: [
    {
      name: "serve-markdown-preview",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
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
      }
    },
    react(),
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIHR5cGUgVml0ZURldlNlcnZlciB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0LXN3Y1wiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCBmcyBmcm9tIFwiZnNcIjtcbmltcG9ydCB0eXBlIHsgSW5jb21pbmdNZXNzYWdlLCBTZXJ2ZXJSZXNwb25zZSB9IGZyb20gXCJodHRwXCI7XG5pbXBvcnQgeyBtYXJrZWQgfSBmcm9tIFwibWFya2VkXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6IFwiOjpcIixcbiAgICBwb3J0OiA4MDgwLFxuICAgIGhtcjoge1xuICAgICAgb3ZlcmxheTogZmFsc2UsXG4gICAgfSxcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHtcbiAgICAgIG5hbWU6IFwic2VydmUtbWFya2Rvd24tcHJldmlld1wiLFxuICAgICAgY29uZmlndXJlU2VydmVyKHNlcnZlcjogVml0ZURldlNlcnZlcikge1xuICAgICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKChyZXE6IEluY29taW5nTWVzc2FnZSwgcmVzOiBTZXJ2ZXJSZXNwb25zZSwgbmV4dDogKCkgPT4gdm9pZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IFtyZXF1ZXN0UGF0aCwgcmF3UXVlcnkgPSBcIlwiXSA9IChyZXEudXJsID8/IFwiXCIpLnNwbGl0KFwiP1wiKTtcbiAgICAgICAgICBpZiAoIXJlcXVlc3RQYXRoLmVuZHNXaXRoKFwiLm1kXCIpKSB7XG4gICAgICAgICAgICBuZXh0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgZGVjb2RlVVJJQ29tcG9uZW50KHJlcXVlc3RQYXRoLnNsaWNlKDEpKSk7XG4gICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGZpbGVQYXRoKSkge1xuICAgICAgICAgICAgbmV4dCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IG1hcmtkb3duID0gZnMucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCBcInV0ZjhcIik7XG4gICAgICAgICAgY29uc3Qgd2FudHNSYXcgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHJhd1F1ZXJ5KS5nZXQoXCJyYXdcIikgPT09IFwiMVwiO1xuICAgICAgICAgIGlmICh3YW50c1Jhdykge1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcihcIkNvbnRlbnQtVHlwZVwiLCBcInRleHQvbWFya2Rvd247IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgICAgICAgICByZXMuZW5kKG1hcmtkb3duKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBodG1sQm9keSA9IG1hcmtlZC5wYXJzZShtYXJrZG93bik7XG4gICAgICAgICAgY29uc3QgZXNjYXBlZFRpdGxlID0gcGF0aC5iYXNlbmFtZShmaWxlUGF0aCkucmVwbGFjZSgvPC9nLCBcIiZsdDtcIikucmVwbGFjZSgvPi9nLCBcIiZndDtcIik7XG4gICAgICAgICAgY29uc3QgaHRtbCA9IGA8IWRvY3R5cGUgaHRtbD5cbjxodG1sIGxhbmc9XCJ6aC1DTlwiPlxuICA8aGVhZD5cbiAgICA8bWV0YSBjaGFyc2V0PVwiVVRGLThcIiAvPlxuICAgIDxtZXRhIG5hbWU9XCJ2aWV3cG9ydFwiIGNvbnRlbnQ9XCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MS4wXCIgLz5cbiAgICA8dGl0bGU+JHtlc2NhcGVkVGl0bGV9PC90aXRsZT5cbiAgICA8c3R5bGU+XG4gICAgICA6cm9vdCB7IGNvbG9yLXNjaGVtZTogbGlnaHQgZGFyazsgfVxuICAgICAgYm9keSB7IG1hcmdpbjogMDsgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJTZWdvZSBVSVwiLCBcIlBpbmdGYW5nIFNDXCIsIFwiTWljcm9zb2Z0IFlhSGVpXCIsIHNhbnMtc2VyaWY7IGJhY2tncm91bmQ6ICNmOGZhZmM7IGNvbG9yOiAjMGYxNzJhOyB9XG4gICAgICAuY29udGFpbmVyIHsgbWF4LXdpZHRoOiA5MjBweDsgbWFyZ2luOiAwIGF1dG87IHBhZGRpbmc6IDMycHggMjBweCA1NnB4OyB9XG4gICAgICBhcnRpY2xlIHsgYmFja2dyb3VuZDogI2ZmZjsgYm9yZGVyLXJhZGl1czogMTJweDsgcGFkZGluZzogMjhweDsgYm94LXNoYWRvdzogMCA4cHggMjRweCByZ2JhKDE1LCAyMywgNDIsIDAuMDgpOyB9XG4gICAgICBoMSwgaDIsIGgzLCBoNCwgaDUsIGg2IHsgbWFyZ2luLXRvcDogMS41ZW07IG1hcmdpbi1ib3R0b206IDAuNmVtOyBsaW5lLWhlaWdodDogMS4zOyB9XG4gICAgICBwLCBsaSB7IGxpbmUtaGVpZ2h0OiAxLjc1OyB9XG4gICAgICBjb2RlIHsgYmFja2dyb3VuZDogI2YxZjVmOTsgcGFkZGluZzogMC4xNWVtIDAuNDVlbTsgYm9yZGVyLXJhZGl1czogNnB4OyBmb250LWZhbWlseTogXCJTRk1vbm8tUmVndWxhclwiLCBDb25zb2xhcywgXCJMaWJlcmF0aW9uIE1vbm9cIiwgTWVubG8sIG1vbm9zcGFjZTsgfVxuICAgICAgcHJlIHsgYmFja2dyb3VuZDogIzBmMTcyYTsgY29sb3I6ICNlMmU4ZjA7IHBhZGRpbmc6IDE0cHggMTZweDsgYm9yZGVyLXJhZGl1czogMTBweDsgb3ZlcmZsb3cteDogYXV0bzsgfVxuICAgICAgcHJlIGNvZGUgeyBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDsgcGFkZGluZzogMDsgfVxuICAgICAgaW1nIHsgbWF4LXdpZHRoOiAxMDAlOyBoZWlnaHQ6IGF1dG87IGJvcmRlci1yYWRpdXM6IDhweDsgfVxuICAgICAgdGFibGUgeyBib3JkZXItY29sbGFwc2U6IGNvbGxhcHNlOyB3aWR0aDogMTAwJTsgbWFyZ2luOiAxcmVtIDA7IH1cbiAgICAgIHRoLCB0ZCB7IGJvcmRlcjogMXB4IHNvbGlkICNjYmQ1ZTE7IHBhZGRpbmc6IDhweCAxMHB4OyB0ZXh0LWFsaWduOiBsZWZ0OyB9XG4gICAgICBhIHsgY29sb3I6ICMyNTYzZWI7IH1cbiAgICAgIGJsb2NrcXVvdGUgeyBib3JkZXItbGVmdDogNHB4IHNvbGlkICM5NGEzYjg7IG1hcmdpbjogMWVtIDA7IHBhZGRpbmc6IDAuMjVlbSAxZW07IGNvbG9yOiAjMzM0MTU1OyBiYWNrZ3JvdW5kOiAjZjhmYWZjOyB9XG4gICAgICBAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKSB7XG4gICAgICAgIGJvZHkgeyBiYWNrZ3JvdW5kOiAjMDIwNjE3OyBjb2xvcjogI2UyZThmMDsgfVxuICAgICAgICBhcnRpY2xlIHsgYmFja2dyb3VuZDogIzBmMTcyYTsgYm94LXNoYWRvdzogbm9uZTsgfVxuICAgICAgICBjb2RlIHsgYmFja2dyb3VuZDogIzFlMjkzYjsgfVxuICAgICAgICB0aCwgdGQgeyBib3JkZXItY29sb3I6ICMzMzQxNTU7IH1cbiAgICAgICAgYSB7IGNvbG9yOiAjNjBhNWZhOyB9XG4gICAgICAgIGJsb2NrcXVvdGUgeyBjb2xvcjogI2NiZDVlMTsgYmFja2dyb3VuZDogIzBiMTIyMDsgYm9yZGVyLWxlZnQtY29sb3I6ICM0NzU1Njk7IH1cbiAgICAgIH1cbiAgICA8L3N0eWxlPlxuICA8L2hlYWQ+XG4gIDxib2R5PlxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cbiAgICAgIDxhcnRpY2xlPiR7aHRtbEJvZHl9PC9hcnRpY2xlPlxuICAgIDwvZGl2PlxuICA8L2JvZHk+XG48L2h0bWw+YDtcblxuICAgICAgICAgIHJlcy5zZXRIZWFkZXIoXCJDb250ZW50LVR5cGVcIiwgXCJ0ZXh0L2h0bWw7IGNoYXJzZXQ9dXRmLThcIik7XG4gICAgICAgICAgcmVzLmVuZChodG1sKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcmVhY3QoKSxcbiAgICBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCksXG4gIF0uZmlsdGVyKEJvb2xlYW4pLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgIH0sXG4gICAgZGVkdXBlOiBbXCJyZWFjdFwiLCBcInJlYWN0LWRvbVwiLCBcInJlYWN0L2pzeC1ydW50aW1lXCIsIFwicmVhY3QvanN4LWRldi1ydW50aW1lXCIsIFwiQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5XCIsIFwiQHRhbnN0YWNrL3F1ZXJ5LWNvcmVcIl0sXG4gIH0sXG59KSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlOLFNBQVMsb0JBQXdDO0FBQzFRLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsT0FBTyxRQUFRO0FBRWYsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBTmhDLElBQU0sbUNBQW1DO0FBU3pDLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxPQUFPO0FBQUEsRUFDekMsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sS0FBSztBQUFBLE1BQ0gsU0FBUztBQUFBLElBQ1g7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUDtBQUFBLE1BQ0UsTUFBTTtBQUFBLE1BQ04sZ0JBQWdCLFFBQXVCO0FBQ3JDLGVBQU8sWUFBWSxJQUFJLENBQUMsS0FBc0IsS0FBcUIsU0FBcUI7QUFDdEYsZ0JBQU0sQ0FBQyxhQUFhLFdBQVcsRUFBRSxLQUFLLElBQUksT0FBTyxJQUFJLE1BQU0sR0FBRztBQUM5RCxjQUFJLENBQUMsWUFBWSxTQUFTLEtBQUssR0FBRztBQUNoQyxpQkFBSztBQUNMO0FBQUEsVUFDRjtBQUVBLGdCQUFNLFdBQVcsS0FBSyxLQUFLLFFBQVEsSUFBSSxHQUFHLG1CQUFtQixZQUFZLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDbEYsY0FBSSxDQUFDLEdBQUcsV0FBVyxRQUFRLEdBQUc7QUFDNUIsaUJBQUs7QUFDTDtBQUFBLFVBQ0Y7QUFFQSxnQkFBTSxXQUFXLEdBQUcsYUFBYSxVQUFVLE1BQU07QUFDakQsZ0JBQU0sV0FBVyxJQUFJLGdCQUFnQixRQUFRLEVBQUUsSUFBSSxLQUFLLE1BQU07QUFDOUQsY0FBSSxVQUFVO0FBQ1osZ0JBQUksVUFBVSxnQkFBZ0IsOEJBQThCO0FBQzVELGdCQUFJLElBQUksUUFBUTtBQUNoQjtBQUFBLFVBQ0Y7QUFFQSxnQkFBTSxXQUFXLE9BQU8sTUFBTSxRQUFRO0FBQ3RDLGdCQUFNLGVBQWUsS0FBSyxTQUFTLFFBQVEsRUFBRSxRQUFRLE1BQU0sTUFBTSxFQUFFLFFBQVEsTUFBTSxNQUFNO0FBQ3ZGLGdCQUFNLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBS1YsWUFBWTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQTRCUixRQUFRO0FBQUE7QUFBQTtBQUFBO0FBS2YsY0FBSSxVQUFVLGdCQUFnQiwwQkFBMEI7QUFDeEQsY0FBSSxJQUFJLElBQUk7QUFBQSxRQUNkLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sU0FBUyxpQkFBaUIsZ0JBQWdCO0FBQUEsRUFDNUMsRUFBRSxPQUFPLE9BQU87QUFBQSxFQUNoQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsSUFDdEM7QUFBQSxJQUNBLFFBQVEsQ0FBQyxTQUFTLGFBQWEscUJBQXFCLHlCQUF5Qix5QkFBeUIsc0JBQXNCO0FBQUEsRUFDOUg7QUFDRixFQUFFOyIsCiAgIm5hbWVzIjogW10KfQo=
