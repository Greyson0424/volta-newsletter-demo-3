import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { addNewsletterItem, collectLinkedInMentions, exportNewsletterPackage, extractEventbriteImageCandidates, extractMonthlyEventsFromHtml, getMailchimpSetupStatus, listNewsletterItems, readLinkedInQueue, readNewsletterMemory, recordNewsletterIssue, renderNewsletterHtml, saveNewsletterDraft, syncNewsletterEvents, updateNewsletterItem } from "./core.js";

test("renders branded HTML and contact footer", async () => {
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "volta-newsletter-")), "issue.html");
  const result = await renderNewsletterHtml({
    monthLabel: "September 2026", title: "What's building this month", preheader: "VOLTA community news and events.",
    greeting: "Hi Network Members,", readingMinutes: 2, openingHtml: "<p>Welcome to the monthly update.</p>",
    communityWins: [{ headline: "A community win", summary: "A verified result.", url: "https://voltaeffect.com/blog" }],
    events: [{ title: "Founder meetup", date: "September 24", location: "VOLTA", summary: "Meet fellow builders.", url: "https://voltaeffect.com/events" }],
    callToAction: { heading: "Join us", body: "See what's next.", url: "https://voltaeffect.com/events", label: "View events" },
  }, target);
  assert.equal(result.savedTo, target);
  assert.match(result.html, /linear-gradient/i);
  assert.match(result.html, /1800 Argyle Street/);
  assert.match(result.html, /\*\|UNSUB\|\*/);
});

test("reads an empty LinkedIn review queue", async () => {
  const target = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "volta-queue-")), "queue.json");
  await fs.writeFile(target, '{"items":[]}', "utf8");
  const result = await readLinkedInQueue(target);
  assert.equal(result.status, "empty");
  assert.deepEqual(result.items, []);
});

test("LinkedIn collection degrades safely without credentials", async () => {
  const result = await collectLinkedInMentions("2026-09");
  assert.equal(result.status, "setup_required");
  assert.ok(result.missing.includes("LINKEDIN_ACCESS_TOKEN"));
  assert.deepEqual(result.mentions, []);
});

test("adds, lists, and edits a manual newsletter item", async () => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "volta-inbox-"));
  const added = await addNewsletterItem({
    workspacePath, month: "2026-09", type: "community_win", title: "Member milestone",
    summary: "A milestone shared in a founder conversation.", source: "one_to_one",
  });
  assert.equal(added.item.verification, "needs_confirmation");
  const listed = await listNewsletterItems({ workspacePath, month: "2026-09" });
  assert.equal(listed.count, 1);
  const updated = await updateNewsletterItem({ workspacePath, id: added.item.id, changes: { status: "approved", verification: "verified" } });
  assert.equal(updated.item.status, "approved");
  assert.equal(updated.item.verification, "verified");
});

test("records issue memory idempotently for story deduplication", async () => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "volta-memory-"));
  const input = {
    workspacePath, month: "2026-09", status: "drafted",
    draftPath: "outputs/2026-09/volta-newsletter-draft.md",
    htmlPath: "outputs/2026-09/volta-newsletter.html",
    stories: [{ title: "A member launch", url: "https://example.com/launch", verification: "first-party" }],
  };
  await recordNewsletterIssue(input);
  await recordNewsletterIssue({ ...input, status: "sent" });
  const memory = await readNewsletterMemory(workspacePath);
  assert.equal((memory.content.match(/<!-- issue:2026-09:start -->/g) || []).length, 1);
  assert.match(memory.content, /Status: \*\*sent\*\*/);
  assert.match(memory.content, /https:\/\/example\.com\/launch/);
});

