import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "index.js");
const studioUri = "ui://volta-newsletter/studio-v15.html";

test("MCP serves a Codex-compatible newsletter studio resource", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
  const client = new Client({ name: "volta-newsletter-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === studioUri));

    const result = await client.readResource({ uri: studioUri });
    const studio = result.contents[0];
    assert.equal(studio.mimeType, "text/html;profile=mcp-app");
    assert.match(studio.text, /VOLTA Newsletter Studio/);
    assert.notDeepEqual(studio._meta?.["openai/ui"]?.availableDisplayModes, ["fullscreen"]);

    const tools = await client.listTools();
    const openStudio = tools.tools.find((tool) => tool.name === "open_newsletter_studio");
    assert.equal(openStudio?._meta?.ui?.resourceUri, studioUri);
    assert.equal(openStudio?._meta?.["ui/resourceUri"], studioUri);
  } finally {
    await client.close();
  }
});
