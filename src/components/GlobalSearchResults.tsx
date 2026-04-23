import { Star, GitFork, ExternalLink, Clock, GitPullRequest, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useClaimProject, type ProjectWithGlobalStatus } from "@/hooks/useProjectClaims";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  agent: "Agent",
  framework: "Framework",
  chatbot: "Chatbot",
  rag: "RAG",
  tool: "Tool",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  available: { label: "可认领", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  claimed: { label: "已认领", className: "bg-primary/10 text-primary border-primary/20" },
  pr_submitted: { label: "贡献中", className: "bg-sky-50 text-sky-700 border-sky-200" },
  merged: { label: "已完成", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "今天";
  if (diffDays < 30) return `${diffDays}天前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
  return `${Math.floor(diffDays / 365)}年前`;
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface GlobalSearchRowProps {
  project: ProjectWithGlobalStatus;
  onRequestLogin?: () => void;
}

function GlobalSearchRow({ project, onRequestLogin }: GlobalSearchRowProps) {
  const { user } = useAuthContext();
  const claimProject = useClaimProject();
  const statusCfg = STATUS_CONFIG[project.globalStatus] ?? STATUS_CONFIG.available;

  const handleClaim = async () => {
    if (!user) {
      onRequestLogin?.();
      return;
    }
    try {
      await claimProject.mutateAsync({ projectId: project.id, user });
      toast.success("认领成功！");
    } catch (e: any) {
      toast.error(`认领失败: ${e.message}`);
    }
  };

  return (
    <TableRow className="group">
      <TableCell className="max-w-[200px]">
        <a
          href={project.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline truncate"
        >
          {project.full_name}
          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </TableCell>

      <TableCell className="max-w-[240px] text-muted-foreground text-sm truncate hidden lg:table-cell">
        {project.description || "—"}
      </TableCell>

      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          {formatCount(project.stars)}
        </span>
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        {project.language && (
          <Badge variant="outline" className="text-xs">
            {project.language}
          </Badge>
        )}
      </TableCell>

      <TableCell className="hidden md:table-cell">
        {project.category && (
          <Badge variant="secondary" className="text-xs">
            {CATEGORY_LABELS[project.category] || project.category}
          </Badge>
        )}
      </TableCell>

      <TableCell className="text-sm text-muted-foreground whitespace-nowrap hidden lg:table-cell">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {formatDate(project.updated_at)}
        </span>
      </TableCell>

      <TableCell>
        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.className}`}>
          {statusCfg.label}
        </span>
      </TableCell>

      {project.globalStatus !== "available" && (
        <TableCell>
          <div className="flex items-center gap-2 min-w-0">
            {project.claim && (
              <>
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarFallback className="text-[10px]">{project.claim.user_email[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                  {project.claim.user_email.split("@")[0]}
                </span>
                {project.claim.pr_url && (
                  <a
                    href={project.claim.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline shrink-0"
                  >
                    <GitPullRequest className="h-3 w-3" />
                    #{project.claim.pr_number}
                  </a>
                )}
              </>
            )}
          </div>
        </TableCell>
      )}

      {project.globalStatus === "available" && (
        <TableCell>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClaim}
            disabled={claimProject.isPending}
            className="text-xs h-7"
          >
            认领
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

interface Props {
  results: ProjectWithGlobalStatus[];
  isLoading: boolean;
  search: string;
  onRequestLogin?: () => void;
}

export function GlobalSearchResults({ results, isLoading, search, onRequestLogin }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="text-center py-16 space-y-3">
        <Search className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-base font-medium">未找到匹配项目</p>
          <p className="text-sm text-muted-foreground mt-1">
            「{search}」在系统中尚无收录，可点击右上角「添加项目」手动添加
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        搜索「{search}」共找到 <span className="font-medium text-foreground">{results.length}</span> 个项目
      </p>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>项目</TableHead>
              <TableHead className="hidden lg:table-cell">描述</TableHead>
              <TableHead>Stars</TableHead>
              <TableHead className="hidden sm:table-cell">语言</TableHead>
              <TableHead className="hidden md:table-cell">分类</TableHead>
              <TableHead className="hidden lg:table-cell">更新</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>详情 / 操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((p) => (
              <GlobalSearchRow key={p.id} project={p} onRequestLogin={onRequestLogin} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
