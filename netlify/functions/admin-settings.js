import { hasSupabase, json, requireAdmin, updateSettings } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const settings = await req.json();
    if (!hasSupabase()) return json({ settings, configured: false });
    const saved = await updateSettings(settings);
    return json({ settings: saved, configured: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/settings",
};
