import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown } from "lucide-react";
import { ProjectRow, type TabStatus } from "@/components/ProjectCard";
import type { ProjectWithClaim } from "@/hooks/useProjectClaims";
import type { SortField } from "@/hooks/useGithubProjects";

interface Props {
  projects: ProjectWithClaim[];
  tabStatus: TabStatus;
  sortBy?: SortField;
  sortOrder?: "asc" | "desc";
  onSort?: (field: SortField) => void;
}

export function ProjectTable({ projects, tabStatus, sortBy, sortOrder, onSort }: Props) {
  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className={onSort ? "cursor-pointer select-none hover:text-foreground transition-colors" : ""}
      onClick={() => onSort?.(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortBy === field && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </TableHead>
  );

  const showContributor = tabStatus === "claimed" || tabStatus === "pr_submitted" || tabStatus === "merged";
  const showPr = tabStatus === "pr_submitted" || tabStatus === "merged";

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>项目</TableHead>
            <TableHead className="hidden lg:table-cell">描述</TableHead>
            <SortHeader field="stars">Stars</SortHeader>
            <TableHead className="hidden md:table-cell">Forks</TableHead>
            <TableHead className="hidden sm:table-cell">语言</TableHead>
            <TableHead className="hidden md:table-cell">分类</TableHead>
            <SortHeader field="updated_at">
              <span className="hidden lg:inline">更新</span>
            </SortHeader>
            {showContributor && <TableHead>认领者</TableHead>}
            {showPr && <TableHead>PR</TableHead>}
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} tabStatus={tabStatus} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
