import { useState } from "react";
import { useProjectStats, type ProjectFilters } from "@/hooks/useGithubProjects";
import { useProjectsWithClaims, useClaimCounts, type ProjectWithClaim } from "@/hooks/useProjectClaims";
import { ProjectTable } from "@/components/ProjectTable";
import { ProjectFiltersBar } from "@/components/ProjectFiltersBar";
import { AuthDialog } from "@/components/AuthDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RefreshCw, Database, ChartBar as BarChart3, LogOut, CirclePlus as PlusCircle, GitPullRequest } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TabStatus } from "@/components/ProjectCard";
import { AddProjectDialog } from "@/components/AddProjectDialog";

const Index = () => {
  const { user, loading: authLoading, signOut } = useAuthContext();
  const isAdmin = user?.email === "zhulang@qiniu.com";
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabStatus>("available");
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

  const { data: stats } = useProjectStats();
  const { data: claimCounts } = useClaimCounts();

  const { data: allAvailableProjects, isLoading: availableLoading, error: availableError, refetch: refetchAvailable } = useProjectsWithClaims("available");

  const availableProjects = (allAvailableProjects ?? []).filter((p) => {
    const search = filters.search.toLowerCase();
    if (search && !p.full_name.toLowerCase().includes(search) && !(p.description ?? "").toLowerCase().includes(search)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(p.category ?? "")) return false;
    if (filters.languages.length > 0 && !filters.languages.includes(p.language ?? "")) return false;
    return true;
  });
  const { data: claimedProjects, isLoading: claimedLoading } = useProjectsWithClaims("claimed");
  const { data: prProjects, isLoading: prLoading } = useProjectsWithClaims("pr_submitted");
  const { data: mergedProjects, isLoading: mergedLoading } = useProjectsWithClaims("merged");

  const handleCheckPrs = async () => {
    setCheckingPrs(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-pr-status", {
        method: "POST",
      });
      if (error) throw error;
      toast.success(`检查完成！共检查 ${data.checked} 个 PR，${data.merged} 个已合并`);
      refetchAvailable();
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
      toast.success(`同步完成！发现 ${data.total_found} 个项目，入库 ${data.inserted} 个`);
      refetchAvailable();
    } catch (e: any) {
      toast.error(`同步失败: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

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
                  <Button onClick={handleCheckPrs} disabled={checkingPrs} variant="outline" size="sm" className="gap-2">
                    <GitPullRequest className={`h-4 w-4 ${checkingPrs ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">{checkingPrs ? "检查中..." : "检查 PR"}</span>
                  </Button>
                  <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">{syncing ? "同步中..." : "同步数据"}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
            <ProjectFiltersBar
              filters={filters}
              onChange={setFilters}
              languages={stats?.languages || []}
              categories={stats?.categories || []}
            />

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
                <p className="text-sm text-muted-foreground">已加载 {availableProjects.length} 个项目</p>
                <ProjectTable projects={availableProjects} tabStatus="available" onRequestLogin={() => setAuthDialogOpen(true)} />
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
              <ProjectTable projects={claimedProjects} tabStatus="claimed" />
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
              <ProjectTable projects={prProjects} tabStatus="pr_submitted" />
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
              <ProjectTable projects={mergedProjects} tabStatus="merged" />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
