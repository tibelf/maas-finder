import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveInitJob, useStartInitJob, calcInitProgress } from "@/hooks/useSyncJob";
import { SyncLogsPanel } from "@/components/SyncLogsPanel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, GitPullRequest, Play, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";

const SyncLogs = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const isAdmin = user?.email === "zhulang@qiniu.com";
  const qc = useQueryClient();

  const [syncing, setSyncing] = useState(false);
  const [checkingPrs, setCheckingPrs] = useState(false);

  const { data: initJob } = useActiveInitJob();
  const startInitJob = useStartInitJob();

  const initProgress = initJob ? calcInitProgress(initJob) : 0;
  const initRunning = initJob?.status === "running";
  const initDone = initJob?.status === "completed";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">无访问权限</p>
          <Button variant="outline" onClick={() => navigate("/")}>返回首页</Button>
        </div>
      </div>
    );
  }

  const handleCheckPrs = async () => {
    setCheckingPrs(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-pr-status", {
        method: "POST",
      });
      if (error) throw error;
      toast.success(`检查完成！共检查 ${data.checked} 个 PR，${data.merged} 个已合并`);
      qc.invalidateQueries({ queryKey: ["projects-with-claims"] });
      qc.invalidateQueries({ queryKey: ["project-claims"] });
      qc.invalidateQueries({ queryKey: ["claim-counts"] });
    } catch (e: any) {
      toast.error(`检查失败: ${e.message}`);
    } finally {
      setCheckingPrs(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-github-projects", {
        method: "POST",
      });
      if (error) throw error;
      toast.success(`增量同步完成！发现 ${data.total_found} 个候选，新增 ${data.inserted} 个`);
    } catch (e: any) {
      toast.error(`同步失败: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleStartInit = async () => {
    if (initJob?.status === "running") return;
    try {
      await startInitJob.mutateAsync();
      toast.success("全量初始化已启动，将在后台自动完成（约 3-4 小时）");
    } catch (e: any) {
      toast.error(`启动失败: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 -ml-2">
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
              <div className="h-4 w-px bg-border" />
              <div>
                <h1 className="text-lg font-semibold">同步日志</h1>
                <p className="text-xs text-muted-foreground">Admin 管理后台</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleCheckPrs} disabled={checkingPrs} variant="outline" size="sm" className="gap-2">
                <GitPullRequest className={`h-4 w-4 ${checkingPrs ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{checkingPrs ? "检查中..." : "检查 PR"}</span>
              </Button>
              <Button
                onClick={handleStartInit}
                disabled={initRunning || startInitJob.isPending}
                variant="outline"
                size="sm"
                className="gap-2"
                title={initDone ? `已完成，共入库 ${initJob?.total_inserted ?? 0} 个项目` : "全量初始化（约 3-4 小时）"}
              >
                <Play className={`h-4 w-4 ${initRunning ? "animate-pulse" : ""}`} />
                <span className="hidden sm:inline">
                  {initDone ? "已初始化" : initRunning ? "初始化中..." : "全量初始化"}
                </span>
              </Button>
              <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncing ? "同步中..." : "增量同步"}</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {initJob && (initRunning || initDone) && (
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {initRunning ? "全量初始化进行中..." : "全量初始化已完成"}
              </span>
              <span className="text-muted-foreground">
                已扫描 {initJob.total_scanned} 个 · 入库 {initJob.total_inserted} 个
                {initRunning && ` · 第 ${initJob.current_query_index + 1}/12 组查询，第 ${initJob.current_page} 页`}
              </span>
            </div>
            <Progress value={initProgress} className="h-2" />
            {initDone && (
              <p className="text-xs text-muted-foreground">
                完成时间: {new Date(initJob.finished_at!).toLocaleString("zh-CN")}
              </p>
            )}
          </div>
        )}

        <SyncLogsPanel />
      </main>
    </div>
  );
};

export default SyncLogs;
