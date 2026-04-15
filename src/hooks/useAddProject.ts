import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AddProjectResult {
  success: boolean;
  already_existed: boolean;
  project: {
    full_name: string;
    stars: number;
    category: string;
  };
}

export function useAddProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (repoPath: string): Promise<AddProjectResult> => {
      const { data, error } = await supabase.functions.invoke("add-single-project", {
        method: "POST",
        body: { repo_path: repoPath },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "添加失败");
      return data as AddProjectResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-with-claims"] });
      qc.invalidateQueries({ queryKey: ["project-stats"] });
    },
  });
}
