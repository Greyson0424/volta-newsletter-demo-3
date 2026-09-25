# Rishabh demo script - maximum 3 minutes

Assume Rishabh has watched the Bader demo. Focus on what was built, how it works, and why.

## 0:00–0:25 - Product architecture

Show the repository root.

Say:

“The product is portable across Claude Code, Cursor, and Codex. Shared project instructions route the word ‘newsletter’ into the workflow, and a local MCP server supplies the actual data and rendering tools.”

## 0:25–0:55 - Context and sourcing

Show the skill and context folders.

Say:

“I separated workflow logic from brand, editorial, and sourcing context. That makes the behavior reusable while letting VOLTA update its voice, contact information, source rules, and search signals without rewriting the application.”

## 0:55–1:25 - Memory and verification

Show `memory.md` and describe the inbox.

Say:

“Every candidate retains its source, date, verification state, and publication status. The memory ledger records previously covered stories so the system can flag repeats instead of recycling the same community win. Excluding an item preserves its provenance rather than deleting it.”

## 1:25–1:55 - Visual editor

Show Newsletter Studio.

Say:

“I built the editor as both a Codex MCP App and a standalone local web interface. The standalone version is what makes the same visual workflow usable from Claude Code or Cursor. It writes through the same controlled newsletter functions, so there are not separate implementations.”

## 1:55–2:25 - Outputs and engagement

Show the rendered email and export package.

Say:

“The renderer produces email-safe branded HTML, Markdown, plain text, Mailchimp handoff copy, structured JSON, Google and Outlook calendar links, and ICS files. Eligible links receive monthly UTM parameters, and each issue can include one editable engagement CTA.”

## 2:25–2:50 - Safety decisions

Show the MCP tool list or server file.

Say:

“The system is intentionally review-first. Research and drafting are local. Sending is not exposed as a tool, and even the optional Mailchimp integration can only create an unsent draft. Credentials are excluded from the repository.”

## 2:50–3:00 - Close

Say:

“The result is not just a generated email. It is a repeatable monthly operating system that preserves sources, memory, brand consistency, and human approval.”
