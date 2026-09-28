import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import type { BlogPost } from "./render";

/**
 * Published posts, read as a visitor would: the public key and no cookie, so
 * row-level security returns published rows and nothing else (055). A draft
 * cannot leak onto the website through this file even by mistake.
 */
function publicClient() {
  return createClient(supabaseUrl()!, supabasePublishableKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const POST_COLUMNS =
  "slug,title,deck,summary,category,cta,body_html,links,hero_url,hero_alt,hero_caption,read_minutes,published_at,updated_at";

export async function publishedPost(slug: string): Promise<BlogPost | null> {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const { data, error } = await publicClient()
    .from("blog_posts")
    .select(POST_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    if (!/blog_posts/.test(error.message)) console.error("[blog] could not read a post:", error.message);
    return null;
  }
  return (data as BlogPost | null) ?? null;
}

export interface PostCard {
  slug: string;
  title: string;
  deck: string;
  category: string;
  hero_url: string | null;
  hero_alt: string;
  read_minutes: number;
  published_at: string | null;
}

export async function publishedCards(): Promise<PostCard[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await publicClient()
    .from("blog_posts")
    .select("slug,title,deck,category,hero_url,hero_alt,read_minutes,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) {
    if (!/blog_posts/.test(error.message)) console.error("[blog] could not list posts:", error.message);
    return [];
  }
  return (data as PostCard[] | null) ?? [];
}
