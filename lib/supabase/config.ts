// Use static NEXT_PUBLIC references so Next.js can inline only these public values.
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) return null;

  try {
    const parsedUrl = new URL(url);
    if (!["https:", "http:"].includes(parsedUrl.protocol)) return null;

    // This project uses only publishable keys; reject privileged/legacy keys.
    if (!key.startsWith("sb_publishable_")) return null;

    return { url, key };
  } catch {
    return null;
  }
}
