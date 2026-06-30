// Daily cron for the Meta ads report (06:00 UTC = 11:00 PKT). A Netlify
// function can't have both a custom path and a schedule, so the HTTP endpoint
// lives in ads-report.js and this thin wrapper just runs its handler on a
// schedule with a synthetic "scheduled" request (which skips the admin check
// and refreshes the snapshots).
import { adsReport } from "./ads-report.js";

export default async () => {
  const req = new Request("https://scheduled.invalid/?scheduled=1", {
    headers: { "x-netlify-functions-source": "schedule" },
  });
  try {
    await adsReport(req);
  } catch (error) {
    console.error("[ads-report-scheduled]", error?.message || error);
  }
  return new Response("ok");
};

export const config = {
  schedule: "0 6 * * *",
};
