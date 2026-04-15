import { useState, useRef, useCallback } from "react";
import { useGithubProjects, useProjectStats, type ProjectFilters } from "@/hooks/useGithubProjects";
import { useProjectsWithClaims, useClaimCounts, type ProjectWithClaim } from "@/hooks/useProjectClaims";
import { ProjectTable } from "@/components/ProjectTable";
import { ProjectFiltersBar } from "@/components/ProjectFiltersBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RefreshCw, Database, ChartBar as BarChart3, Loader as Loader2, Github, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TabStatus } from "@/components/ProjectCard";

const Index = () => {
  const { user, loading: authLoading, signInWithGithub, signOut } = useAuthContext();

  const [activeTab, setActiveTab] = useState<TabStatus>("available");
  const [filters, setFilters] = useState<ProjectFilters>({
    search: "",
    languages: [],
    categories: [],
    sortBy: "stars",
    sortOrder: "desc",
  });
  const [syncing, setSyncing] = useState(false);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGithubProjects(filters);
  const { data: stats } = useProjectStats();
  const { data: claimCounts } = useClaimCounts();

  const { data: claimedProjects, isLoading: claimedLoading } = useProjectsWithClaims("claimed");
  const { data: prProjects, isLoading: prLoading } = useProjectsWithClaims("pr_submitted");
  const { data: mergedProjects, isLoading: mergedLoading } = useProjectsWithClaims("merged");

  const allAvailableProjects = data?.pages.flat() ?? [];
  const availableProjects: ProjectWithClaim[] = allAvailableProjects.map((p) => ({ ...p, claim: null }));

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage]
  );

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-github-projects", {
        method: "POST",
      });
      if (error) throw error;
      toast.success(`同步完成！发现 ${data.total_found} 个项目，入库 ${data.inserted} 个`);
      refetch();
    } catch (e: any) {
      toast.error(`同步失败: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
                      <AvatarImage src={user.githubAvatarUrl} />
                      <AvatarFallback>{user.githubUsername[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium hidden sm:inline">{user.githubUsername}</span>
                    <Button variant="ghost" size="sm" onClick={signOut} className="h-7 w-7 p-0">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={signInWithGithub} className="gap-2">
                    <Github className="h-4 w-4" />
                    GitHub 登录
                  </Button>
                )
              )}
              <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncing ? "同步中..." : "同步数据"}</span>
              </Button>
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

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-destructive">加载失败: {(error as Error).message}</p>
                <Button variant="outline" onClick={() => refetch()} className="mt-4">重试</Button>
              </div>
            ) : !availableProjects.length ? (
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
                <ProjectTable projects={availableProjects} tabStatus="available" />
                <div ref={sentinelRef} className="flex justify-center py-4">
                  {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                  {!hasNextPage && availableProjects.length > 0 && (
                    <p className="text-sm text-muted-foreground">已加载全部项目</p>
                  )}
                </div>
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
