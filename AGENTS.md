# VOLTA Newsletter Workspace

This workspace contains the portable `volta-newsletter` plugin.

## Newsletter trigger

When the user types `newsletter`, `newsletter draft`, or asks for a monthly VOLTA newsletter, use the `volta-newsletter` skill in `plugins/volta-newsletter/skills/volta-newsletter/SKILL.md`.

Every newsletter request must end with Newsletter Studio as the editing surface. In Codex, call `open_newsletter_studio`. In Claude Code or Cursor, or whenever the MCP App resource does not render, run `npm run studio --prefix plugins/volta-newsletter` and provide `http://127.0.0.1:4173`. Never present an opened output file as the editor.

When the user types `add community win:`, `add event:`, or `add past event:`, use the same skill to save the item to the newsletter inbox. Newsletter Studio is the primary intake and editing interface.

- Default to the current calendar month in `America/Halifax` unless the user names another month.
- Gather current source material before drafting. Keep the source URL and publication/event date for every factual item.
- Read `newsletter-data/inbox.json` through the MCP inbox tools. Preserve excluded items for provenance instead of deleting them.
- Read `memory.md` through `read_newsletter_memory` before drafting. Record each completed draft with `record_newsletter_issue`; do not reuse stories from sent issues unless there is a materially new development approved by the user.
- If the Slack plugin is connected, search Slack for leads and retain permalinks. Otherwise continue with the other sources and report that Slack discovery was skipped.
- Use `collect_linkedin_mentions` when approved LinkedIn organization credentials are configured. Otherwise treat LinkedIn discovery as incomplete unless it came from a supplied URL. Never bypass LinkedIn access controls or scrape authenticated pages.
- Produce editable Markdown and branded, email-safe HTML under `outputs/<YYYY-MM>/`.
- Keep every selected community update; there is no section item limit. Use `discover_event_image` for public Eventbrite links, while always allowing the user to replace or remove the result.
- A request for a newsletter or newsletter draft authorizes research and local draft creation only.
- Never send, schedule, or publish a campaign. Create a Mailchimp draft only when the user explicitly asks for that external action; the MCP server intentionally exposes no send tool.
- If credentials are missing, finish the local draft and report only the missing setup fields.

## Shared context

Read only the context needed for the requested operation:

- `plugins/volta-newsletter/context/brand.md` for design and contact details.
- `plugins/volta-newsletter/context/editorial.md` for voice, sections, and review rules.
- `plugins/volta-newsletter/context/sources.md` for collection rules and source limitations.
- `plugins/volta-newsletter/context/source-config.json` for Slack search signals and inbox settings.
- `plugins/volta-newsletter/context/linkedin-queue.json` for manually approved LinkedIn leads.
- `memory.md` for previous issue paths, publication state, and covered-story deduplication.
