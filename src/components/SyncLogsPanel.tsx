import { useState } from "react";
import { useSyncJobList, type SyncJob } from "@/hooks/useSyncJob";
import { useSyncJobLogs, type RepoLogResult } from "@/hooks/useSyncJobLogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

const RESULT_LABELS: Record<string, { label: string; className: string }> = {
  accepted: { label: "入库", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "被拒", className: "bg-red-100 text-red-700" },
  skipped_existing: { label: "已存在", className: "bg-gray-100 text-gray-600" },
  skipped_qiniu: { label: "已含七牛", className: "bg-blue-100 text-blue-700" },
  skipped_archived: { label: "已归档", className: "bg-yellow-100 text-yellow-700" },
  error: { label: "错误", className: "bg-orange-100 text-orange-700" },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  init: "全量初始化",
  incremental: "增量同步",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已完成</Badge>;
  if (status === "running") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 animate-pulse">运行中</Badge>;
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">失败</Badge>;
}

const FILTER_OPTIONS: { value: RepoLogResult; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "accepted", label: "入库" },
  { value: "rejected", label: "被拒" },
  { value: "skipped_existing", label: "已存在" },
  { value: "skipped_qiniu", label: "已含七牛" },
  { value: "skipped_archived", label: "已归档" },
  { value: "error", label: "错误" },
];

function JobRepoLogs({ jobId }: { jobId: string }) {
  const [resultFilter, setResultFilter] = useState<RepoLogResult>("all");
  const { data: logs, isLoading, isFetchingMore, hasMore, fetchNextPage } = useSyncJobLogs(jobId, resultFilter);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setResultFilter(opt.value)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              resultFilter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : !logs?.length ? (
        <p className="text-sm text-muted-foreground py-4 text-center">暂无记录</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">仓库</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-16">Stars</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">语言</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">结果</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">命中品牌</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => {
                const resultInfo = RESULT_LABELS[log.result] ?? { label: log.result, className: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">
                      <a
                        href={`https://github.com/${log.repo_full_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline font-mono"
                      >
                        {log.repo_full_name}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      {log.search_query && (
                        <span className="text-muted-foreground text-[10px]">{log.search_query}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {log.stars.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{log.language ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${resultInfo.className}`}>
                        {resultInfo.label}
                        {log.reject_reason === "low_hits" && ` (${log.hit_count})`}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {log.distinct_brands.length > 0 ? (
                        <span className="text-muted-foreground">{log.distinct_brands.join(", ")}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">已加载 {logs.length} 条</span>
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={fetchNextPage}
                disabled={isFetchingMore}
              >
                {isFetchingMore ? "加载中..." : "加载更多"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">已全部加载</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({ job }: { job: SyncJob }) {
  const [expanded, setExpanded] = useState(false);

  const startedAt = new Date(job.started_at ?? job.created_at).toLocaleString("zh-CN");
  const duration = job.finished_at
    ? Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at ?? job.created_at).getTime()) / 1000)
    : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</span>
            <StatusBadge status={job.status} />
            <span className="text-xs text-muted-foreground">{startedAt}</span>
            {duration !== null && (
              <span className="text-xs text-muted-foreground">· 耗时 {duration}s</span>
            )}
            {job.time_window_since && (
              <span className="text-xs text-muted-foreground">· 时间窗口 {job.time_window_since} 起</span>
            )}
            {job.job_type === "init" && (
              <span className="text-xs text-muted-foreground">
                · Star 区间 {job.max_stars !== null ? `500~${job.max_stars}` : "500+"}
                {job.min_stars_seen !== null && ` (最低见到 ${job.min_stars_seen})`}
              </span>
            )}
          </div>
          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <span>扫描 {job.total_scanned}</span>
            <span className="text-emerald-600">入库 {job.total_inserted}</span>
            <span className="text-red-500">被拒 {job.total_rejected ?? 0}</span>
            <span>已存在 {job.total_skipped_existing ?? 0}</span>
            <span className="text-blue-600">已含七牛 {job.total_skipped_qiniu ?? 0}</span>
            {(job.total_errors ?? 0) > 0 && (
              <span className="text-orange-500">错误 {job.total_errors}</span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t">
          {/* Search queries */}
          {job.search_queries?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">搜索条件</p>
              <div className="flex flex-wrap gap-1">
                {job.search_queries.map((q, i) => (
                  <code key={i} className="text-[11px] bg-muted px-2 py-0.5 rounded font-mono">
                    {q}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Competitor list */}
          {job.competitor_list?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                竞品关键词（{job.competitor_list.length} 个，命中阈值 ≥{job.min_competitor_hits} 个品牌）
              </p>
              <div className="flex flex-wrap gap-1">
                {job.competitor_list.map((c, i) => (
                  <span key={i} className="text-[11px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Separator className="mt-4" />

          {/* Per-repo logs */}
          <JobRepoLogs jobId={job.id} />
        </div>
      )}
    </div>
  );
}

export function SyncLogsPanel() {
  const { data: jobs, isLoading } = useSyncJobList();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!jobs?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>暂无同步记录</p>
        <p className="text-xs mt-1">执行一次增量同步或全量初始化后将在此显示</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">共 {jobs.length} 条记录，点击展开查看详情</p>
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  );
}
