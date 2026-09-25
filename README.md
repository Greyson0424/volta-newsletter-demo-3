# VOLTA Newsletter

A portable, review-first newsletter drafting system for Codex, Claude Code, and Cursor. It gathers VOLTA events and community leads, remembers previously covered stories, provides a visual editor, produces email-safe HTML, and exports a Mailchimp handoff without sending anything.

## Bader setup: 15–30 minutes

### 1. Install once

Requirements: Node.js 20 or newer, npm, and either Claude Code or Cursor.

1. Clone this repository or unzip the release.
2. Open a terminal in the repository root.
3. Run:

   **Windows**

   ```powershell
   .\setup.ps1
   ```

   **macOS or Linux**

   ```sh
   sh setup.sh
   ```

The setup installs local dependencies and runs the automated tests. It does not require Mailchimp credentials.

### 2. Use it with Claude Code

1. Open a terminal in this folder and run `claude`.
2. Approve the project MCP server if Claude asks.
3. Type `newsletter` or `newsletter draft`.
4. After Claude prepares the issue, open another terminal and run `.\studio.ps1` on Windows or `./studio.sh` on macOS/Linux.
5. Open `http://127.0.0.1:4173` and edit, save, or export the newsletter.

`CLAUDE.md` loads the shared project instructions, and the checked-in `.mcp.json` gives Claude the newsletter tools.

### 3. Use it with Cursor

1. Open this repository as a Cursor project.
2. Confirm `volta_newsletter` appears under available MCP tools.
3. Open Agent chat and type `newsletter`.
4. After the draft is prepared, run `.\studio.ps1` or `./studio.sh` in Cursor’s terminal.
5. Open `http://127.0.0.1:4173` to edit, save, and export.

Cursor reads the root `AGENTS.md` and the project-specific `.cursor/mcp.json`.

### 4. Send through Mailchimp

Select **Export for Mailchimp** in Newsletter Studio. Upload `outputs/<YYYY-MM>/volta-newsletter.html` through Mailchimp’s **Code your own → Import HTML** flow, or use `mailchimp-copy.md` with Mailchimp’s visual builder. Always send a test email before publishing.

## Where to edit the newsletter

The editable interface is **Newsletter Studio**. In Codex it renders inside the task. In Claude Code and Cursor it runs locally at `http://127.0.0.1:4173`. It has dropdowns, text inputs, date/time controls, Edit and Remove buttons, an editable Community Call to Action, a live preview, Save, and Export. Saving stores the subject, preview text, opening note, CTA, and content for that issue month. The generated `.html` file is a preview/export, not the editing surface.

1. In Codex, open this repository as a project.
2. Restart Codex after the first installation or after updating the plugin.
3. Start a **new task inside that project**. Existing tasks do not hot-load newly installed plugin tools.
4. Type `newsletter`, or select **VOLTA Newsletter** from the skill/plugin picker.
5. After research and drafting, Codex opens **Newsletter Studio** in the task. Use its fields to edit the subject, preview text, opening, events, start/end times, links, locations, up to two community wins, and one focused Community Call to Action. Each item can be edited or removed.
6. Select **Save draft** to refresh the Markdown and branded HTML, or **Export for Mailchimp** for the handoff files.

If Codex opens only an HTML or Markdown file, close that task, restart Codex, and begin a new task under this project. That means the task began before the plugin tools were loaded.

## Codex setup

Windows:

```powershell
.\setup.ps1
```

macOS or Linux:

```sh
sh setup.sh
```

Then open the repository as a trusted Codex project, start a new task, and type:

```text
newsletter
```

Codex gathers the source material and then opens the embedded **Newsletter Studio**. In that panel you can choose Event or Community win, enter the title, description, link, date, start/end time and location, edit or remove existing cards, customize the subject and opening note, and save refreshed Markdown plus HTML. Community wins appear above events and each issue allows a maximum of two wins.

