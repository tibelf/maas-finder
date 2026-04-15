import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SortField = "stars" | "updated_at" | "forks";
export type SortOrder = "asc" | "desc";

export interface ProjectFilters {
  search: string;
  languages: string[];
  categories: string[];
  sortBy: SortField;
  sortOrder: SortOrder;
}

const PAGE_SIZE = 20;

export function useGithubProjects(filters: ProjectFilters) {
  return useInfiniteQuery({
    queryKey: ["github-projects", filters],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("github_projects")
        .select("*")
        .order(filters.sortBy, { ascending: filters.sortOrder === "asc" })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (filters.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      if (filters.languages.length > 0) {
        query = query.in("language", filters.languages);
      }

      if (filters.categories.length > 0) {
        query = query.in("category", filters.categories);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectStats() {
  return useQuery({
    queryKey: ["github-projects-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("github_projects")
        .select("language, category");
      if (error) throw error;

      const languages = [...new Set(data.map((d) => d.language).filter(Boolean))] as string[];
      const categories = [...new Set(data.map((d) => d.category).filter(Boolean))] as string[];
      const total = data.length;

      return { languages, categories, total };
    },
    staleTime: 5 * 60 * 1000,
  });
}
