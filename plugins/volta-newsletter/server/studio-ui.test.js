import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const studioPath = path.resolve(here, "../assets/newsletter-studio.html");

test("embedded editor preserves in-progress state and does not jump away on edit", async () => {
  const html = await fs.readFile(studioPath, "utf8");
  assert.match(html, /setWidgetState/);
  assert.match(html, /widgetState/);
  assert.match(html, /persistEditorState\(\)/);
  assert.doesNotMatch(html, /editor-column"\)\.scrollIntoView/);
  assert.match(html, /focus\(\{preventScroll:true\}\)/);
});
