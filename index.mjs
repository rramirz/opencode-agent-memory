#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

function loadWorkstationConfig() {
  const p = path.join(os.homedir(), ".agent-memory", "config.yaml");
  if (!fs.existsSync(p)) return null;
  try {
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function loadRepoConfig(cwd) {
  const p = path.join(cwd || process.cwd(), ".agent-memory.yaml");
  if (!fs.existsSync(p)) return null;
  try {
    return yaml.load(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function getToken(wsCfg) {
  const envVar = wsCfg?.token_env || "MEMORY_TOKEN";
  return process.env[envVar] || "";
}

function writeOutbox(data) {
  const dir = path.join(os.homedir(), ".agent-memory", "outbox");
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const org = data.org || "unknown";
  const project = data.project || "unknown";
  fs.writeFileSync(
    path.join(dir, `${ts}.${org}.${project}.json`),
    JSON.stringify(data, null, 2),
  );
}

async function apiPost(url, token, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function apiGet(url, token, params, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "")),
    ).toString();
    const res = await fetch(`${url}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function text(str) {
  return { content: [{ type: "text", text: str }] };
}

function configCheck() {
  const ws = loadWorkstationConfig();
  if (!ws) return { error: "~/.agent-memory/config.yaml not found. Run `memory init`." };
  const token = getToken(ws);
  if (!token) return { error: `${ws.token_env || "MEMORY_TOKEN"} env var not set.` };
  const repo = loadRepoConfig();
  return { ws, token, repo, apiURL: ws.api_url };
}

const server = new McpServer({ name: "opencode-agent-memory", version: "0.1.0" });

server.tool(
  "save_memory",
  "Save a memory (decision, note, architecture, known_issue, idea, skill, agent, prompt_pattern, etc.) to the agent memory service. Set core=true to write a foundational 'personality' memory to the shared cross-org core namespace (this is what /reflect uses).",
  {
    type: z.enum(["decision", "session_summary", "architecture", "runbook", "known_issue", "task", "preference", "note", "idea", "skill", "agent", "prompt_pattern"]),
    title: z.string().min(1).max(200),
    body: z.string().min(1),
    tags: z.array(z.string()).optional(),
    importance: z.number().int().min(1).max(10).optional(),
    scope: z.enum(["global", "org", "project", "repo", "session"]).optional(),
    core: z.boolean().optional(),
  },
  async ({ type, title, body, tags, importance, scope, core }) => {
    const { error, ws, token, repo, apiURL } = configCheck();
    if (error) return text(`Error: ${error}`);

    const payload = {
      org: core ? "core" : repo?.org || ws.default_org,
      project: core ? "" : repo?.project || "",
      repo: core ? "" : repo?.repo || "",
      workstation: ws.workstation || "",
      scope: core ? "global" : scope || "repo",
      type,
      title,
      body,
      tags: tags || [],
      importance: importance || 5,
      source: "plugin",
    };

    try {
      const result = await apiPost(`${apiURL}/v1/memories`, token, payload, 1000);
      return text(`Memory saved: ${result.id}`);
    } catch (e) {
      writeOutbox(payload);
      return text(`Memory API unreachable (${e.message}). Queued locally. Run \`memory flush\` when online.`);
    }
  },
);

server.tool(
  "search_memory",
  "Search agent memories for the current org/project. Returns relevant decisions, notes, architecture, issues. Set core=true to search the shared core 'personality' namespace instead of the repo's org.",
  {
    q: z.string().min(1),
    type: z.enum(["decision", "session_summary", "architecture", "runbook", "known_issue", "task", "preference", "note", "idea", "skill", "agent", "prompt_pattern"]).optional(),
    project: z.string().optional(),
    repo: z.string().optional(),
    limit: z.number().int().positive().max(20).optional(),
    core: z.boolean().optional(),
  },
  async ({ q, type, project, repo, limit, core }) => {
    const { error, ws, token, repo: repoCfg, apiURL } = configCheck();
    if (error) return text(`Error: ${error}`);

    const params = {
      org: core ? "core" : repoCfg?.org || ws.default_org,
      q,
      type,
      project: core ? undefined : project || repoCfg?.project,
      repo: core ? undefined : repo || repoCfg?.repo,
      limit: limit ? String(limit) : "10",
    };

    try {
      const result = await apiGet(`${apiURL}/v1/memories/search`, token, params, 1500);
      const memories = result.memories || [];
      if (memories.length === 0) return text("No memories found.");

      const lines = memories.map(
        (m) =>
          `[${m.type}] ${m.title} (importance: ${m.importance})\n${m.body}${m.tags?.length ? `\nTags: ${m.tags.join(", ")}` : ""}`,
      );
      return text(lines.join("\n\n---\n\n"));
    } catch (e) {
      return text(`Search failed: ${e.message}`);
    }
  },
);

server.tool(
  "sync_memory",
  "Sync agent memory context to local docs/ai/ files. Refreshes current-state.md, decisions.md, architecture.md, known-issues.md.",
  {},
  async () => {
    const { error, ws, token, repo: repoCfg, apiURL } = configCheck();
    if (error) return text(`Error: ${error}`);
    if (!repoCfg) return text("Error: .agent-memory.yaml not found. Run `memory init` in the repo root.");

    const params = {
      org: repoCfg.org || ws.default_org,
      project: repoCfg.project,
      repo: repoCfg.repo,
    };

    try {
      const result = await apiGet(`${apiURL}/v1/context`, token, params, 10000);
      const files = result.files || [];
      for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(process.cwd(), f.path)), { recursive: true });
        fs.writeFileSync(path.join(process.cwd(), f.path), f.content);
      }
      if (files.length === 0) return text("Sync complete. No files to update.");
      return text(`Sync complete. Updated:\n${files.map((f) => `  - ${f.path}`).join("\n")}`);
    } catch (e) {
      return text(`Sync failed: ${e.message}`);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