test("studio draft puts every community update before events", async () => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "volta-studio-"));
  for (const [index, title] of ["First win", "Second win", "Third win"].entries()) {
    await addNewsletterItem({ workspacePath, month: "2026-09", type: "community_win", title, summary: `Win ${index + 1}`, source: "manual", sourceUrl: `https://example.com/win-${index + 1}` });
  }
  await addNewsletterItem({
    workspacePath, month: "2026-09", type: "event", title: "Demo Day", summary: "Meet the founders.",
    source: "manual", sourceUrl: "https://example.com/demo", date: "2026-09-28", time: "17:30", location: "VOLTA",
    endTime: "19:00",
  });
  const result = await saveNewsletterDraft({
    workspacePath, month: "2026-09", subjectLine: "September at VOLTA",
    previewText: "Events and community news.", opening: "Welcome to this month’s update.",
    engagementCta: {
      enabled: true, type: "program", heading: "Apply to the next cohort", body: "Build with VOLTA.",
      buttonLabel: "Apply now", destination: "https://voltaeffect.com/programs?ref=studio", deadline: "2026-09-30",
    },
  });
  assert.equal(result.eventCount, 1);
  assert.equal(result.communityWinCount, 3);
  assert.equal(result.omittedWinCount, 0);
  const html = await fs.readFile(result.htmlPath, "utf8");
  assert.ok(html.indexOf("Community updates &amp; opportunities") < html.indexOf("Events &amp; Networking Opportunities"));
  assert.match(html, /September 28, 2026 at 17:30/);
  assert.match(html, /Google Calendar/);
  assert.match(html, /Outlook Calendar/);
  assert.match(html, /Apply to the next cohort/);
  assert.match(html, /Deadline: 2026-09-30/);
  assert.match(html, /utm_source/);
  assert.match(html, /utm_campaign/);
  assert.match(html, /Third win/);
  const markdown = await fs.readFile(result.draftPath, "utf8");
  assert.ok(markdown.indexOf("## Community updates") < markdown.indexOf("## What’s happening at VOLTA"));
  const reopened = await listNewsletterItems({ workspacePath, month: "2026-09" });
  assert.equal(reopened.settings.engagementCta.heading, "Apply to the next cohort");
  assert.equal(reopened.settings.engagementCta.destination, "https://voltaeffect.com/programs?ref=studio");
  assert.equal(reopened.settings.draftSettings.subjectLine, "September at VOLTA");
  assert.equal(reopened.settings.draftSettings.previewText, "Events and community news.");
  assert.equal(reopened.settings.draftSettings.opening, "Welcome to this month’s update.");
});

