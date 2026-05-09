import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

marked.setOptions({ gfm: true, breaks: true });

export default function DocPage() {
  const { "*": filePath } = useParams();
  const navigate = useNavigate();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setError("未指定文档路径");
      return;
    }
    setHtml(null);
    setError(null);

    const base = filePath.replace(/\.(md|mdx)$/, "");
    fetch(`/docs/${base}.mdx`)
      .then((res) => {
        if (!res.ok) throw new Error(`文档未找到（HTTP ${res.status}）`);
        return res.text();
      })
      .then((md) => {
        const result = marked.parse(md);
        setHtml(typeof result === "string" ? result : String(result));
      })
      .catch((e) => setError(e.message));
  }, [filePath]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive">
            {error}
          </div>
        )}

        {!error && html === null && (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
          </div>
        )}

        {html !== null && (
          <article
            className="prose prose-slate max-w-none
              prose-headings:font-semibold prose-headings:tracking-tight
              prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:pb-2
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-muted prose-pre:border
              prose-img:rounded-lg prose-img:shadow-sm"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
