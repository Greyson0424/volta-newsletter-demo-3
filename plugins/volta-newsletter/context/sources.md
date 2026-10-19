# Source policy

## Preferred sources

1. VOLTA events calendar: https://voltaeffect.com/events
2. Public Eventbrite Halifax/Volta discovery: https://www.eventbrite.ca/d/canada--halifax/volta/ — use only as a fallback for same-month events whose structured location is Volta, then preserve the Eventbrite URL and image
3. VOLTA blog: https://voltaeffect.com/blog
4. Other first-party pages on https://voltaeffect.com
5. Official company or member announcements linked by the user
6. Slack messages from the connected VOLTA workspace, retaining their permalinks
7. LinkedIn organization data obtained through an approved LinkedIn API connection
8. Confirmed notes from 1:1 conversations
9. Public search results used only as discovery leads

## Slack

Use Slack as the primary community discovery feed when connected. Search the configured channels over the issue month and preceding 45 days for launches, funding, awards, partnerships, hires, customer milestones, and measurable progress. A message is a lead: retain its permalink and author, deduplicate it against other sources, and verify the claim before presenting it as fact.

## Manual and 1:1 intake

Store user-supplied events and wins in the workspace newsletter inbox. A 1:1 note can be used after the user confirms the wording; it does not need a public URL, but its source must remain marked `one_to_one` in the ledger.

## LinkedIn

Do not automate crawling of linkedin.com or bypass authentication. The supported long-term integration uses LinkedIn's organization permissions and notification APIs. Until that access is configured, use public web discovery plus `linkedin-queue.json`, then require editorial verification.

## Freshness and provenance

- Events must fall inside the selected issue month unless explicitly placed in a `Save the date` section.
- Monthly event refreshes preserve existing and excluded inbox entries. They add only new canonical URLs or new title/date pairs, so manual descriptions, photos, and exclusions are not overwritten.
- Community wins normally come from the selected month or the preceding 45 days.
- Every retained item needs a canonical URL, a source date when available, and a verification status.
- Prefer a first-party source when several pages describe the same event or announcement.
