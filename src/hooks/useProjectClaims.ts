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

export function useProjectsWithClaims(status: ClaimStatus | "available") {
  return useQuery({
    queryKey: ["projects-with-claims", status],
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
          .select("*")
          .order("stars", { ascending: false });

        if (ids.length > 0) {
          query = query.not("id", "in", `(${ids.join(",")})`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((p) => ({ ...p, claim: null })) as ProjectWithClaim[];
      }

      const { data: claims, error: claimErr } = await supabase
        .from("project_claims")
        .select("*")
        .eq("status", status)
        .order("updated_at", { ascending: false });
      if (claimErr) throw claimErr;

      if (!claims || claims.length === 0) return [];

      const projectIds = claims.map((c) => c.project_id);
      const { data: projects, error: projErr } = await supabase
        .from("github_projects")
        .select("*")
        .in("id", projectIds);
      if (projErr) throw projErr;

      const projectMap = new Map((projects || []).map((p) => [p.id, p]));

      return claims
        .map((claim) => {
          const project = projectMap.get(claim.project_id);
          if (!project) return null;
          return { ...project, claim: claim as ProjectClaim };
        })
        .filter(Boolean) as ProjectWithClaim[];
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
    },
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
