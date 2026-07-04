// Weekly cron for the data-driven targeting recommendation (08:00 UTC Monday).
// HTTP endpoint lives in ads-audience.js; this wrapper runs it on a schedule
// and recomputes the cached recommendation in meta_targeting_reco.
import { adsAudience } from "./ads-audience.js";

export default async () => {
  const req = new Request("https://scheduled.invalid/?scheduled=1", {
    headers: { "x-netlify-functions-source": "schedule" },
  });
  try {
    await adsAudience(req);
  } catch (error) {
    console.error("[ads-audience-scheduled]", error?.message || error);
  }
  return new Response("ok");
};

export const config = {
  schedule: "0 8 * * 1",
};