test("Mailchimp setup status reports names without exposing values", () => {
  const names = ["MAILCHIMP_API_KEY", "MAILCHIMP_SERVER_PREFIX", "MAILCHIMP_LIST_ID"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const status = getMailchimpSetupStatus();
    assert.equal(status.configured, false);
    assert.deepEqual(status.missing, names);
    assert.doesNotMatch(JSON.stringify(status), /secret|api-key-value/i);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("extracts the preferred public Eventbrite image from structured metadata", () => {
  const html = '<html><head><meta property="og:image" content="https://example.com/fallback.jpg"><script type="application/ld+json">{"@type":"Event","image":["https://img.evbuc.com/preferred.jpg"]}</script></head></html>';
  assert.deepEqual(extractEventbriteImageCandidates(html), ["https://img.evbuc.com/preferred.jpg", "https://example.com/fallback.jpg"]);
});

test("extracts only same-month Volta-location Eventbrite fallback events", () => {
  const html = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[
    {"item":{"@type":"Event","name":"Builder Night","description":"Build and connect.","startDate":"2026-10-22","image":"https://img.evbuc.com/builder.jpg","url":"https://www.eventbrite.ca/e/builder-night-1","location":{"name":"Volta"}}},
    {"item":{"@type":"Event","name":"Other Venue","startDate":"2026-10-23","url":"https://www.eventbrite.ca/e/other-2","location":{"name":"Elsewhere"}}},
    {"item":{"@type":"Event","name":"Next Month","startDate":"2026-11-01","url":"https://www.eventbrite.ca/e/next-3","location":{"name":"Volta"}}}
  ]}</script>`;
  const events = extractMonthlyEventsFromHtml(html, { month: "2026-10", sourcePage: "https://www.eventbrite.ca/d/canada--halifax/volta/", verification: "public-eventbrite", requireVoltaLocation: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Builder Night");
  assert.equal(events[0].summary, "Build and connect.");
  assert.equal(events[0].imageSource, "eventbrite");
});

test("monthly event sync adds new events without overwriting edits", async () => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "volta-sync-"));
  await addNewsletterItem({ workspacePath, month: "2026-10", type: "event", title: "Vibe Coding Meetup", summary: "My edited description.", source: "manual", sourceUrl: "https://www.eventbrite.ca/e/vibe-coding-1?aff=test", date: "2026-10-19" });
  const result = await syncNewsletterEvents({ workspacePath, month: "2026-10", collectedEvents: [
    { title: "Vibe Coding Meetup", summary: "Automatic description.", startDate: "2026-10-19T21:00:00Z", url: "https://www.eventbrite.ca/e/vibe-coding-1", location: "Volta", verification: "first-party" },
    { title: "AI Mixer", summary: "Meet builders using AI.", startDate: "2026-10-28T21:00:00Z", endDate: "2026-10-28T23:00:00Z", url: "https://www.eventbrite.ca/e/ai-mixer-2", location: "Volta", verification: "public-eventbrite", imageUrl: "https://img.evbuc.com/ai.jpg", imageSource: "eventbrite" },
  ] });
  assert.equal(result.addedCount, 1);
  assert.equal(result.preservedCount, 1);
  const listed = await listNewsletterItems({ workspacePath, month: "2026-10" });
  assert.equal(listed.items.find((item) => item.title === "Vibe Coding Meetup").summary, "My edited description.");
  const mixer = listed.items.find((item) => item.title === "AI Mixer");
  assert.equal(mixer.summary, "Meet builders using AI.");
  assert.equal(mixer.time, "18:00");
  assert.equal(mixer.source, "eventbrite");
});

test("exports a complete provider-independent handoff package", async () => {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "volta-export-"));
  await addNewsletterItem({
    workspacePath, month: "2026-09", type: "event", title: "Founder Friday",
    summary: "A practical founder gathering.", source: "manual", sourceUrl: "https://example.com/founder-friday",
    date: "2026-09-25", time: "09:00", endTime: "10:30", location: "VOLTA",
    imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", imageAlt: "Founder Friday event", imageSource: "upload",
  });
  await addNewsletterItem({
    workspacePath, month: "2026-09", type: "community_win", title: "Member launch",
    summary: "A verified product launch.", source: "manual", sourceUrl: "https://example.com/member-launch",
  });
  const result = await exportNewsletterPackage({
    workspacePath, month: "2026-09", subjectLine: "September at VOLTA",
    previewText: "Events and community momentum.", opening: "Welcome to the monthly update.",
    engagementCta: {
      enabled: true, type: "reply", heading: "Share your win", body: "Tell VOLTA what you shipped.",
      buttonLabel: "Email VOLTA", destination: "wins@voltaeffect.com",
    },
  });
  assert.equal(result.eventCount, 1);
  assert.equal(result.communityWinCount, 1);
  for (const file of Object.values(result.files).flat()) await fs.access(file);
  const handoff = await fs.readFile(result.files.mailchimpCopy, "utf8");
  assert.match(handoff, /## Subject line/);
  assert.match(handoff, /Founder Friday/);
  assert.match(handoff, /Member launch/);
  assert.ok(handoff.indexOf("## Community updates") < handoff.indexOf("## Events"));
  const manifest = JSON.parse(await fs.readFile(result.files.manifest, "utf8"));
  assert.equal(manifest.events[0].time, "09:00");
  assert.equal(manifest.events[0].endTime, "10:30");
  assert.match(manifest.events[0].googleCalendarUrl, /^https:\/\/calendar\.google\.com\//);
  assert.match(manifest.events[0].outlookCalendarUrl, /^https:\/\/outlook\.office\.com\//);
  assert.equal(manifest.communityWins.length, 1);
  assert.equal(manifest.engagementCta.type, "reply");
  assert.match(manifest.engagementCta.url, /^mailto:wins@voltaeffect\.com\?subject=/);
  assert.match(handoff, /## Community call to action/);
  assert.equal(result.files.calendarFiles.length, 1);
  const archive = await JSZip.loadAsync(await fs.readFile(result.files.mailchimpZip));
  assert.ok(archive.file("volta-newsletter.html"));
  assert.ok(Object.keys(archive.files).some((name) => name.startsWith("images/")));
  const calendar = await fs.readFile(result.files.calendarFiles[0], "utf8");
  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /DTSTART;TZID=America\/Halifax:20260925T090000/);
  assert.match(calendar, /DTEND;TZID=America\/Halifax:20260925T103000/);
  assert.match(calendar, /SUMMARY:Founder Friday/);
});
