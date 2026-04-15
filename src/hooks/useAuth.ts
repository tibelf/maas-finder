import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  githubUsername: string;
  githubAvatarUrl: string;
  email: string | null;
}

function extractGithubInfo(user: User): AuthUser {
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    githubUsername: meta.user_name || meta.preferred_username || meta.login || "",
    githubAvatarUrl: meta.avatar_url || "",
    email: user.email || null,
  };
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ? extractGithubInfo(session.user) : null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
      setUser(session?.user ? extractGithubInfo(session.user) : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGithub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signInWithGithub, signOut };
}
