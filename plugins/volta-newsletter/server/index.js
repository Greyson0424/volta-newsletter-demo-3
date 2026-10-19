import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addNewsletterItem, collectLinkedInMentions, collectVoltaEvents, collectVoltaStories, createMailchimpDraft, createMailchimpDraftFromStudio, discoverEventImage, exportNewsletterPackage, listNewsletterItems, readLinkedInQueue, readNewsletterMemory, recordNewsletterIssue, renderNewsletterHtml, saveNewsletterDraft, syncNewsletterEvents, updateNewsletterItem } from "./core.js";

const server = new McpServer(
  { name: "volta-newsletter", version: "0.4.0" },
  { instructions: "Collect sourced VOLTA material and generate reviewable newsletter drafts. Never send or schedule email. Create an unsent Mailchimp draft only after explicit user approval." },
);
const asText = (value, summary) => ({ structuredContent: value, content: [{ type: "text", text: summary || JSON.stringify(value, null, 2) }] });
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("Issue month in YYYY-MM format");
const here = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_URI = "ui://volta-newsletter/studio-v10.html";
const imageValueSchema = z.string().max(8_000_000).refine((value) => /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value) || /^https:\/\//i.test(value), "Image must be an HTTPS URL or uploaded image");
const engagementCtaSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.enum(["general", "reply", "event", "program", "survey", "custom"]).default("reply"),
  heading: z.string().min(1).max(120),
  body: z.string().min(1).max(600),
  buttonLabel: z.string().min(1).max(50),
  destination: z.string().min(1).max(500),
  deadline: z.string().max(50).optional(),
});

server.registerResource("volta-newsletter-studio", STUDIO_URI, {
  title: "VOLTA Newsletter Studio",
  description: "Editable monthly newsletter intake and preview workspace.",
  mimeType: "text/html;profile=mcp-app",
}, async () => ({ contents: [{
  uri: STUDIO_URI,
  mimeType: "text/html;profile=mcp-app",
  text: await fs.readFile(path.resolve(here, "../assets/newsletter-studio.html"), "utf8"),
  _meta: { ui: { prefersBorder: false } },
}] }));