Select **Export for Mailchimp** for a provider-independent handoff. It creates editable Markdown, branded HTML, plain text, section-by-section Mailchimp copy, a structured JSON manifest, and one .ics file for each dated event. Newsletter event cards include one-click Google Calendar and Outlook Calendar links. The Community Call to Action can invite a reply, event registration, program application, survey response, or custom action; eligible web destinations receive monthly UTM tracking automatically. Direct Mailchimp API integration remains optional and hidden from the default editor.

Other useful commands:

- `add community win: [details or link]`
- `add event: [details or link]`
- `create a Mailchimp draft`
- `the newsletter was sent`

The final send always remains in Mailchimp.

## Example output

`examples/volta-newsletter-september-2026.pdf` is a rendered issue made from the public sources listed in `examples/SOURCES.md`. It is included as a reference and is not loaded into new drafts.

## Why the repository is structured this way

```text
.
├── AGENTS.md                         Codex project instructions
├── .mcp.json                         Project-level MCP discovery
├── .codex/config.toml                Enables the repository plugin and its tools
├── .agents/plugins/marketplace.json  Repository plugin catalog
├── memory.md                         Previous issue and story ledger
├── newsletter-data/                  Private local intake created at runtime
├── outputs/                          Generated Markdown and HTML
└── plugins/volta-newsletter/
    ├── plugin.json                   Portable plugin manifest
    ├── mcp.json                      Portable MCP declaration
    ├── .codex-plugin/plugin.json     Codex compatibility manifest
    ├── .mcp.json                     Codex compatibility MCP declaration
    ├── skills/
    │   └── volta-newsletter/
    │       └── SKILL.md              Newsletter workflow
    ├── context/                      Brand, editorial, and source rules
    ├── assets/                       Newsletter Studio and email HTML template
    └── server/                       MCP tools and tests
```

The nested `skills/volta-newsletter/` directory is intentional. The outer `skills/` directory belongs to the plugin and may hold several related skills; each individual skill gets its own folder and `SKILL.md`.

`CLAUDE.md` intentionally contains a small import of `AGENTS.md`, so Claude Code and Codex share the same maintained workflow instead of duplicating instructions. Cursor reads the root `AGENTS.md` directly.

The root and plugin MCP files are not interchangeable duplicates:

- Root `.mcp.json` lets a compatible coding environment discover the local server directly from the repository.
- `.cursor/mcp.json` registers the same server for Cursor projects.
- Plugin `mcp.json` is the portable Agent Plugins declaration.
- Plugin `.mcp.json` supports Codex's compatibility manifest.

Likewise, root `plugin.json` is the portable manifest, while `.codex-plugin/plugin.json` keeps compatibility with current Codex plugin loading.

## Credentials

Local drafting does not require Mailchimp or LinkedIn credentials. Optional integration fields are documented in `plugins/volta-newsletter/.env.example`.

Provide Mailchimp values through the host environment before asking Codex to create a Mailchimp draft. LinkedIn organization collection requires approved LinkedIn organization access. Never commit secrets or a populated `.env` file.

The studio reports which Mailchimp settings are missing without displaying their values. Configure `MAILCHIMP_API_KEY`, `MAILCHIMP_SERVER_PREFIX`, and `MAILCHIMP_LIST_ID` locally, then restart Codex so the newsletter server receives them. The default sender name is `VOLTA` and the default reply-to address is `contact@voltaeffect.com`; override them with `MAILCHIMP_FROM_NAME` and `MAILCHIMP_REPLY_TO` if needed. Do not paste the API key into a chat or commit it to GitHub.

Slack discovery uses the Slack plugin connected in the user's AI environment; it is not bundled with this repository.

## Private and generated data

- `newsletter-data/inbox.json` is created locally and ignored by Git because it may contain private 1:1 notes.
- `outputs/` is ignored because drafts may contain unpublished company information.
- `memory.md` is versioned deliberately so a team can share the sent-story ledger. Review it before publishing a public repository.
