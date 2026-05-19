import type { ReportFilters, ReportRow } from "@/lib/report";
import { buildOrderedMetricBodyLines } from "@/lib/report-email-packaging";
import { formatAgentDurationDisplay } from "@/lib/agent-duration-format";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}


function formatBodyWithStyledHeadings(body: string): string {
  const headingLines = new Set([
    "Report Details:",
    "Metrics Snapshot:",
    "Inbox :",
    "CSAT :",
    "Revenue:",
    "Orders :",
    "Bot Overview :",
    "Agent Overview:",
    "Voice :",
    "Additional Metrics:",
  ]);
  return body
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      if (headingLines.has(line.trim())) {
        return `<span style="font-weight:700;color:#111827;">${escaped}</span>`;
      }
      const labelMatch = line.match(/^(\s*[-*]?\s*)([^:]{1,120}):(.*)$/);
      if (labelMatch) {
        const [, prefix, label, rest] = labelMatch;
        return `${escapeHtml(prefix)}<span style="font-weight:700;color:#111827;">${escapeHtml(
          label
        )}:</span>${escapeHtml(rest)}`;
      }
      return escaped;
    })
    .join("<br/>");
}

export function buildDefaultEmailSubject(filters: ReportFilters): string {
  return `Metrics Overview | ${filters.account_id} | ${filters.start_date} to ${filters.end_date}`;
}

export function buildDefaultEmailBody(
  filters: ReportFilters,
  rows: ReportRow[]
): string {
  const metricLines = buildOrderedMetricBodyLines(rows);
  return [
    "Please find the metrics performance update below.",
    "",
    "Report Details:",
    `- Account ID: ${filters.account_id}`,
    `- Date Range: ${filters.start_date} to ${filters.end_date}`,
    "",
    "Metrics Snapshot:",
    "",
    ...metricLines,
    "",
    "Regards,",
    "Customer Success Team",
  ].join("\n");
}

