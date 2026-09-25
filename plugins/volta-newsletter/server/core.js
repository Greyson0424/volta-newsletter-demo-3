import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import Handlebars from "handlebars";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");

const ITEM_TYPES = new Set(["community_win", "event"]);
const ITEM_SOURCES = new Set(["manual", "slack", "linkedin", "one_to_one", "volta_website"]);
const ITEM_STATUSES = new Set(["candidate", "approved", "excluded"]);

function inboxPath(workspacePath) {
  if (!workspacePath) throw new Error("workspacePath is required");
  return path.join(path.resolve(workspacePath), "newsletter-data", "inbox.json");
}

function memoryPath(workspacePath) {
  if (!workspacePath) throw new Error("workspacePath is required");
  return path.join(path.resolve(workspacePath), "memory.md");
}

function initialMemory() {
  return `# VOLTA Newsletter Memory

This file is the durable issue and story ledger. It is maintained by the newsletter workflow.

## Deduplication policy

- Stories marked **sent** are not reused unless the user explicitly approves an update with a materially new development.
- Stories marked **drafted** or **mailchimp_draft** are flagged for review because the issue may not have been sent.
- Match canonical URLs first, then normalized organization and story titles.

## Issue history
`;
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export async function readNewsletterMemory(workspacePath) {
  const target = memoryPath(workspacePath);
  try {
    return { source: target, content: await fs.readFile(target, "utf8") };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { source: target, content: initialMemory() };
  }
}

export async function recordNewsletterIssue({ workspacePath, month, status, draftPath, htmlPath, stories = [] }) {
  const issueMonth = monthBounds(month).value;
  const target = memoryPath(workspacePath);
  const current = (await readNewsletterMemory(workspacePath)).content;
  const start = `<!-- issue:${issueMonth}:start -->`;
  const end = `<!-- issue:${issueMonth}:end -->`;
  const rows = stories.length
    ? stories.map((story) => `| ${markdownCell(story.title)} | ${markdownCell(story.url || "private/manual source")} | ${markdownCell(story.verification || "reviewed")} |`).join("\n")
    : "| _No community stories recorded_ |  |  |";
  const section = `${start}
## ${issueMonth}

- Status: **${status}**
- Draft: ${draftPath || "Not recorded"}
- HTML: ${htmlPath || "Not recorded"}
- Updated: ${new Date().toISOString()}

### Community stories

| Story | Canonical source | Verification |
| --- | --- | --- |
${rows}
${end}`;
  const pattern = new RegExp(`${start.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")}`, "m");
  const next = pattern.test(current) ? current.replace(pattern, section) : `${current.trimEnd()}\n\n${section}\n`;
  await fs.writeFile(target, next, "utf8");
  return { savedTo: target, month: issueMonth, status, storyCount: stories.length };
}

async function readInboxFile(workspacePath) {
  const target = inboxPath(workspacePath);
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf8"));
    if (!Array.isArray(parsed.items)) throw new Error("Newsletter inbox must contain an items array");
    return { target, data: parsed };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { target, data: { version: 1, items: [], issueSettings: {} } };
  }
}

async function writeInboxFile(target, data) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function addNewsletterItem(input) {
  const month = monthBounds(input.month).value;
  if (!ITEM_TYPES.has(input.type)) throw new Error("type must be community_win or event");
  if (!ITEM_SOURCES.has(input.source)) throw new Error("source is not supported");
  const { target, data } = await readInboxFile(input.workspacePath);
  const now = new Date().toISOString();
  const item = {
    id: randomUUID(),
    month,
    type: input.type,
    title: input.title.trim(),
    summary: input.summary.trim(),
    date: input.date || null,
    time: input.time || null,
    endTime: input.endTime || null,
    source: input.source,
    sourceUrl: input.sourceUrl || null,
    personOrCompany: input.personOrCompany || null,
    location: input.location || null,
    notes: input.notes || null,
    status: input.status || "candidate",
    verification: input.source === "one_to_one" || !input.sourceUrl ? "needs_confirmation" : "source_supplied",
    createdAt: now,
    updatedAt: now,
  };
  if (!ITEM_STATUSES.has(item.status)) throw new Error("status is not supported");
  data.items.push(item);
  await writeInboxFile(target, data);
  return { savedTo: target, item };
}

