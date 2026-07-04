// Reports which Meta env vars are present so the ads page can show a setup
// checklist. Returns BOOLEANS ONLY — never the values — so a token can't leak
// to the browser even though the endpoint is admin-gated.

import { json, requireAdmin } from "./_shared/supabase.js";

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

export default async (req) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });
  const has = (n) => Boolean(env(n));
  return json({
    keys: {
      META_SYSTEM_USER_TOKEN: has("META_SYSTEM_USER_TOKEN"),
      META_AD_ACCOUNT_ID: has("META_AD_ACCOUNT_ID"),
      META_PAGE_ID: has("META_PAGE_ID"),
      META_INSTAGRAM_ACTOR_ID: has("META_INSTAGRAM_ACTOR_ID"),
      META_PIXEL_ID: has("META_PIXEL_ID"),
    },
    // Non-secret config echoes — useful for the operator to sanity-check.
    publisher_platforms: env("META_PUBLISHER_PLATFORMS") || "instagram",
    currency_minor_units: Number(env("META_CURRENCY_MINOR_UNITS") || 100),
  });
};

export const config = {
  path: "/api/admin/ads-config",
};
