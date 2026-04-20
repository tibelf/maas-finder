import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AuthUser } from "@/hooks/useAuth";

export type ClaimStatus = "claimed" | "pr_submitted" | "merged";

export interface ProjectClaim {
  id: string;
  project_id: string;
  user_id: string;
  user_email: string;
  status: ClaimStatus;
  pr_url: string | null;
  pr_number: number | null;
  claimed_at: string;
  updated_at: string;
}

export interface ProjectWithClaim {
  id: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stars: number;
  forks: number;
  language: string | null;
  category: string | null;
  updated_at: string | null;
  claim: ProjectClaim | null;
}

export interface UseProjectsWithClaimsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  languages?: string[];
  categories?: string[];
}

export interface PaginatedProjectsResult {
  items: ProjectWithClaim[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const PROJECTS_PAGE_SIZE = 20;

export function useAllClaims() {
  return useQuery({
    queryKey: ["project-claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_claims")
        .select("*")
        .order("claimed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProjectClaim[];
    },
    staleTime: 30 * 1000,
  });
}

export function useProjectsWithClaims(
  status: ClaimStatus | "available",
  options: UseProjectsWithClaimsOptions = {},
) {
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = Math.max(options.pageSize ?? PROJECTS_PAGE_SIZE, 1);
  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  return useQuery({
    queryKey: ["projects-with-claims", status, page, pageSize, options.search, options.languages, options.categories],
    queryFn: async () => {
      if (status === "available") {
        const { data: claimedIds, error: claimedErr } = await supabase
          .from("project_claims")
          .select("project_id")
          .in("status", ["claimed", "pr_submitted"]);
        if (claimedErr) throw claimedErr;

        const ids = (claimedIds || []).map((c) => c.project_id);

        let query = supabase
          .from("github_projects")
          .select("*", { count: "exact" })
          .order("stars", { ascending: false })
          .range(rangeStart, rangeEnd);

        const search = options.search?.trim();
        if (search) {
          query = query.or(`full_name.ilike.%${search}%,description.ilike.%${search}%`);
        }

        if (options.languages && options.languages.length > 0) {
          query = query.in("language", options.languages);
        }

        if (options.categories && options.categories.length > 0) {
          query = query.in("category", options.categories);
        }

        if (ids.length > 0) {
          query = query.not("id", "in", `(${ids.join(",")})`);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        const total = count ?? 0;
        return {
          items: (data || []).map((p) => ({ ...p, claim: null })) as ProjectWithClaim[],
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        } as PaginatedProjectsResult;
      }

      const { data: claims, count, error: claimErr } = await supabase
        .from("project_claims")
        .select("*", { count: "exact" })
        .eq("status", status)
        .order("updated_at", { ascending: false })
        .range(rangeStart, rangeEnd);
      if (claimErr) throw claimErr;

      const total = count ?? 0;

      if (!claims || claims.length === 0) {
        return {
          items: [],
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        } as PaginatedProjectsResult;
      }

      const projectIds = claims.map((c) => c.project_id);
      const { data: projects, error: projErr } = await supabase
        .from("github_projects")
        .select("*")
        .in("id", projectIds);
      if (projErr) throw projErr;

      const projectMap = new Map((projects || []).map((p) => [p.id, p]));

      return {
        items: claims
          .map((claim) => {
            const project = projectMap.get(claim.project_id);
            if (!project) return null;
            return { ...project, claim: claim as ProjectClaim };
          })
          .filter(Boolean) as ProjectWithClaim[],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      } as PaginatedProjectsResult;
    },
    staleTime: 30 * 1000,
  });
}

export function useClaimProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, user }: { projectId: string; user: AuthUser }) => {
      const { error } = await supabase.from("project_claims").insert({
        project_id: projectId,
        user_id: user.id,
        user_email: user.email,
        status: "claimed",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-with-claims"] });
      qc.invalidateQueries({ queryKey: ["project-claims"] });
      qc.invalidateQueries({ queryKey: ["claim-counts"] });
      qc.invalidateQueries({ queryKey: ["github-projects"] });
    },
  });
}