export async function listNewsletterItems({ workspacePath, month, status }) {
  const { target, data } = await readInboxFile(workspacePath);
  const items = data.items.filter((item) => (!month || item.month === month) && (!status || item.status === status));
  return { source: target, count: items.length, items, settings: month ? data.issueSettings?.[month] || null : null };
}

export async function updateNewsletterItem({ workspacePath, id, changes }) {
  const { target, data } = await readInboxFile(workspacePath);
  const index = data.items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`Newsletter item not found: ${id}`);
  if (changes.status && !ITEM_STATUSES.has(changes.status)) throw new Error("status is not supported");
  if (changes.type && !ITEM_TYPES.has(changes.type)) throw new Error("type must be community_win or event");
  const allowed = ["month", "type", "title", "summary", "date", "time", "endTime", "sourceUrl", "personOrCompany", "location", "notes", "status", "verification"];
  const next = { ...data.items[index] };
  for (const key of allowed) {
    if (changes[key] !== undefined) next[key] = changes[key];
  }
  if (next.month) monthBounds(next.month);
  next.updatedAt = new Date().toISOString();
  data.items[index] = next;
  await writeInboxFile(target, data);
  return { savedTo: target, item: next };
}

function monthBounds(month) {
  const value = month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("month must use YYYY-MM format");
  const [year, number] = value.split("-").map(Number);
  return { value, start: new Date(Date.UTC(year, number - 1, 1)), end: new Date(Date.UTC(year, number, 1)) };
}

function isInside(dateValue, bounds) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return !Number.isNaN(date.valueOf()) && date >= bounds.start && date < bounds.end;
}

function findTyped(value, type, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) findTyped(item, type, found);
    return found;
  }
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.includes(type)) found.push(value);
  for (const child of Object.values(value)) findTyped(child, type, found);
  return found;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "VOLTA-Newsletter/0.1 (+https://voltaeffect.com)" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

export async function collectVoltaEvents(month) {
  const bounds = monthBounds(month);
  const url = "https://voltaeffect.com/events";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const events = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const data = JSON.parse($(element).text());
      for (const event of findTyped(data, "Event")) {
        if (!isInside(event.startDate, bounds)) continue;
        const location = typeof event.location === "string" ? event.location : event.location?.name || event.location?.address?.streetAddress || "VOLTA";
        events.push({
          title: event.name || "Untitled event",
          startDate: event.startDate,
          endDate: event.endDate || null,
          location,
          summary: event.description || "",
          url: typeof event.url === "string" ? event.url : url,
          source: url,
          verification: "first-party",
        });
      }
    } catch {
      // Ignore malformed structured data and continue with the other blocks.
    }
  });
  const unique = [...new Map(events.map((item) => [`${item.title}|${item.startDate}`, item])).values()]
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return { month: bounds.value, source: url, events: unique };
}

export async function collectVoltaStories(limit = 20) {
  const url = "https://voltaeffect.com/blog";
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const stories = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !/^\/(blog|news)\//.test(href)) return;
    const title = $(element).find("h1,h2,h3,h4").first().text().trim() || $(element).text().trim();
    if (!title) return;
    const containerText = $(element).closest("article,li,div").first().text().replace(/\s+/g, " ").trim();
    const dateMatch = containerText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}/i);
    stories.push({
      title,
      url: new URL(href, url).toString(),
      publishedDate: dateMatch?.[0] || null,
      excerpt: containerText.slice(0, 320),
      source: url,
      verification: "first-party",
    });
  });
  const unique = [...new Map(stories.map((item) => [item.url, item])).values()];
  return { source: url, stories: unique.slice(0, Math.max(1, Math.min(limit, 50))) };
}

