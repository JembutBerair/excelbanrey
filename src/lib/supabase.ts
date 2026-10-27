import { createClient } from "@supabase/supabase-js";
export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_"),
);
let instance: ReturnType<typeof createClient> | undefined;
export function supabase() {
  if (!configured) throw Error("Connect Supabase using the setup guide.");
  return (instance ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase().auth.getSession();
  if (!session) throw Error("Please sign in again.");
  const r = await fetch("/api/" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
export function imageUrl(path: string | null) {
  if (!path || !configured) return undefined;
  return supabase().storage.from("product-images").getPublicUrl(path).data
    .publicUrl;
}
export async function uploadImage(file: File, userId: string) {
  if (file.size > 5 * 1024 * 1024) throw Error("Images must be under 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Use JPG, PNG, or WebP images.");
  const ext = file.type.split("/")[1];
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase()
    .storage.from("product-images")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
