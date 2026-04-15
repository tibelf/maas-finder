import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ProjectFilters } from "@/hooks/useGithubProjects";

interface Props {
  filters: ProjectFilters;
  onChange: (filters: ProjectFilters) => void;
  languages: string[];
  categories: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  agent: "🤖 Agent",
  framework: "🏗️ Framework",
  chatbot: "💬 Chatbot",
  rag: "📚 RAG",
  tool: "🔧 Tool",
};



export function ProjectFiltersBar({ filters, onChange, languages, categories }: Props) {
  const toggleCategory = (cat: string) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onChange({ ...filters, categories: next });
  };

  const toggleLanguage = (lang: string) => {
    const next = filters.languages.includes(lang)
      ? filters.languages.filter((l) => l !== lang)
      : [...filters.languages, lang];
    onChange({ ...filters, languages: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目名或描述..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="pl-10"
          />
        </div>
      </div>

      {/* Category Tags */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant={filters.categories.includes(cat) ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => toggleCategory(cat)}
          >
            {CATEGORY_LABELS[cat] || cat}
          </Badge>
        ))}
      </div>
    </div>
  );
}