server.registerTool("add_newsletter_item", {
  description: "Save a community win or event from Slack, LinkedIn, a 1:1 conversation, or manual entry into the reviewable newsletter inbox.",
  inputSchema: {
    workspacePath: z.string().min(1), month: monthSchema, type: z.enum(["community_win", "event", "past_event"]),
    title: z.string().min(1), summary: z.string().min(1), date: z.string().optional(), time: z.string().optional(), endTime: z.string().optional(),
    source: z.enum(["manual", "slack", "linkedin", "one_to_one", "volta_website", "eventbrite"]), sourceUrl: z.string().url().optional(),
    personOrCompany: z.string().optional(), location: z.string().optional(), notes: z.string().optional(),
    imageUrl: imageValueSchema.optional(), imageAlt: z.string().max(240).optional(), imageSource: z.enum(["eventbrite", "upload", "manual_url"]).optional(),
    status: z.enum(["candidate", "approved", "excluded"]).default("candidate"),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => asText(await addNewsletterItem(input)));

server.registerTool("list_newsletter_items", {
  description: "List saved newsletter inbox items, optionally filtered by issue month or review status.",
  inputSchema: { workspacePath: z.string().min(1), month: monthSchema.optional(), status: z.enum(["candidate", "approved", "excluded"]).optional() },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async (input) => asText(await listNewsletterItems(input)));

server.registerTool("update_newsletter_item", {
  description: "Edit, approve, or exclude a saved newsletter inbox item before rendering the draft.",
  inputSchema: {
    workspacePath: z.string().min(1), id: z.string().uuid(),
    changes: z.object({
      month: monthSchema.optional(), type: z.enum(["community_win", "event", "past_event"]).optional(), title: z.string().min(1).optional(), summary: z.string().min(1).optional(), date: z.string().nullable().optional(), time: z.string().nullable().optional(), endTime: z.string().nullable().optional(),
      sourceUrl: z.string().url().nullable().optional(), personOrCompany: z.string().nullable().optional(), location: z.string().nullable().optional(),
      imageUrl: imageValueSchema.nullable().optional(), imageAlt: z.string().max(240).nullable().optional(), imageSource: z.enum(["eventbrite", "upload", "manual_url"]).nullable().optional(),
      notes: z.string().nullable().optional(), status: z.enum(["candidate", "approved", "excluded"]).optional(),
      verification: z.enum(["needs_confirmation", "source_supplied", "verified"]).optional(),
    }).refine((value) => Object.keys(value).length > 0, "At least one change is required"),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => asText(await updateNewsletterItem(input)));

server.registerTool("discover_event_image", {
  title: "Find Eventbrite event image",
  description: "Read public Eventbrite page metadata and return image candidates for review in Newsletter Studio. This does not bypass access controls.",
  inputSchema: { sourceUrl: z.string().url() },
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
}, async (input) => asText(await discoverEventImage(input)));

server.registerTool("open_newsletter_studio", {
  title: "Open VOLTA Newsletter Studio",
  description: "Required visual editor for every newsletter request. Render the interactive VOLTA Newsletter Studio after collecting source material so the user can add, edit, remove, preview, save, and export without managing content through chat. Do not substitute opening Markdown or HTML files.",
  inputSchema: { workspacePath: z.string().min(1), month: monthSchema },
  outputSchema: { workspacePath: z.string(), month: monthSchema, items: z.array(z.unknown()), settings: z.unknown().nullable().optional() },
  _meta: {
    ui: { resourceUri: STUDIO_URI },
    "openai/outputTemplate": STUDIO_URI,
    "openai/toolInvocation/invoking": "Opening Newsletter Studio…",
    "openai/toolInvocation/invoked": "Newsletter Studio is ready.",
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ workspacePath, month }) => {
  const listed = await listNewsletterItems({ workspacePath, month });
  return asText(
    { workspacePath: path.resolve(workspacePath), month, items: listed.items, settings: listed.settings },
    `Newsletter Studio is ready for ${month}. Edit the newsletter in the interactive panel.`,
  );
});

server.registerTool("save_newsletter_draft", {
  title: "Save VOLTA newsletter draft",
  description: "Regenerate editable Markdown and branded HTML from all current non-excluded studio items. Community updates appear first; dated events receive Google and Outlook calendar links.",
  inputSchema: {
    workspacePath: z.string().min(1), month: monthSchema,
    subjectLine: z.string().min(1).max(100), previewText: z.string().max(160).default(""), greeting: z.string().max(120).optional(), opening: z.string().min(1).max(2000),
    engagementCta: engagementCtaSchema.optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => {
  const result = await saveNewsletterDraft(input);
  return asText(result, `Saved the ${result.month} newsletter draft with ${result.eventCount} events and ${result.communityWinCount} community wins.`);
});

server.registerTool("export_newsletter_package", {
  title: "Export for Mailchimp",
  description: "Create a Mailchimp-ready handoff containing editable Markdown, email-safe HTML, plain text, section copy, structured JSON, a Mailchimp ZIP with selected images, and one ICS file per dated event.",
  inputSchema: {
    workspacePath: z.string().min(1), month: monthSchema,
    subjectLine: z.string().min(1).max(100), previewText: z.string().max(160).default(""), greeting: z.string().max(120).optional(), opening: z.string().min(1).max(2000),
    engagementCta: engagementCtaSchema.optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => {
  const result = await exportNewsletterPackage(input);
  return asText(result, `Exported the ${result.month} newsletter package. The editable files, Mailchimp handoff, and calendar files are ready.`);
});

server.registerTool("create_mailchimp_draft_from_studio", {
  title: "Create Mailchimp draft from Newsletter Studio",
  description: "Regenerate the current studio content and upload it to Mailchimp as an unsent campaign draft. This tool cannot send or schedule email and requires an explicit user click or request.",
  inputSchema: {
    workspacePath: z.string().min(1), month: monthSchema,
    subjectLine: z.string().min(1).max(100), previewText: z.string().max(160).default(""), greeting: z.string().max(120).optional(), opening: z.string().min(1).max(2000),
    engagementCta: engagementCtaSchema.optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
}, async (input) => {
  const result = await createMailchimpDraftFromStudio(input);
  return asText(result, `Created unsent Mailchimp draft ${result.campaignId} for ${result.month}.`);
});

server.registerTool("read_newsletter_memory", {
  description: "Read the durable issue and story ledger before drafting so previously covered stories can be identified.",
  inputSchema: { workspacePath: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ workspacePath }) => asText(await readNewsletterMemory(workspacePath)));

server.registerTool("record_newsletter_issue", {
  description: "Create or update one monthly issue entry in memory.md after drafting, creating a Mailchimp draft, or receiving confirmation that the issue was sent.",
  inputSchema: {
    workspacePath: z.string().min(1), month: monthSchema,
    status: z.enum(["drafted", "mailchimp_draft", "sent"]),
    draftPath: z.string().optional(), htmlPath: z.string().optional(),
    stories: z.array(z.object({
      title: z.string().min(1), url: z.string().url().nullable().optional(), verification: z.string().optional(),
    })).default([]),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => asText(await recordNewsletterIssue(input)));

server.registerTool("collect_volta_events", {
  description: "Collect one calendar month of events from VOLTA's first-party events page, then supplement missing Volta-hosted listings from public Eventbrite structured data.",
  inputSchema: { month: monthSchema },
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
}, async ({ month }) => asText(await collectVoltaEvents(month)));

server.registerTool("sync_newsletter_events", {
  title: "Refresh monthly VOLTA events",
  description: "Automatically add verified monthly events from VOLTA's events page and public Eventbrite fallback to the editable inbox. Existing and excluded items are preserved so user edits are never overwritten.",
  inputSchema: { workspacePath: z.string().min(1), month: monthSchema },
  annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
}, async (input) => {
  const result = await syncNewsletterEvents(input);
  return asText(result, `Added ${result.addedCount} monthly events and preserved ${result.preservedCount} existing edited events.`);
});

server.registerTool("collect_volta_stories", {
  description: "Collect recent first-party story candidates from VOLTA's public blog.",
  inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
  annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
}, async ({ limit }) => asText(await collectVoltaStories(limit)));

server.registerTool("collect_linkedin_mentions", {
  description: "Collect VOLTA organization SHARE_MENTION notifications through LinkedIn's approved API. Returns setup guidance instead of scraping when credentials are missing.",
  inputSchema: { month: monthSchema },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ month }) => asText(await collectLinkedInMentions(month)));

server.registerTool("read_linkedin_queue", {
  description: "Read manually supplied LinkedIn story leads. Entries remain unverified until their sources are reviewed.",
  inputSchema: { queuePath: z.string().optional() },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ queuePath }) => asText(await readLinkedInQueue(queuePath)));

const contentImageSchema = { imageUrl: imageValueSchema.nullable().optional(), imageAlt: z.string().optional(), imageSource: z.enum(["eventbrite", "upload", "manual_url"]).nullable().optional(), hasImage: z.boolean().optional() };
const winSchema = z.object({ headline: z.string(), summary: z.string(), url: z.string().url(), ...contentImageSchema });
const eventSchema = z.object({
  title: z.string(), date: z.string(), location: z.string().optional(), summary: z.string(), url: z.string().url(),
  googleCalendarUrl: z.string().url().optional(), outlookCalendarUrl: z.string().url().optional(),
  ...contentImageSchema,
});
const newsletterSchema = z.object({
  monthLabel: z.string(), title: z.string(), preheader: z.string(), greeting: z.string().optional(), readingMinutes: z.number().int().positive().optional(), openingHtml: z.string(),
  communityWins: z.array(winSchema).default([]), events: z.array(eventSchema).default([]), pastEvents: z.array(eventSchema).default([]),
  callToAction: z.object({ heading: z.string(), body: z.string(), url: z.string(), label: z.string(), deadline: z.string().nullable().optional() }).nullable().optional(),
});

server.registerTool("render_newsletter_html", {
  description: "Render structured newsletter content into VOLTA-branded, Mailchimp-ready HTML and optionally save it locally.",
  inputSchema: { newsletter: newsletterSchema, outputPath: z.string().optional() },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async ({ newsletter, outputPath }) => {
  const result = await renderNewsletterHtml(newsletter, outputPath);
  return asText({ savedTo: result.savedTo, html: result.html }, result.savedTo ? `Rendered newsletter HTML to ${result.savedTo}.` : "Rendered newsletter HTML.");
});

server.registerTool("create_mailchimp_draft", {
  description: "Create an unsent Mailchimp campaign draft with supplied HTML. This tool cannot send or schedule campaigns.",
  inputSchema: { title: z.string().min(1), subjectLine: z.string().min(1), previewText: z.string().default(""), html: z.string().min(1) },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => asText(await createMailchimpDraft(input)));

await server.connect(new StdioServerTransport());