export async function collectLinkedInMentions(month) {
  const bounds = monthBounds(month);
  const required = ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_URN", "LINKEDIN_VERSION"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    return {
      month: bounds.value,
      status: "setup_required",
      missing,
      note: "Use the manual LinkedIn queue and public discovery until approved organization API access is configured.",
      mentions: [],
    };
  }

  const endpoint = new URL("https://api.linkedin.com/rest/organizationalEntityNotifications");
  endpoint.searchParams.set("q", "criteria");
  endpoint.searchParams.set("actions", "List(SHARE_MENTION)");
  endpoint.searchParams.set("organizationalEntity", process.env.LINKEDIN_ORGANIZATION_URN);
  endpoint.searchParams.set("timeRange", `(start:${bounds.start.valueOf()},end:${bounds.end.valueOf()})`);
  const response = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
      "Linkedin-Version": process.env.LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.status || `LinkedIn returned ${response.status}`);
  return {
    month: bounds.value,
    status: "review_required",
    note: "LinkedIn notifications identify mention activity. Review the underlying post before using any claim.",
    mentions: data.elements || [],
    paging: data.paging || null,
  };
}

export async function readLinkedInQueue(queuePath) {
  const target = queuePath ? path.resolve(queuePath) : path.join(pluginRoot, "context", "linkedin-queue.json");
  const parsed = JSON.parse(await fs.readFile(target, "utf8"));
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items)) throw new Error("LinkedIn queue must contain an items array");
  return { source: target, status: items.length ? "review_required" : "empty", note: "Queue entries are leads, not verified claims. Confirm each source before publication.", items };
}

export async function renderNewsletterHtml(newsletter, outputPath) {
  const templatePath = path.join(pluginRoot, "assets", "email-template.hbs");
  const template = Handlebars.compile(await fs.readFile(templatePath, "utf8"));
  const html = template(newsletter, { allowProtoMethodsByDefault: false, allowProtoPropertiesByDefault: false });
  let savedTo = null;
  if (outputPath) {
    savedTo = path.resolve(outputPath);
    await fs.mkdir(path.dirname(savedTo), { recursive: true });
    await fs.writeFile(savedTo, html, "utf8");
  }
  return { html, savedTo };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "America/Halifax" }).format(new Date(Date.UTC(year, number - 1, 15)));
}

function displayEventDate(item) {
  if (!item.date) return item.time ? `Time: ${item.time}` : "Date to be confirmed";
  const date = new Date(`${item.date}T12:00:00Z`);
  const label = Number.isNaN(date.valueOf()) ? item.date : new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  if (!item.time) return label;
  return `${label} at ${item.time}${item.endTime ? `–${item.endTime}` : ""}`;
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function compactDate(date) {
  return String(date || "").replaceAll("-", "");
}

function compactDateTime(date, time) {
  return `${compactDate(date)}T${String(time).replace(":", "")}00`;
}

function clockToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) {
    hour %= 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function minutesToClock(value) {
  const minutes = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function eventTimes(item) {
  let start = item.time || null;
  let end = item.endTime || null;
  if (start && !end) {
    const range = String(start).split(/\s*[–—-]\s*/);
    if (range.length === 2) [start, end] = range;
  }
  const startMinutes = clockToMinutes(start);
  if (startMinutes === null) return { allDay: true, start: null, end: null, endDate: addDays(item.date, 1) };
  const endMinutes = clockToMinutes(end);
  const resolvedEnd = endMinutes === null ? startMinutes + 60 : endMinutes;
  return {
    allDay: false,
    start: minutesToClock(startMinutes),
    end: minutesToClock(resolvedEnd),
    endDate: resolvedEnd >= 1440 ? addDays(item.date, 1) : item.date,
  };
}

function calendarDetails(item) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) return {};
  const times = eventTimes(item);
  const eventUrl = item.sourceUrl || "https://voltaeffect.com/events";
  const description = `${item.summary}${eventUrl ? `\n\nEvent details: ${eventUrl}` : ""}`;
  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", item.title);
  google.searchParams.set("details", description);
  google.searchParams.set("location", item.location || "VOLTA, Halifax");
  google.searchParams.set("ctz", "America/Halifax");
  google.searchParams.set("dates", times.allDay
    ? `${compactDate(item.date)}/${compactDate(times.endDate)}`
    : `${compactDateTime(item.date, times.start)}/${compactDateTime(times.endDate, times.end)}`);
  const outlook = new URL("https://outlook.office.com/calendar/0/deeplink/compose");
  outlook.searchParams.set("path", "/calendar/action/compose");
  outlook.searchParams.set("rru", "addevent");
  outlook.searchParams.set("subject", item.title);
  outlook.searchParams.set("body", description);
  outlook.searchParams.set("location", item.location || "VOLTA, Halifax");
  outlook.searchParams.set("allday", String(times.allDay));
  outlook.searchParams.set("startdt", times.allDay ? item.date : `${item.date}T${times.start}:00`);
  outlook.searchParams.set("enddt", times.allDay ? times.endDate : `${times.endDate}T${times.end}:00`);
  return { googleCalendarUrl: google.toString(), outlookCalendarUrl: outlook.toString(), ...times };
}

