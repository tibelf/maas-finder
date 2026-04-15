import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SyncJob {
  id: string;
  job_type: string;
  status: string;
  current_query_index: number;
  current_page: number;
  total_scanned: number;
  total_inserted: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
}

const TOTAL_QUERIES = 12;
const MAX_PAGES = 10;
const TOTAL_WORK_UNITS = TOTAL_QUERIES * MAX_PAGES;

export function calcInitProgress(job: SyncJob): number {
  if (job.status === "completed") return 100;
  const done = job.current_query_index * MAX_PAGES + (job.current_page - 1);
  return Math.min(Math.round((done / TOTAL_WORK_UNITS) * 100), 99);
}

export function useActiveInitJob() {
  return useQuery({
    queryKey: ["sync-job-init"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_jobs")
        .select("*")
        .eq("job_type", "init")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SyncJob | null;
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      return job?.status === "running" ? 10_000 : false;
    },
    staleTime: 5_000,
  });
}

export function useStartInitJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("sync_jobs")
        .insert({ job_type: "init", status: "running" })
        .select()
        .single();
      if (error) throw error;
      return data as SyncJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-job-init"] });
    },
  });
}
