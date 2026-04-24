import { useState } from "react";
import { Star, GitFork, ExternalLink, Clock, GitPullRequest } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PrSubmitDialog } from "@/components/PrSubmitDialog";
import { useAuthContext } from "@/contexts/AuthContext";
import { useClaimProject, useAbandonClaim, type ProjectWithClaim } from "@/hooks/useProjectClaims";
import { toast } from "sonner";

export type TabStatus = "available" | "claimed" | "pr_submitted" | "merged";

interface Props {
  project: ProjectWithClaim;
  tabStatus: TabStatus;
  onRequestLogin?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  agent: "Agent",
  framework: "Framework",
  chatbot: "Chatbot",
  rag: "RAG",
  tool: "Tool",
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

function truncateProjectName(name: string, maxLength = 20) {
  if (name.length <= maxLength) return name;
  return `${name.slice(0, maxLength)}...`;
}

export function ProjectRow({ project, tabStatus, onRequestLogin }: Props) {
  const { user } = useAuthContext();
  const claimProject = useClaimProject();
  const abandonClaim = useAbandonClaim();
  const [prDialogOpen, setPrDialogOpen] = useState(false);

  const isOwnClaim = user && project.claim?.user_id === user.id;

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

  const handleAbandon = async () => {
    if (!project.claim) return;
    try {
      await abandonClaim.mutateAsync(project.claim.id);
      toast.success("已放弃认领");
    } catch (e: any) {
      toast.error(`操作失败: ${e.message}`);
    }
  };

  const showContributor = tabStatus === "claimed" || tabStatus === "pr_submitted" || tabStatus === "merged";
  const showPr = tabStatus === "pr_submitted" || tabStatus === "merged";

  return (
    <>
      <TableRow className="group">
        <TableCell className="max-w-[200px]">
          <a
            href={project.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline truncate"
          >
            {truncateProjectName(project.full_name)}
            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        </TableCell>

        <TableCell className="max-w-[260px] text-muted-foreground text-sm truncate hidden lg:table-cell">
          {project.description || "—"}
        </TableCell>

        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            {formatCount(project.stars)}
          </span>
        </TableCell>

        <TableCell className="text-sm text-muted-foreground whitespace-nowrap hidden md:table-cell">
          <span className="inline-flex items-center gap-1">
            <GitFork className="h-3.5 w-3.5" />
            {formatCount(project.forks)}
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

        {showContributor && (
          <TableCell>
            {project.claim && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback>{project.claim.user_email[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                  {project.claim.user_email.split("@")[0]}
                </span>
              </div>
            )}
          </TableCell>
        )}

        {showPr && (
          <TableCell>
            {project.claim?.pr_url && (
              <a
                href={project.claim.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <GitPullRequest className="h-3.5 w-3.5" />
                #{project.claim.pr_number}
              </a>
            )}
          </TableCell>
        )}

        <TableCell>
          {tabStatus === "available" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleClaim}
              disabled={claimProject.isPending}
              className="text-xs h-7"
            >
              认领
            </Button>
          )}
          {tabStatus === "claimed" && isOwnClaim && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => setPrDialogOpen(true)}
                className="text-xs h-7"
              >
                提交 PR
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAbandon}
                disabled={abandonClaim.isPending}
                className="text-xs h-7 text-muted-foreground hover:text-destructive"
              >
                放弃
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>

      {project.claim && (
        <PrSubmitDialog
          open={prDialogOpen}
          onClose={() => setPrDialogOpen(false)}
          claimId={project.claim.id}
          projectName={project.full_name}
        />
      )}
    </>
  );
}