function escapeIcs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([;,])/g, "\\$1");
}

function foldIcsLine(line) {
  const chunks = [];
  let remaining = line;
  while (Buffer.byteLength(remaining, "utf8") > 73) {
    let index = 1;
    while (index < remaining.length && Buffer.byteLength(remaining.slice(0, index + 1), "utf8") <= 73) index += 1;
    chunks.push(remaining.slice(0, index));
    remaining = remaining.slice(index);
  }
  chunks.push(remaining);
  return chunks.join("\r\n ");
}

function eventIcs(item) {
  const details = calendarDetails(item);
  if (!details.endDate) return null;
  const uidBase = item.id || `${item.title}-${item.date}`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VOLTA Halifax//Newsletter//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${escapeIcs(uidBase)}@voltaeffect.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    details.allDay ? `DTSTART;VALUE=DATE:${compactDate(item.date)}` : `DTSTART;TZID=America/Halifax:${compactDateTime(item.date, details.start)}`,
    details.allDay ? `DTEND;VALUE=DATE:${compactDate(details.endDate)}` : `DTEND;TZID=America/Halifax:${compactDateTime(details.endDate, details.end)}`,
    `SUMMARY:${escapeIcs(item.title)}`,
    `DESCRIPTION:${escapeIcs(`${item.summary}\n\nEvent details: ${item.sourceUrl || "https://voltaeffect.com/events"}`)}`,
    `LOCATION:${escapeIcs(item.location || "VOLTA, Halifax")}`,
    `URL:${escapeIcs(item.sourceUrl || "https://voltaeffect.com/events")}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ];
  return lines.map(foldIcsLine).join("\r\n");
}

function safeFileName(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "volta-event";
}

function addTrackingParameters(value, month) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return value;
    url.searchParams.set("utm_source", "volta_newsletter");
    url.searchParams.set("utm_medium", "email");
    url.searchParams.set("utm_campaign", month);
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeEngagementCta(input, month) {
  const value = input && typeof input === "object" ? input : {};
  const supportedTypes = new Set(["general", "reply", "event", "program", "survey", "custom"]);
  const type = supportedTypes.has(value.type) ? value.type : "reply";
  const destination = String(value.destination || (type === "reply" ? "contact@voltaeffect.com" : "https://voltaeffect.com/contact")).trim();
  let url = destination;
  if (type === "reply") {
    if (!/^mailto:/i.test(url) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) url = `mailto:${url}`;
    if (/^mailto:/i.test(url)) {
      const separator = url.includes("?") ? "&" : "?";
      if (!/[?&]subject=/i.test(url)) url += `${separator}subject=${encodeURIComponent(`Community update for ${monthLabel(month)}`)}`;
    }
  } else {
    url = addTrackingParameters(url, month);
  }
  return {
    enabled: value.enabled !== false,
    type,
    heading: String(value.heading || "What are you building?").trim(),
    body: String(value.body || "Have a launch, milestone, opportunity, or ask the VOLTA community should know about? Send us your update.").trim(),
    buttonLabel: String(value.buttonLabel || (type === "reply" ? "Share your update" : "Take action")).trim(),
    destination,
    url,
    deadline: String(value.deadline || "").trim() || null,
  };
}

export async function saveNewsletterDraft({ workspacePath, month, subjectLine, previewText, opening, engagementCta }) {
  const issueMonth = monthBounds(month).value;
  const listed = await listNewsletterItems({ workspacePath, month: issueMonth });
  const included = listed.items.filter((item) => item.status !== "excluded");
  const events = included.filter((item) => item.type === "event").sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  const wins = included.filter((item) => item.type === "community_win").slice(0, 2);
  const omittedWinCount = Math.max(0, included.filter((item) => item.type === "community_win").length - wins.length);
  const label = monthLabel(issueMonth);
  const safeOpening = String(opening || `Here is what is happening across the VOLTA community this ${label}.`).trim();
  const cta = normalizeEngagementCta(engagementCta ?? listed.settings?.engagementCta, issueMonth);
  const { target: inboxTarget, data: inboxData } = await readInboxFile(workspacePath);
  inboxData.issueSettings ||= {};
  inboxData.issueSettings[issueMonth] = {
    engagementCta: cta,
    draftSettings: {
      subjectLine: String(subjectLine || "").trim(),
      previewText: String(previewText || "").trim(),
      opening: safeOpening,
    },
  };
  await writeInboxFile(inboxTarget, inboxData);
  const newsletter = {
    monthLabel: label,
    title: subjectLine,
    preheader: previewText,
    openingHtml: safeOpening.split(/\n\s*\n/).map((paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join(""),
    events: events.map((item) => ({ title: item.title, date: displayEventDate(item), location: item.location || "VOLTA", summary: item.summary, url: addTrackingParameters(item.sourceUrl || "https://voltaeffect.com/events", issueMonth), ...calendarDetails(item) })),
    communityWins: wins.map((item) => ({ headline: item.title, summary: item.summary, url: addTrackingParameters(item.sourceUrl || "https://voltaeffect.com", issueMonth) })),
    callToAction: cta.enabled ? { heading: cta.heading, body: cta.body, url: cta.url, label: cta.buttonLabel, deadline: cta.deadline } : null,
  };
  const outputDirectory = path.join(path.resolve(workspacePath), "outputs", issueMonth);
  const htmlPath = path.join(outputDirectory, "volta-newsletter.html");
  const draftPath = path.join(outputDirectory, "volta-newsletter-draft.md");
  await fs.mkdir(outputDirectory, { recursive: true });
  const markdown = [
    `# ${subjectLine}`, ``, `**Preview text:** ${previewText}`, ``, safeOpening, ``, `## Community wins`, ``,
    ...(wins.length ? wins.flatMap((item) => [`### ${item.title}`, ``, item.summary, ``, item.sourceUrl ? `[Read the source](${item.sourceUrl})` : "", ``]) : ["_No community wins selected._", ""]),
    `## What’s happening at VOLTA`, ``,
    ...(events.length ? events.flatMap((item) => { const calendar = calendarDetails(item); return [`### ${item.title}`, ``, `**${displayEventDate(item)}${item.location ? ` · ${item.location}` : ""}**`, ``, item.summary, ``, item.sourceUrl ? `[Event details](${item.sourceUrl})` : "", calendar.googleCalendarUrl ? `[Add to Google Calendar](${calendar.googleCalendarUrl}) · [Add to Outlook](${calendar.outlookCalendarUrl})` : "", ``]; }) : ["_No events added yet._", ""]),
    ...(cta.enabled ? [`## ${cta.heading}`, ` `, cta.body, ` `, cta.deadline ? `**Deadline:** ${cta.deadline}` : "", `[${cta.buttonLabel}](${cta.url})`, ` `] : []),
    `---`, `VOLTA · 1800 Argyle Street, Suite 801, Halifax, NS B3J 3N8 · contact@voltaeffect.com`, ``,
  ].join("\n");
  await fs.writeFile(draftPath, markdown, "utf8");
  const rendered = await renderNewsletterHtml(newsletter, htmlPath);
  await recordNewsletterIssue({
    workspacePath, month: issueMonth, status: "drafted", draftPath, htmlPath,
    stories: wins.map((item) => ({ title: item.title, url: item.sourceUrl, verification: item.verification })),
  });
  return { month: issueMonth, draftPath, htmlPath, html: rendered.html, eventCount: events.length, communityWinCount: wins.length, omittedWinCount, engagementCta: cta };
}