function renderMetricsHtml(rows: ReportRow[]): string {
  const orderedRows = rows.filter((row) => row.value && !row.value.startsWith("Error:"));
  const rowByKey = new Map(orderedRows.map((row) => [row.metricKey, row]));
  const num = (v: string) => {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const inr = (v: string) => `₹${num(v).toLocaleString("en-IN")}`;
  const val = (k: string, d = "—") => String(rowByKey.get(k)?.value ?? d);
  const pct = (part: number, total: number) => (total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "0%");
  const formatStars = (score: number) => {
    const filled = Math.max(0, Math.min(5, Math.round(score)));
    return "★★★★★".split("").map((s, i) => `<span class="star" style="${i < filled ? "" : "opacity:0.3;"}">${s}</span>`).join("");
  };

  const normalizeCol = (value: string) => value.toLowerCase().replace(/\s+/g, "_");
  const voiceRow = rowByKey.get("revenue_voice");
  const voiceRows =
    !voiceRow?.cols || !voiceRow.rows?.length
      ? []
      : voiceRow.rows.map((cells) => {
          const idx = (candidates: string[]) => {
            for (const candidate of candidates) {
              const found = voiceRow.cols!.findIndex((col) => normalizeCol(col) === candidate);
              if (found >= 0) return found;
            }
            return -1;
          };
          return {
            call_channel: String(cells[idx(["call_channel", "channel", "call channel"])] ?? "—"),
            total_calls: String(cells[idx(["total_calls", "calls", "total calls"])] ?? "—"),
            total_calling_minutes: String(cells[idx(["total_calling_minutes", "calling_minutes", "total minutes"])] ?? "—"),
            acceptance_rate_pct: String(cells[idx(["acceptance_rate_pct", "acceptance_rate", "acceptance rate %"])] ?? "—"),
          };
        });

  const totalRevenue = val("total_revenue", "0");
  const roi = val("revenue_mrr_ratio", "—");
  const widgetType = val("web_widget_type", "—");
  const totalTickets = val("total_tickets_retain_sure", "—");

  const revBroadcast = num(val("revenue_broadcast", "0"));
  const revFlow = num(val("revenue_flow", "0"));
  const revInfluenced = num(val("revenue_influenced_bot", "0"));
  const revDirect = num(val("revenue_direct_bot", "0"));
  const revTotalNum = num(totalRevenue);

  const orderBot = num(val("orders_placed_via_bot", "0"));
  const orderFlow = num(val("orders_placed_via_flows", "0"));
  const orderBroadcast = num(val("orders_placed_via_broadcasts", "0"));
  const orderTotal = orderBot + orderFlow + orderBroadcast;

  const botCsat = num(val("bot_csat_score", "0"));
  const agentCsat = num(val("agent_csat_score", "0"));
  const botCsatN = val("total_bot_csat_responses", "0");
  const agentCsatN = val("total_agent_csat_responses", "0");

  const agentFirst = formatAgentDurationDisplay(val("agent_first_resolution_time", ""));
  const agentRes = formatAgentDurationDisplay(val("agent_resolution_time", ""));
  const agentWait = formatAgentDurationDisplay(val("agent_wait_time", ""));
  const billable = val("number_of_billable_agents", "—");

  const botAutomation = num(val("bot_automation_percent", "0")).toFixed(2);
  const botTickets = val("bot_total_tickets", "—");
  const buyNow = val("buy_now_button_count", "—");
  const buttonCount = val("button_click_count", "—");

  const voiceHtml = (voiceRows.length > 0 ? voiceRows : [{
    call_channel: "—",
    total_calls: "—",
    total_calling_minutes: "—",
    acceptance_rate_pct: "—",
  }]).map((v) => `
    <div class="section">
      <div class="section-header">
        <div class="section-icon" style="background:#F0FDF4;">📞</div>
        <span class="section-title">Voice (${escapeHtml(v.call_channel)})</span>
      </div>
      <div class="voice-grid">
        <div class="metric-card accent-green"><div class="card-label">Total Calls</div><div class="card-value">${escapeHtml(v.total_calls)}</div></div>
        <div class="metric-card accent-green"><div class="card-label">Calling Minutes</div><div class="card-value">${escapeHtml(v.total_calling_minutes)}</div></div>
        <div class="metric-card accent-green"><div class="card-label">Acceptance Rate</div><div class="card-value">${num(v.acceptance_rate_pct).toFixed(0)}<span style="font-size:14px;color:#15803D;">%</span></div></div>
      </div>
    </div>
    <hr class="divider">
  `).join("");

  return `
  <div class="roi-hero">
    <div class="roi-left">
      <div class="roi-label">Return on Investment</div>
      <div class="roi-value">${escapeHtml(roi).replace("x", '<span style="font-size:28px;color:rgba(255,255,255,0.5)">×</span>')}</div>
      <div class="roi-sub">For every ₹1 spent on LimeChat</div>
    </div>
    <div class="roi-right">
      <div class="roi-badge">${escapeHtml(inr(totalRevenue))}<span class="roi-badge-label">Total Revenue</span></div>
    </div>
  </div>

  <div class="section" style="padding-top:24px;">
    <div class="section-header"><div class="section-icon" style="background:#E0F2FE;">📥</div><span class="section-title">Inbox Snapshot</span></div>
    <div class="metric-grid cols-2">
      <div class="metric-card" style="background:#F0F9FF;border-color:#BAE6FD;"><div class="card-label">Widget Type</div><div class="card-value" style="font-size:20px;color:#0369A1;">${escapeHtml(widgetType)}</div></div>
      <div class="metric-card" style="background:#F0F9FF;border-color:#BAE6FD;"><div class="card-label">Total Tickets</div><div class="card-value" style="color:#0369A1;">${escapeHtml(totalTickets)}</div><div class="card-sub">This period</div></div>
    </div>
  </div>
  <hr class="divider">

  <div class="section">
    <div class="section-header"><div class="section-icon" style="background:#DCFCE7;">₹</div><span class="section-title">Revenue Breakdown</span></div>
    <div class="revenue-hero"><div><div class="rev-label">Total Revenue</div><div class="rev-value">${escapeHtml(inr(totalRevenue))}</div></div><div class="rev-tag">All Channels</div></div>
    <div class="bar-list">
      <div class="bar-item"><div class="bar-name">Broadcast</div><div class="bar-amount">${escapeHtml(inr(String(revBroadcast)))}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(revBroadcast, revTotalNum)};background:#2563EB;"></div></div></div>
      <div class="bar-item"><div class="bar-name">Flow</div><div class="bar-amount">${escapeHtml(inr(String(revFlow)))}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(revFlow, revTotalNum)};background:#16A34A;"></div></div></div>
      <div class="bar-item"><div class="bar-name">Bot (influenced)</div><div class="bar-amount">${escapeHtml(inr(String(revInfluenced)))}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(revInfluenced, revTotalNum)};background:#7C3AED;"></div></div></div>
      <div class="bar-item"><div class="bar-name">Bot (direct)</div><div class="bar-amount">${escapeHtml(inr(String(revDirect)))}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(revDirect, revTotalNum)};background:#9333EA;"></div></div></div>
    </div>
  </div>
  <hr class="divider">

  <div class="section">
    <div class="section-header"><div class="section-icon" style="background:#DBEAFE;">🛒</div><span class="section-title">Orders</span></div>
    <div class="metric-grid cols-3">
      <div class="metric-card accent-blue"><div class="card-label">Via Broadcast</div><div class="card-value">${orderBroadcast.toLocaleString("en-IN")}</div><div class="card-sub">${pct(orderBroadcast, orderTotal)} of total orders</div></div>
      <div class="metric-card accent-purple"><div class="card-label">Via Flows</div><div class="card-value">${orderFlow.toLocaleString("en-IN")}</div><div class="card-sub">${pct(orderFlow, orderTotal)} of total orders</div></div>
      <div class="metric-card accent-teal"><div class="card-label">Via Bot</div><div class="card-value">${orderBot.toLocaleString("en-IN")}</div><div class="card-sub">${pct(orderBot, orderTotal)} of total orders</div></div>
    </div>
  </div>
  <hr class="divider">

  <div class="section">
    <div class="section-header"><div class="section-icon" style="background:#F5F3FF;">🤖</div><span class="section-title">Bot Overview</span></div>
    <div class="metric-grid cols-2" style="margin-bottom:12px;">
      <div class="metric-card accent-purple"><div class="card-label">Total Bot Tickets</div><div class="card-value">${escapeHtml(botTickets)}</div></div>
      <div class="metric-card" style="background:#F5F3FF;border-color:#DDD6FE;"><div class="card-label">Bot Automation Rate</div><div class="card-value">${botAutomation}<span style="font-size:14px;color:#7C3AED;">%</span></div><div class="card-sub" style="margin-top:6px;"><div style="background:#E5E7EB;border-radius:999px;height:6px;overflow:hidden;"><div style="width:${botAutomation}%;background:#7C3AED;height:100%;border-radius:999px;"></div></div></div></div>
    </div>
    <div class="metric-grid cols-2">
      <div class="metric-card"><div class="card-label">Buy Now clicks</div><div class="card-value">${escapeHtml(buyNow)}</div></div>
      <div class="metric-card"><div class="card-label">Button click count</div><div class="card-value">${escapeHtml(buttonCount)}</div></div>
    </div>
  </div>
  <hr class="divider">

  <div class="section">
    <div class="section-header"><div class="section-icon" style="background:#FFFBEB;">⭐</div><span class="section-title">CSAT Scores</span></div>
    <div class="csat-grid">
      <div class="csat-card"><div class="csat-type">Bot CSAT</div><div class="stars">${formatStars(botCsat)}</div><div class="csat-score">${botCsat.toFixed(1)} <span>/ 5</span></div><div class="csat-respondents">${escapeHtml(botCsatN)} respondents</div></div>
      <div class="csat-card"><div class="csat-type">Agent CSAT</div><div class="stars">${formatStars(agentCsat)}</div><div class="csat-score">${agentCsat.toFixed(1)} <span>/ 5</span></div><div class="csat-respondents">${escapeHtml(agentCsatN)} respondents</div></div>
    </div>
  </div>
  <hr class="divider">

  <div class="section">
    <div class="section-header"><div class="section-icon" style="background:#EDE9FE;">👤</div><span class="section-title">Agent Overview</span></div>
    <div class="timing-grid">
      <div class="timing-card"><div class="timing-label">First Resolution Time</div><div class="timing-value">${escapeHtml(agentFirst)}</div></div>
      <div class="timing-card"><div class="timing-label">Resolution Time</div><div class="timing-value">${escapeHtml(agentRes)}</div></div>
      <div class="timing-card"><div class="timing-label">Wait Time</div><div class="timing-value">${escapeHtml(agentWait)}</div></div>
    </div>
    <div style="margin-top:12px;"><div class="metric-card" style="background:#EDE9FE;border-color:#DDD6FE;"><div class="card-label">Billable agents</div><div class="card-value">${escapeHtml(billable)}</div></div></div>
  </div>
  <hr class="divider">
  ${voiceHtml}
  `;
}

export function renderEmailHtmlTemplate(
  subject: string,
  body: string,
  attachmentLabels: string[] = [],
  rows: ReportRow[] = [],
  fileDownloadLinks: { label: string; href: string }[] = []
): string {
  const safeSubject = escapeHtml(subject);
  const safeBody = formatBodyWithStyledHeadings(body);
  const metricsHtml = renderMetricsHtml(rows);
  const safeDownloadLinksHtml =
    fileDownloadLinks.length === 0
      ? ""
      : `<div style="margin:24px 36px 0;padding:16px;border-radius:12px;border:1px solid #bbf7d0;background:#f0fdf4;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#166534;">Direct Excel downloads</p>
          <p style="margin:0 0 10px;font-size:12px;color:#15803d;line-height:1.55;">Tap on link here.</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.75;color:#14532d;">
            ${fileDownloadLinks
              .map(
                (l) =>
                  `<li><a href="${escapeHtmlAttr(l.href)}" style="color:#166534;font-weight:600;">${escapeHtml(l.label)}</a></li>`
              )
              .join("")}
          </ul>
        </div>`;
  const safeAttachmentHtml =
    attachmentLabels.length === 0
      ? ""
      : `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e5ebd8;">
          <p style="margin:0 0 6px;font-size:12px;color:#4b5563;font-weight:600;">Attached files (names only — not downloads)</p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">The list below is for reference only. The real files are <strong>separate attachments</strong> (paperclip / attachments area): look for <code style="font-size:11px;background:#f3f4f6;padding:1px 4px;border-radius:3px;">.xlsx</code> files named like <code style="font-size:11px;background:#f3f4f6;padding:1px 4px;border-radius:3px;">…_total_tickets_inbox_wise_….xlsx</code>. They are not linked from this bullet list.</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;">
            ${attachmentLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}
          </ul>
        </div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeSubject}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F4F5F7;color:#1a1a2e}
      .wrapper{max-width:680px;margin:32px auto}
      .header{background:#1a1a2e;border-radius:16px 16px 0 0;padding:32px 36px 28px}
      .header-brand{display:flex;align-items:center;gap:10px;margin-bottom:20px}
      .brand-logo{width:42px;height:42px;display:block;object-fit:contain}
      .brand-name{font-size:14px;font-weight:600;color:rgba(255,255,255,.9);letter-spacing:.04em}
      .header-title{font-size:26px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:6px}
      .header-sub{font-size:14px;color:rgba(255,255,255,.5)}
      .body{background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 16px 16px;padding:0 0 32px}
      .roi-hero{background:linear-gradient(135deg,#1a1a2e 0%,#2d2d5e 100%);padding:28px 36px;display:flex;align-items:center;justify-content:space-between;gap:16px}
      .roi-label{font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
      .roi-value{font-size:48px;font-weight:700;color:#fff;line-height:1}
      .roi-sub{font-size:13px;color:rgba(255,255,255,.5);margin-top:4px}
      .roi-right{text-align:right}
      .roi-badge{background:rgba(37,211,102,.2);border:1px solid rgba(37,211,102,.35);color:#6ee79a;font-size:13px;font-weight:600;padding:8px 16px;border-radius:10px}
      .roi-badge-label{font-size:10px;color:rgba(110,231,154,.7);display:block;text-align:center;margin-top:2px;letter-spacing:.06em;text-transform:uppercase}
      .section{padding:28px 36px 0}
      .section-header{display:flex;align-items:center;gap:10px;margin-bottom:18px}
      .section-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .section-title{font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.1em}
      .metric-grid{display:grid;gap:12px}.cols-2{grid-template-columns:repeat(2,1fr)}.cols-3{grid-template-columns:repeat(3,1fr)}
      .metric-card{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px}
      .accent-green{background:#F0FDF4;border-color:#BBF7D0}.accent-blue{background:#EFF6FF;border-color:#BFDBFE}.accent-purple{background:#F5F3FF;border-color:#DDD6FE}.accent-teal{background:#F0FDFA;border-color:#99F6E4}
      .card-label{font-size:11px;color:#9CA3AF;font-weight:500;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
      .card-value{font-size:22px;font-weight:700;color:#111827;line-height:1.1}
      .card-sub{font-size:11px;color:#9CA3AF;margin-top:3px}
      .revenue-hero{background:#F0FDF4;border:1px solid #BBF7D0;border-radius:14px;padding:20px 24px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
      .rev-label{font-size:12px;color:#15803D;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
      .rev-value{font-size:32px;font-weight:700;color:#14532D}.rev-tag{background:#DCFCE7;border:1px solid #BBF7D0;color:#15803D;font-size:12px;font-weight:600;padding:6px 14px;border-radius:8px}
      .bar-list{display:block;margin-top:14px}
      .bar-item{display:block;margin:0 0 12px 0}
      .bar-name{display:block;font-size:13px;color:#374151;font-weight:500;line-height:1.4;margin-bottom:2px}
      .bar-amount{display:block;font-size:16px;color:#111827;font-weight:700;line-height:1.4;margin-bottom:8px}
      .bar-track{display:block;background:#F3F4F6;border-radius:999px;height:8px;overflow:hidden}
      .bar-fill{display:block;height:100%;border-radius:999px}
      .csat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.csat-card{background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px}.csat-type{font-size:11px;color:#92400E;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:8px}.stars{display:flex;gap:3px;margin-bottom:6px}.star{font-size:18px}.csat-score{font-size:28px;font-weight:700;color:#92400E}.csat-score span{font-size:14px;color:#B45309;font-weight:400}.csat-respondents{font-size:11px;color:#B45309;margin-top:4px}
      .timing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.timing-card{background:#F5F3FF;border:1px solid #DDD6FE;border-radius:12px;padding:14px;text-align:center}.timing-label{font-size:10px;color:#7C3AED;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:6px}.timing-value{font-size:22px;font-weight:700;color:#4C1D95}.timing-unit{font-size:11px;color:#7C3AED}
      .voice-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .divider{border:none;border-top:1px solid #F3F4F6;margin:28px 36px 0}
      .footer{padding:24px 36px 0;text-align:center}.footer p{font-size:12px;color:#9CA3AF;line-height:1.6}.footer a{color:#6366F1;text-decoration:none}
      @media (max-width:500px){.cols-3,.cols-2,.voice-grid,.timing-grid{grid-template-columns:repeat(2,1fr)}.csat-grid{grid-template-columns:1fr}.roi-hero,.revenue-hero{flex-direction:column;text-align:center}.wrapper{margin:0}.header,.body{border-radius:0}}
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header">
        <div class="header-brand">
          <img class="brand-logo" src="/limechat-logo.png" alt="LimeChat" />
          <span class="brand-name">LimeChat</span>
        </div>
        <div class="header-title">Monthly Performance Report</div>
        <div class="header-sub">${safeSubject}</div>
      </div>
      <div class="body">
        <div class="section" style="padding-top:20px;">
          <div style="font-size:13px;line-height:1.65;color:#4b5563;">${safeBody}</div>
        </div>
        ${metricsHtml}
        ${safeDownloadLinksHtml}
        <div class="footer">
          <p style="margin-bottom:8px;">Generated by <strong>LimeChat</strong> · Your WhatsApp Growth Partner</p>
          <p>Questions? Reach out to your Customer Success Manager · <a href="https://limechat.ai">limechat.ai</a></p>
        </div>
        ${safeAttachmentHtml}
      </div>
    </div>
  </body>
</html>`;
}
