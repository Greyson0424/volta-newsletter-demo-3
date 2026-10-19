---
name: volta-newsletter
description: Run the VOLTA Halifax newsletter workflow when the user says newsletter, newsletter draft, monthly newsletter, add community win, add event, or asks to prepare a member update. Capture leads, gather verified events and community wins, retain sources, render branded HTML, and create only an unsent Mailchimp draft when explicitly requested.
---

# VOLTA newsletter

Create a reviewable monthly newsletter grounded in current sources.

## Context routing

- Read `../../context/brand.md` whenever producing or revising HTML.
- Read `../../context/editorial.md` whenever drafting or editing newsletter copy.
- Read `../../context/sources.md` whenever collecting or evaluating stories.
- Read `../../context/source-config.json` whenever collecting Slack, LinkedIn, or manual inbox material.
- Read `../../context/linkedin-queue.json` only when reviewing submitted LinkedIn leads.

## Conversational intake

- Treat `add community win: ...`, `add event: ...`, and `add past event: ...` as intake commands. Extract the supplied details and call `add_newsletter_item` with the current workspace path. Ask only for a genuinely required missing title or summary.
- Use source `slack` or `linkedin` when a permalink is supplied, `one_to_one` for conversation notes, and `manual` otherwise.
- A saved item is a candidate, not automatically publishable. Items without a source URL and all 1:1 notes require confirmation.
- When the user asks to edit, approve, or remove an item, find it with `list_newsletter_items` and call `update_newsletter_item`. Removal means status `excluded`; preserve the record and provenance.
- After changing an item while an issue draft exists, regenerate both Markdown and HTML for that issue.

## Draft workflow

1. Resolve the issue month. Use the current month in `America/Halifax` when none is specified.
2. Call `read_newsletter_memory` before collection. Match candidates against prior canonical URLs and normalized story titles. Exclude stories in an issue marked `sent` unless the user approves a materially new update. Flag matches from `drafted` or `mailchimp_draft` issues for review because they may not have shipped.
3. Call `collect_volta_events` for the issue month, `collect_volta_stories` for recent community material, and `list_newsletter_items` for the issue month.
4. If the Slack plugin is connected, search the configured channels for the selected month plus the preceding 45 days. Look for concrete launches, funding, awards, hires, partnerships, customer milestones, and measurable progress. Retain the Slack permalink and author; treat each result as a lead until confirmed. If Slack is not connected, continue without blocking the draft and state that Slack discovery was skipped.
5. Call `collect_linkedin_mentions` when the approved LinkedIn organization connection is configured, then call `read_linkedin_queue`. When credentials are unavailable, use supplied public post URLs and public web discovery without scraping authenticated pages. Label incomplete discoveries for review.
6. Remove duplicates across memory, the inbox, Slack, LinkedIn, VOLTA pages, and blog. Prefer first-party sources, current dates, concrete outcomes, and named people or organizations. Do not invent a win from promotional language.
7. Draft immediately; do not pause to ask whether the user has more items. Display Community Updates above Events and retain every verified update the user selects; there is no item cap. Aim for four to eight verified upcoming events when available. Include a Past Events Roundup only when recap items are present. Do not add a news-articles section. Put uncertain items in the review checklist instead of publishing them as facts.
8. Save editable Markdown as `outputs/<YYYY-MM>/volta-newsletter-draft.md`.
9. Call `render_newsletter_html` with the structured issue and save `outputs/<YYYY-MM>/volta-newsletter.html`.
10. Call `record_newsletter_issue` with status `drafted`, both output paths, and every retained community story. This creates or replaces the month's section in `memory.md`.
11. **Required UI step:** provide Newsletter Studio as the editing surface. In Codex, call `open_newsletter_studio` with the workspace path and issue month. In Claude Code or Cursor, or if the MCP App resource does not render, run `npm run studio --prefix plugins/volta-newsletter` and provide `http://127.0.0.1:4173`. All additions, edits, removals, photo selection, Community Call to Action settings, previewing, saving, and exporting happen through the Studio controls without further chat prompts. Use its Editor, Split, and Preview modes to keep fields comfortable in narrow windows.
12. Do not open the Markdown or HTML output as a substitute for Newsletter Studio. Those files are exports only. If neither embedded nor standalone Studio loads, diagnose the MCP or local server configuration and clearly report the failure.

Report missing facts, memory matches, and excluded or unverified items briefly beside the rendered editor. Prompt-based intake remains an optional fallback only when the user explicitly chooses it.

## Export and delivery

Use `discover_event_image` to read a public Eventbrite page's structured metadata when the user wants its event image. Treat the result as a suggestion: the Studio must allow a replacement URL, local image upload, or removal. Never bypass access controls. Keep descriptive alt text with every selected image.

Use `export_newsletter_package` when the user selects **Export for Mailchimp** or requests a handoff. It creates editable Markdown, email-safe HTML, plain text, section-by-section Mailchimp copy, structured JSON, a Mailchimp ZIP containing uploaded and available Eventbrite images, and one .ics file per dated event under the month's output directory. Dated events also receive Google and Outlook calendar links. The Studio's copy controls remain available for teams using a native email builder. An .ics file must be uploaded to a public site or Mailchimp Content Studio before it can be used as a subscriber-facing download link.

Use one focused Community Call to Action per issue. It may invite a reply, registration, application, survey response, or custom action. Reply actions may use an email address and are rendered as a prefilled `mailto:` link. Eligible web CTA, event, and community-win links receive `utm_source=volta_newsletter`, `utm_medium=email`, and the issue month as `utm_campaign` in rendered subscriber HTML. Preserve the original source URLs in the inbox and provenance records.

The ordinary words `newsletter` and `newsletter draft` authorize local drafting only. Direct Mailchimp integration is optional and hidden from the default studio. Call `create_mailchimp_draft` or `create_mailchimp_draft_from_studio` only after the user explicitly asks to activate or use that integration. These tools create an unsent draft; never invent credentials and never send or schedule a campaign.

When the user explicitly asks for a Mailchimp draft, use the latest rendered HTML and create it directly. Return the Mailchimp campaign identifier and confirm that it remains unsent. Final sending stays in Mailchimp.

After creating the Mailchimp draft, update the issue memory status to `mailchimp_draft`. Only update it to `sent` when the user explicitly confirms that the campaign was sent.

Use these environment variables for Mailchimp: `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX`, `MAILCHIMP_LIST_ID`, `MAILCHIMP_FROM_NAME`, and `MAILCHIMP_REPLY_TO`.

For official LinkedIn organization mention discovery, use `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_URN`, and a currently supported `LINKEDIN_VERSION`. The authenticated member must have the required VOLTA Page administrator permission. Notifications are leads until their underlying post is reviewed.

## Deliverables

Provide:

- Editable Markdown.
- Email-safe HTML.
- Plain text and section-by-section handoff copy.
- Structured JSON for future provider integrations.
- Suggested subject line and preview text.
- A source ledger containing title, URL, date, and verification status.
- A short review checklist.
- One optional, editable Community Call to Action with its engagement destination.
