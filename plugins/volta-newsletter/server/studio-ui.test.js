import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const studioPath = path.resolve(here, "../assets/newsletter-studio.html");
const serverPath = path.resolve(here, "index.js");

test("embedded editor preserves in-progress state and does not jump away on edit", async () => {
  const html = await fs.readFile(studioPath, "utf8");
  assert.match(html, /setWidgetState/);
  assert.match(html, /widgetState/);
  assert.match(html, /persistEditorState\(\)/);
  assert.doesNotMatch(html, /editor-column"\)\.scrollIntoView/);
  assert.match(html, /focus\(\{preventScroll:true\}\)/);
});

test("embedded editor uses a fresh resource URI without forcing fullscreen", async () => {
  const server = await fs.readFile(serverPath, "utf8");
  assert.match(server, /ui:\/\/volta-newsletter\/studio-v15\.html/);
  assert.doesNotMatch(server, /availableDisplayModes:\s*\["fullscreen"\]/);
});

test("embedded editor initializes the MCP Apps bridge before calling tools", async () => {
  const html = await fs.readFile(studioPath, "utf8");
  assert.match(html, /request\("ui\/initialize"/);
  assert.match(html, /notify\("ui\/notifications\/initialized"/);
  assert.match(html, /protocolVersion:"2026-01-26"/);
  assert.match(html, /await bridgeReady;return request\("tools\/call"/);
  assert.doesNotMatch(html, /window\.openai\?\.callTool/);
});
