import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addNewsletterItem,
  exportNewsletterPackage,
  listNewsletterItems,
  saveNewsletterDraft,
  updateNewsletterItem,
} from "./core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(here, "../../..");
const studioPath = path.resolve(here, "../assets/newsletter-studio.html");
const port = Number(process.env.VOLTA_STUDIO_PORT || 4173);

function halifaxMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Halifax", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}`;
}

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const handlers = {
  add_newsletter_item: (input) => addNewsletterItem({ ...input, workspacePath }),
  list_newsletter_items: (input) => listNewsletterItems({ ...input, workspacePath }),
  update_newsletter_item: (input) => updateNewsletterItem({ ...input, workspacePath }),
  save_newsletter_draft: (input) => saveNewsletterDraft({ ...input, workspacePath }),
  export_newsletter_package: (input) => exportNewsletterPackage({ ...input, workspacePath }),
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(await fs.readFile(studioPath, "utf8"));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/context") {
      const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : halifaxMonth();
      const listed = await listNewsletterItems({ workspacePath, month });
      json(response, 200, { workspacePath, month, items: listed.items, settings: listed.settings });
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/tools/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/tools/".length));
      if (!handlers[name]) {
        json(response, 404, { error: "Tool is not available in standalone Studio" });
        return;
      }
      const result = await handlers[name](await requestBody(request));
      json(response, 200, { structuredContent: result });
      return;
    }
    json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, 400, { error: error.message || "Request failed" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`VOLTA Newsletter Studio is ready at http://127.0.0.1:${port}`);
  console.log("Keep this terminal open while editing. Press Ctrl+C to stop.");
});
