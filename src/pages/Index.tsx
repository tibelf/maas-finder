import { KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectStats, type ProjectFilters } from "@/hooks/useGithubProjects";
import { useProjectsWithClaims, useClaimCounts, useGlobalSearch, PROJECTS_PAGE_SIZE } from "@/hooks/useProjectClaims";
import { useActiveInitJob, useStartInitJob } from "@/hooks/useSyncJob";
import { ProjectTable } from "@/components/ProjectTable";
import { ProjectFiltersBar } from "@/components/ProjectFiltersBar";
import { AuthDialog } from "@/components/AuthDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RefreshCw, Database, ChartBar as BarChart3, LogOut, CirclePlus as PlusCircle, GitPullRequest, Play, ScrollText, ExternalLink } from "lucide-react";
import { GlobalSearchResults } from "@/components/GlobalSearchResults";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TabStatus } from "@/components/ProjectCard";
import { AddProjectDialog } from "@/components/AddProjectDialog";
import { Input } from "@/components/ui/input";

function clampPage(page: number, totalPages: number) {
  if (totalPages <= 0) return 1;
  return Math.min(Math.max(page, 1), totalPages);
}

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuthContext();
  const isAdmin = user?.email === "zhulang@qiniu.com";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabStatus>("available");
  const [tabPages, setTabPages] = useState<Record<TabStatus, number>>({
    available: 1,
    claimed: 1,
    pr_submitted: 1,
    merged: 1,
  });
  const [tabPageInputs, setTabPageInputs] = useState<Record<TabStatus, string>>({
    available: "1",
    claimed: "1",
    pr_submitted: "1",
    merged: "1",
  });
  const [filters, setFilters] = useState<ProjectFilters>({
    search: "",
    languages: [],
    categories: [],
    sortBy: "stars",
    sortOrder: "desc",
  });
  const [syncing, setSyncing] = useState(false);
  const [checkingPrs, setCheckingPrs] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  const { data: initJob } = useActiveInitJob();
  const startInitJob = useStartInitJob();

  const { data: stats } = useProjectStats();
  const { data: claimCounts } = useClaimCounts();

  const {
    data: availableData,
    isLoading: availableLoading,
    error: availableError,
    refetch: refetchAvailable,
  } = useProjectsWithClaims("available", {
    page: tabPages.available,
    pageSize: PROJECTS_PAGE_SIZE,
    search: filters.search,
    languages: filters.languages,
    categories: filters.categories,
  });
  const { data: claimedData, isLoading: claimedLoading } = useProjectsWithClaims("claimed", {
    page: tabPages.claimed,
    pageSize: PROJECTS_PAGE_SIZE,
  });
  const { data: prData, isLoading: prLoading } = useProjectsWithClaims("pr_submitted", {
    page: tabPages.pr_submitted,
    pageSize: PROJECTS_PAGE_SIZE,
  });
  const { data: mergedData, isLoading: mergedLoading } = useProjectsWithClaims("merged", {
    page: tabPages.merged,
    pageSize: PROJECTS_PAGE_SIZE,
  });

  const availableProjects = availableData?.items ?? [];
  const claimedProjects = claimedData?.items ?? [];
  const prProjects = prData?.items ?? [];
  const mergedProjects = mergedData?.items ?? [];

  const isSearching = filters.search.trim().length > 0;
  const { data: globalSearchResults, isLoading: globalSearchLoading } = useGlobalSearch(filters.search);

  useEffect(() => {
    setTabPages((prev) => ({ ...prev, available: 1 }));
    setTabPageInputs((prev) => ({ ...prev, available: "1" }));
  }, [filters.search, filters.languages, filters.categories]);

  const updateTabPage = (tab: TabStatus, page: number) => {
    setTabPages((prev) => ({ ...prev, [tab]: page }));
    setTabPageInputs((prev) => ({ ...prev, [tab]: String(page) }));
  };

  const normalizeTabPage = (tab: TabStatus, totalPages: number) => {
    const next = clampPage(tabPages[tab], totalPages);
    if (next !== tabPages[tab]) {
      updateTabPage(tab, next);
    }
  };

  useEffect(() => {
    if (!availableData) return;
    normalizeTabPage("available", availableData.totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableData]);

  useEffect(() => {
    if (!claimedData) return;
    normalizeTabPage("claimed", claimedData.totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimedData]);

  useEffect(() => {
    if (!prData) return;
    normalizeTabPage("pr_submitted", prData.totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prData]);

  useEffect(() => {
    if (!mergedData) return;
    normalizeTabPage("merged", mergedData.totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedData]);

  const renderPagination = (tab: TabStatus, total: number, totalPages: number, isLoading: boolean) => {
    if (isLoading || total === 0 || totalPages <= 1) return null;

    const current = tabPages[tab];
    const inputValue = tabPageInputs[tab];
    const gotoPage = (targetPage: number) => {
      updateTabPage(tab, clampPage(targetPage, totalPages));
    };

    const handleJump = () => {
      const parsed = Number.parseInt(inputValue, 10);
      if (Number.isNaN(parsed)) {
        setTabPageInputs((prev) => ({ ...prev, [tab]: String(current) }));
        return;
      }
      gotoPage(parsed);
    };

    const handlePageInputBlur = () => {
      const parsed = Number.parseInt(inputValue, 10);
      if (Number.isNaN(parsed)) {
        setTabPageInputs((prev) => ({ ...prev, [tab]: String(current) }));
        return;
      }
      setTabPageInputs((prev) => ({ ...prev, [tab]: String(clampPage(parsed, totalPages)) }));
    };

    const handlePageInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        handleJump();
      }
    };

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <p className="text-sm text-muted-foreground">
          共 {total} 条，第 {current} / {totalPages} 页，每页 {PROJECTS_PAGE_SIZE} 条
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => gotoPage(1)} disabled={current === 1}>
            首页
          </Button>
          <Button variant="outline" size="sm" onClick={() => gotoPage(current - 1)} disabled={current === 1}>
            上一页
          </Button>
          <Button variant="outline" size="sm" onClick={() => gotoPage(current + 1)} disabled={current === totalPages}>
            下一页
          </Button>
          <Button variant="outline" size="sm" onClick={() => gotoPage(totalPages)} disabled={current === totalPages}>
            尾页
          </Button>
          <Input
            value={inputValue}
            onChange={(event) => setTabPageInputs((prev) => ({ ...prev, [tab]: event.target.value }))}
            onBlur={handlePageInputBlur}
            onKeyDown={handlePageInputKeyDown}
            className="h-8 w-20"
            inputMode="numeric"
            aria-label={`${tab} 跳转页码`}
          />
          <Button variant="secondary" size="sm" onClick={handleJump}>
            跳转
          </Button>
        </div>
      </div>
    );
  };

  const handleCheckPrs = async () => {
    setCheckingPrs(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-pr-status", {
        method: "POST",
      });
      if (error) throw error;
      toast.success(
        `检查完成！共检查 ${data.checked} 个 PR，已完成 ${data.completed ?? data.merged} 个（merged: ${data.merged ?? 0}, closed: ${data.closed ?? 0}）`
      );
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
      refetchAvailable();
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

  const initRunning = initJob?.status === "running";
  const initDone = initJob?.status === "completed";

  return (
    <div className="min-h-screen bg-background">
      <AuthDialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
      <AddProjectDialog open={addProjectOpen} onClose={() => setAddProjectOpen(false)} />
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                <span className="text-primary">MFinder</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">发现可集成 MaaS 服务的热门开源项目</p>
            </div>
            <div className="flex items-center gap-3">
              {!authLoading && (
                user ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback>{user.displayName[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium hidden sm:inline">{user.displayName}</span>
                    <Button variant="ghost" size="sm" onClick={signOut} className="h-7 w-7 p-0">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setAuthDialogOpen(true)}>
                    登录 / 注册
                  </Button>
                )
              )}
              {user && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddProjectOpen(true)}>
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">添加项目</span>
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button onClick={() => navigate("/admin/sync-logs")} variant="outline" size="sm" className="gap-2">
                    <ScrollText className="h-4 w-4" />
                    <span className="hidden sm:inline">同步日志</span>
                  </Button>
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
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <div className="rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30 px-4 py-3 flex items-center gap-3 text-sm">
          <GitPullRequest className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="text-sky-800 dark:text-sky-200">
            想为项目贡献 MaaS 集成代码？使用{" "}
            <a
              href="https://github.com/AI-Hub-Growth/skillhub/tree/main/add-qiniu-maas"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-300"
            >
              add-qiniu-maas 技能
              <ExternalLink className="h-3 w-3" />
            </a>{" "}
            快速生成可提交代码。
          </span>
        </div>

        {stats && stats.total > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">收录项目</p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-sky-500" />
              <div>
                <p className="text-2xl font-bold">{stats.languages.length}</p>
                <p className="text-xs text-muted-foreground">编程语言</p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
              <Database className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{stats.categories.length}</p>
                <p className="text-xs text-muted-foreground">项目分类</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <ProjectFiltersBar
            filters={filters}
            onChange={setFilters}
            languages={stats?.languages || []}
            categories={stats?.categories || []}
          />

          {isSearching ? (
            <GlobalSearchResults
              results={globalSearchResults ?? []}
              isLoading={globalSearchLoading}
              search={filters.search}
              onRequestLogin={() => setAuthDialogOpen(true)}
            />
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)}>
              <TabsList className="grid w-full grid-cols-4 max-w-lg">
                <TabsTrigger value="available">可认领</TabsTrigger>
                <TabsTrigger value="claimed">
                  已认领
                  {(claimCounts?.claimed ?? 0) > 0 && (
                    <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                      {claimCounts!.claimed}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pr_submitted">
                  贡献中
                  {(claimCounts?.pr_submitted ?? 0) > 0 && (
                    <span className="ml-1.5 text-xs bg-sky-500/10 text-sky-600 rounded-full px-1.5 py-0.5">
                      {claimCounts!.pr_submitted}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="merged">
                  已完成
                  {(claimCounts?.merged ?? 0) > 0 && (
                    <span className="ml-1.5 text-xs bg-emerald-500/10 text-emerald-600 rounded-full px-1.5 py-0.5">
                      {claimCounts!.merged}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="available" className="space-y-4 mt-4">
                {availableLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : availableError ? (
                  <div className="text-center py-12">
                    <p className="text-destructive">加载失败: {(availableError as Error).message}</p>
                    <Button variant="outline" onClick={() => refetchAvailable()} className="mt-4">重试</Button>
                  </div>
                ) : !availableProjects?.length ? (
                  <div className="text-center py-16 space-y-4">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <div>
                      <p className="text-lg font-medium">暂无数据</p>
                      <p className="text-sm text-muted-foreground mt-1">点击右上角「同步数据」按钮从 GitHub 抓取项目</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">当前页 {availableProjects.length} 个项目</p>
                    <ProjectTable projects={availableProjects} tabStatus="available" onRequestLogin={() => setAuthDialogOpen(true)} />
                    {renderPagination("available", availableData?.total ?? 0, availableData?.totalPages ?? 0, availableLoading)}
                  </>
                )}
              </TabsContent>

              <TabsContent value="claimed" className="mt-4">
                {claimedLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : !claimedProjects?.length ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p>暂无认领中的项目</p>
                  </div>
                ) : (
                  <>
                    <ProjectTable projects={claimedProjects} tabStatus="claimed" />
                    {renderPagination("claimed", claimedData?.total ?? 0, claimedData?.totalPages ?? 0, claimedLoading)}
                  </>
                )}
              </TabsContent>

              <TabsContent value="pr_submitted" className="mt-4">
                {prLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : !prProjects?.length ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p>暂无贡献中的项目</p>
                  </div>
                ) : (
                  <>
                    <ProjectTable projects={prProjects} tabStatus="pr_submitted" />
                    {renderPagination("pr_submitted", prData?.total ?? 0, prData?.totalPages ?? 0, prLoading)}
                  </>
                )}
              </TabsContent>

              <TabsContent value="merged" className="mt-4">
                {mergedLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : !mergedProjects?.length ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p>暂无已完成的项目</p>
                  </div>
                ) : (
                  <>
                    <ProjectTable projects={mergedProjects} tabStatus="merged" />
                    {renderPagination("merged", mergedData?.total ?? 0, mergedData?.totalPages ?? 0, mergedLoading)}
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
