
CREATE TABLE public.github_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  github_id BIGINT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  description TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  topics TEXT[] DEFAULT '{}',
  html_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ,
  maas_score INTEGER NOT NULL DEFAULT 0,
  maas_signals JSONB DEFAULT '{}',
  category TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.github_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view github projects"
  ON public.github_projects
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX idx_github_projects_maas_score ON public.github_projects (maas_score DESC);
CREATE INDEX idx_github_projects_stars ON public.github_projects (stars DESC);
CREATE INDEX idx_github_projects_language ON public.github_projects (language);
CREATE INDEX idx_github_projects_category ON public.github_projects (category);
