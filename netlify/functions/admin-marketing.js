import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

const fallbackMarketing = {
  creativeJobs: [
    {
      id: "content-001",
      title: "Coach Tabby preorder footage",
      type: "Video clip",
      status: "ready_for_remotion",
      channel: "Instagram",
      product: "Coach Tabby Shoulder Bag 26",
      hook: "Use for a 9:16 preorder Reel. Show product first, then 4-week sourcing timeline.",
      source: "Product shoot",
      preview_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
    },
  ],
  campaigns: [
    {
      id: "camp-001",
      name: "Pink Friday USA Drop",
      channel: "Instagram",
      status: "live",
      budget_pkr: 65000,
      leads: 43,
      revenue_pkr: 486000,
    },
  ],
  leads: [
    {
      id: "lead-001",
      name: "Hania R.",
      source: "Instagram DM",
      stage: "quote_sent",
      product: "Marc Jacobs Mini Tote",
      value_pkr: 81538,
      last_message: "Can you confirm if this comes in black?",
      owner: "Ayesha",
      sla: "12m",
    },
  ],
  calendar: [
    { id: "post-001", date: "Today 8:30 PM", channel: "Instagram Reel", title: "Coach Tabby preorder reveal", status: "Needs caption" },
  ],
};

const tableByType = {
  creative_job: "creative_jobs",
  campaign: "marketing_campaigns",
  lead: "marketing_leads",
  calendar_post: "content_calendar",
};

export default async (req) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (req.method === "GET") {
      if (!hasSupabase()) return json({ ...fallbackMarketing, configured: false });
      const [creativeJobs, campaigns, leads, calendar] = await Promise.all([
        supabase("/rest/v1/creative_jobs?select=*&order=created_at.desc"),
        supabase("/rest/v1/marketing_campaigns?select=*&order=created_at.desc"),
        supabase("/rest/v1/marketing_leads?select=*&order=updated_at.desc"),
        supabase("/rest/v1/content_calendar?select=*&order=scheduled_at.asc"),
      ]);
      return json({ creativeJobs, campaigns, leads, calendar, configured: true });
    }

    if (req.method === "POST") {
      const { type, payload } = await req.json();
      const table = tableByType[type];
      if (!table || !payload) return json({ error: "Valid type and payload are required." }, { status: 400 });

      if (!hasSupabase()) {
        const key = type === "creative_job" ? "creativeJob" : type === "calendar_post" ? "calendarPost" : type;
        return json({ [key]: payload, configured: false });
      }

      const [saved] = await supabase(`/rest/v1/${table}?on_conflict=id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
      });

      const key = type === "creative_job" ? "creativeJob" : type === "calendar_post" ? "calendarPost" : type;
      return json({ [key]: saved, configured: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/marketing",
};