export async function exportNewsletterPackage(input) {
  const saved = await saveNewsletterDraft(input);
  const listed = await listNewsletterItems({ workspacePath: input.workspacePath, month: saved.month });
  const included = listed.items.filter((item) => item.status !== "excluded");
  const events = included.filter((item) => item.type === "event").sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
  const wins = included.filter((item) => item.type === "community_win").slice(0, 2);
  const outputDirectory = path.dirname(saved.htmlPath);
  const textPath = path.join(outputDirectory, "volta-newsletter.txt");
  const handoffPath = path.join(outputDirectory, "mailchimp-copy.md");
  const manifestPath = path.join(outputDirectory, "newsletter-package.json");
  const calendarDirectory = path.join(outputDirectory, "calendar");
  await fs.mkdir(calendarDirectory, { recursive: true });
  const calendarFiles = [];
  for (const [index, item] of events.entries()) {
    const content = eventIcs(item);
    if (!content) continue;
    const target = path.join(calendarDirectory, `${String(index + 1).padStart(2, "0")}-${safeFileName(item.title)}.ics`);
    await fs.writeFile(target, content, "utf8");
    calendarFiles.push(target);
  }
  const text = [
    input.subjectLine,
    `Preview: ${input.previewText}`,
    "",
    input.opening,
    "",
    "COMMUNITY WINS",
    "",
    ...(wins.length ? wins.flatMap((item) => [
      item.title,
      item.summary,
      item.sourceUrl || "https://voltaeffect.com",
      "",
    ]) : ["No community wins selected.", ""]),
    "WHAT’S HAPPENING AT VOLTA",
    "",
    ...(events.length ? events.flatMap((item) => [
      item.title,
      `${displayEventDate(item)}${item.location ? ` · ${item.location}` : ""}`,
      item.summary,
      item.sourceUrl || "https://voltaeffect.com/events",
      ...(calendarDetails(item).googleCalendarUrl ? [`Google Calendar: ${calendarDetails(item).googleCalendarUrl}`, `Outlook Calendar: ${calendarDetails(item).outlookCalendarUrl}`] : []),
      "",
    ]) : ["No events added yet.", ""]),
    ...(saved.engagementCta.enabled ? [
      saved.engagementCta.heading,
      saved.engagementCta.body,
      ...(saved.engagementCta.deadline ? [`Deadline: ${saved.engagementCta.deadline}`] : []),
      `${saved.engagementCta.buttonLabel}: ${saved.engagementCta.url}`,
      "",
    ] : []),
    "VOLTA · 1800 Argyle Street, Suite 801, Halifax, NS B3J 3N8",
    "contact@voltaeffect.com · https://voltaeffect.com",
    "",
  ].join("\n");
  const handoff = [
    `# Mailchimp handoff — ${saved.month}`,
    "",
    `## Subject line\n\n${input.subjectLine}`,
    "",
    `## Preview text\n\n${input.previewText}`,
    "",
    `## Opening\n\n${input.opening}`,
    "",
    "## Community wins",
    "",
    ...(wins.length ? wins.flatMap((item, index) => [
      `### Community win ${index + 1}: ${item.title}`,
      "",
      `- Link: ${item.sourceUrl || "https://voltaeffect.com"}`,
      "",
      item.summary,
      "",
    ]) : ["_No community wins selected._", ""]),
    "## Events",
    "",
    ...(events.length ? events.flatMap((item, index) => [
      `### Event ${index + 1}: ${item.title}`,
      "",
      `- Date and time: ${displayEventDate(item)}`,
      `- Location: ${item.location || "VOLTA"}`,
      `- Link: ${item.sourceUrl || "https://voltaeffect.com/events"}`,
      ...(calendarDetails(item).googleCalendarUrl ? [`- Google Calendar: ${calendarDetails(item).googleCalendarUrl}`, `- Outlook Calendar: ${calendarDetails(item).outlookCalendarUrl}`] : []),
      "",
      item.summary,
      "",
    ]) : ["_No events added yet._", ""]),
    ...(saved.engagementCta.enabled ? [
      "## Community call to action",
      "",
      `- Type: ${saved.engagementCta.type}`,
      `- Heading: ${saved.engagementCta.heading}`,
      `- Button: ${saved.engagementCta.buttonLabel}`,
      `- Destination: ${saved.engagementCta.url}`,
      ...(saved.engagementCta.deadline ? [`- Deadline: ${saved.engagementCta.deadline}`] : []),
      "",
      saved.engagementCta.body,
      "",
    ] : []),
    "## Final review",
    "",
    "- Confirm every date, time, location, name, and link.",
    "- Send a Mailchimp test email before publishing.",
    "- Confirm the audience, subject line, preview text, unsubscribe link, and sender details.",
    "",
  ].join("\n");
  const manifest = {
    version: 1,
    month: saved.month,
    generatedAt: new Date().toISOString(),
    subjectLine: input.subjectLine,
    previewText: input.previewText,
    opening: input.opening,
    engagementCta: saved.engagementCta,
    events: events.map((item) => ({
      id: item.id, title: item.title, date: item.date, time: item.time, endTime: item.endTime, location: item.location,
      description: item.summary, link: item.sourceUrl, verification: item.verification, ...calendarDetails(item),
    })),
    communityWins: wins.map((item) => ({
      id: item.id, title: item.title, description: item.summary, link: item.sourceUrl, verification: item.verification,
    })),
    files: {
      editableMarkdown: saved.draftPath,
      emailHtml: saved.htmlPath,
      plainText: textPath,
      mailchimpCopy: handoffPath,
      calendarFiles,
    },
  };
  await Promise.all([
    fs.writeFile(textPath, text, "utf8"),
    fs.writeFile(handoffPath, handoff, "utf8"),
    fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
  ]);
  return {
    month: saved.month,
    packageDirectory: outputDirectory,
    files: { markdown: saved.draftPath, html: saved.htmlPath, plainText: textPath, mailchimpCopy: handoffPath, manifest: manifestPath, calendarFiles },
    eventCount: events.length,
    communityWinCount: wins.length,
    copyText: text,
  };
}

