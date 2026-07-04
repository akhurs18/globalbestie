// Daily cron for the guardrailed optimizer (07:00 UTC = 12:00 PKT, an hour
// after the report refresh). HTTP endpoint lives in ads-optimize.js; this
// wrapper runs it on a schedule. Dry-run unless store_settings.ads_autopilot
// is on, so this never spends on its own.
import { adsOptimize } from "./ads-optimize.js";

export default async () => {
  const req = new Request("https://scheduled.invalid/?scheduled=1", {
    headers: { "x-netlify-functions-source": "schedule" },
  });
  try {
    await adsOptimize(req);
  } catch (error) {
    console.error("[ads-optimize-scheduled]", error?.message || error);
  }
  return new Response("ok");
};

export const config = {
  schedule: "0 7 * * *",
};
