import { hasSupabase, json, requireAdmin } from "./_shared/supabase.js";

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

function safeName(value = "asset") {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const payload = await req.json();
    const file = payload.file;
    if (!file?.data_url) return json({ error: "A base64 file payload is required." }, { status: 400 });

    const match = file.data_url.match(/^data:(.+);base64,(.+)$/);
    if (!match) return json({ error: "Invalid file payload." }, { status: 400 });

    const [, contentType, base64] = match;
    const folder = safeName(payload.folder || "uploads");
    const objectPath = `${folder}/${Date.now()}-${safeName(file.name || "asset")}`;

    if (!hasSupabase()) {
      return json({ path: objectPath, publicUrl: file.data_url, configured: false });
    }

    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    const response = await fetch(`${url}/storage/v1/object/store-assets/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: Buffer.from(base64, "base64"),
    });
    if (!response.ok) throw new Error(await response.text());

    return json({
      path: objectPath,
      publicUrl: `${url}/storage/v1/object/public/store-assets/${objectPath}`,
      configured: true,
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/upload",
};