function mailchimpConfig() {
  const required = ["MAILCHIMP_API_KEY", "MAILCHIMP_SERVER_PREFIX", "MAILCHIMP_LIST_ID"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing Mailchimp settings: ${missing.join(", ")}`);
  return {
    apiKey: process.env.MAILCHIMP_API_KEY,
    prefix: process.env.MAILCHIMP_SERVER_PREFIX,
    listId: process.env.MAILCHIMP_LIST_ID,
    fromName: process.env.MAILCHIMP_FROM_NAME || "VOLTA",
    replyTo: process.env.MAILCHIMP_REPLY_TO || "contact@voltaeffect.com",
  };
}

export function getMailchimpSetupStatus() {
  const names = ["MAILCHIMP_API_KEY", "MAILCHIMP_SERVER_PREFIX", "MAILCHIMP_LIST_ID"];
  const missing = names.filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}

async function mailchimpRequest(config, method, endpoint, body) {
  const response = await fetch(`https://${config.prefix}.api.mailchimp.com/3.0${endpoint}`, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`volta:${config.apiKey}`).toString("base64")}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.title || `Mailchimp returned ${response.status}`);
  return data;
}

export async function createMailchimpDraft({ title, subjectLine, previewText, html }) {
  const config = mailchimpConfig();
  const campaign = await mailchimpRequest(config, "POST", "/campaigns", {
    type: "regular",
    recipients: { list_id: config.listId },
    settings: { title, subject_line: subjectLine, preview_text: previewText || "", from_name: config.fromName, reply_to: config.replyTo },
  });
  await mailchimpRequest(config, "PUT", `/campaigns/${campaign.id}/content`, { html });
  return { id: campaign.id, status: "save", webId: campaign.web_id || null, note: "Draft created. It has not been sent or scheduled." };
}

export async function createMailchimpDraftFromStudio(input) {
  const saved = await saveNewsletterDraft(input);
  const campaign = await createMailchimpDraft({
    title: `VOLTA Newsletter — ${saved.month}`,
    subjectLine: input.subjectLine,
    previewText: input.previewText,
    html: saved.html,
  });
  const listed = await listNewsletterItems({ workspacePath: input.workspacePath, month: saved.month });
  const stories = listed.items
    .filter((item) => item.status !== "excluded" && item.type === "community_win")
    .slice(0, 2)
    .map((item) => ({ title: item.title, url: item.sourceUrl, verification: item.verification }));
  await recordNewsletterIssue({
    workspacePath: input.workspacePath,
    month: saved.month,
    status: "mailchimp_draft",
    draftPath: saved.draftPath,
    htmlPath: saved.htmlPath,
    stories,
  });
  return {
    campaignId: campaign.id,
    webId: campaign.webId,
    status: "mailchimp_draft",
    draftPath: saved.draftPath,
    htmlPath: saved.htmlPath,
    note: "The latest studio content was uploaded to Mailchimp as an unsent draft.",
  };
}
