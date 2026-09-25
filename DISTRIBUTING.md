# Distributing VOLTA Newsletter

VOLTA Newsletter is a portable Codex, Claude Code, and Cursor repository. It includes the `volta-newsletter` skill, shared instructions, a local MCP server, and both embedded and standalone Newsletter Studio editors.

## Before publishing

1. Review `memory.md` and remove any issue history that should not be shared.
2. Confirm that no `.env` file or credentials are present.
3. Run `setup.ps1` on Windows or `setup.sh` on macOS/Linux.
4. Run `package.ps1` on Windows if you want a clean ZIP.

Private inbox notes, generated newsletter drafts, installed dependencies, logs, and secrets are excluded by `.gitignore` and from the ZIP package.

Transfer the complete **Volta-newsletter (Demo 3)** project/repository, or use the ZIP created by `package.ps1`. Keep the root files and folders together. Do not manually copy only `SKILL.md`.

## Recipient setup

1. Clone the GitHub repository or unzip the package.
2. Install Node.js 20 or newer.
3. Run `setup.ps1` on Windows or `setup.sh` on macOS/Linux.
4. Open the folder in Codex, Claude Code, or Cursor.
5. Type `newsletter`.
6. In Codex, use the embedded Newsletter Studio. In Claude Code or Cursor, run `studio.ps1` or `studio.sh`, then open `http://127.0.0.1:4173`.
7. Edit, save, and export from Newsletter Studio.

The recipient does not need Mailchimp credentials to draft, edit, preview, or export. Sending remains a manual action in Mailchimp.

## What must stay together

- `AGENTS.md` routes the newsletter commands.
- `plugins/volta-newsletter/skills/volta-newsletter/` defines the workflow.
- `plugins/volta-newsletter/context/` stores brand, editorial, and source rules.
- `plugins/volta-newsletter/server/` provides the tools and data operations.
- `plugins/volta-newsletter/assets/` contains the in-Codex editor and email template.
- `.agents/plugins/marketplace.json` and `.codex/config.toml` register and enable the plugin.
- `CLAUDE.md` and root `.mcp.json` configure Claude Code.
- Root `AGENTS.md` and `.cursor/mcp.json` configure Cursor.

Do not distribute only the skill folder if you expect the visual editor to work.

The export package includes Google and Outlook calendar links plus one .ics file per dated event. Upload an .ics file to a public website or Mailchimp Content Studio before using it as a subscriber-facing download link.

Each issue can store one editable Community Call to Action. Reply actions generate a prefilled email, while web actions receive monthly UTM parameters in rendered subscriber links.