export function useAbandonClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("project_claims")
        .delete()
        .eq("id", claimId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-with-claims"] });
      qc.invalidateQueries({ queryKey: ["project-claims"] });
      qc.invalidateQueries({ queryKey: ["claim-counts"] });
      qc.invalidateQueries({ queryKey: ["github-projects"] });
    },
  });
}

export function useSubmitPr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, prUrl }: { claimId: string; prUrl: string }) => {
      const match = prUrl.match(/\/pull\/(\d+)/);
      const prNumber = match ? parseInt(match[1], 10) : null;

      const { error } = await supabase
        .from("project_claims")
        .update({
          status: "pr_submitted",
          pr_url: prUrl,
          pr_number: prNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-with-claims"] });
      qc.invalidateQueries({ queryKey: ["project-claims"] });
      qc.invalidateQueries({ queryKey: ["claim-counts"] });
    },
  });
}

export type GlobalSearchStatus = "available" | ClaimStatus;

export interface ProjectWithGlobalStatus extends ProjectWithClaim {
  globalStatus: GlobalSearchStatus;
}

export interface PaginatedGlobalSearchResult {
  items: ProjectWithGlobalStatus[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useGlobalSearch(search: string, page: number = 1) {
  const pageSize = PROJECTS_PAGE_SIZE;
  const pageNum = Math.max(page, 1);
  const rangeStart = (pageNum - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  return useQuery({
    queryKey: ["global-search", search, pageNum, pageSize],
    queryFn: async (): Promise<PaginatedGlobalSearchResult> => {
      if (!search.trim()) {
        return { items: [], total: 0, totalPages: 0, page: pageNum, pageSize };
      }

      const term = search.toLowerCase();

      const [{ data: projects, error: projErr, count }, { data: activeClaims, error: claimErr }] =
        await Promise.all([
          supabase
            .from("github_projects")
            .select("*", { count: "exact" })
            .or(`full_name.ilike.*${term}*,description.ilike.*${term}*`)
            .order("stars", { ascending: false })
            .range(rangeStart, rangeEnd),
          supabase
            .from("project_claims")
            .select("*")
            .in("status", ["claimed", "pr_submitted", "merged"]),
        ]);

      if (projErr) throw projErr;
      if (claimErr) throw claimErr;

      const total = count ?? 0;
      const totalPages = Math.ceil(total / pageSize);

      const claimMap = new Map<string, ProjectClaim>();
      for (const c of activeClaims || []) {
        const existing = claimMap.get(c.project_id);
        const priority: Record<string, number> = { pr_submitted: 2, claimed: 1, merged: 0 };
        if (!existing || (priority[c.status] ?? -1) > (priority[existing.status] ?? -1)) {
          claimMap.set(c.project_id, c as ProjectClaim);
        }
      }

      const items = (projects || []).map((p): ProjectWithGlobalStatus => {
        const claim = claimMap.get(p.id) ?? null;
        let globalStatus: GlobalSearchStatus = "available";
        if (claim) {
          globalStatus = claim.status as ClaimStatus;
        }
        return { ...p, claim, globalStatus };
      });

      return { items, total, totalPages, page: pageNum, pageSize };
    },
    enabled: search.trim().length > 0,
    staleTime: 15 * 1000,
  });
}

export function useClaimCounts() {
  return useQuery({
    queryKey: ["claim-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_claims")
        .select("status, project_id");
      if (error) throw error;

      const claimed = (data || []).filter((c) => c.status === "claimed").length;
      const pr_submitted = (data || []).filter((c) => c.status === "pr_submitted").length;
      const merged = (data || []).filter((c) => c.status === "merged").length;

      const { data: total } = await supabase
        .from("github_projects")
        .select("id", { count: "exact", head: true });

      const activeClaimed = new Set(
        (data || []).filter((c) => ["claimed", "pr_submitted"].includes(c.status)).map((c) => c.project_id)
      );

      return {
        available: 0,
        claimed,
        pr_submitted,
        merged,
      };
    },
    staleTime: 30 * 1000,
  });
}
