# opencode-agent-memory

OpenCode MCP plugin for [agent-memory](https://github.com/rramirz/agent-memory). Adds `save_memory`, `search_memory`, and `sync_memory` tools to OpenCode.

## Tools

| Tool | Description |
|---|---|
| `save_memory` | Save a decision, note, architecture entry, etc. to memory API. Pass `core: true` to write a shared "personality" memory to the cross-org `core` namespace |
| `search_memory` | Search memories for current org/project. Pass `core: true` to search the shared `core` namespace |
| `sync_memory` | Pull context from API and write to `docs/ai/` (always includes `core.md`) |

All tools are manual-only. Nothing auto-injects. Service outages are fail-open: `save_memory` queues writes to `~/.agent-memory/outbox/` if the API is unreachable.

## Bundled skills

The plugin ships OpenCode skills and self-installs them into `~/.config/opencode/skill/`:

| Skill | Purpose |
|---|---|
| `reflect` | Review sessions since the last reflection and propose cross-org "core personality" memories worth saving so every agent on every org can learn from them. Uses `save_memory(core=true)`. Invoked manually via "reflect" or `/reflect`. |

Install paths, both idempotent (matching files are left untouched, stale ones are rewritten):

1. **MCP server bootstrap**: every time OpenCode launches the MCP server, `index.mjs` re-syncs bundled skills on startup. This guarantees the skill is installed/updated without relying on npm lifecycle scripts. Cost is one `stat` per bundled skill per session.
2. **Manual fallback**: run `node scripts/install-skills.mjs` from the package checkout if you want to force a local skill sync.

Skip both paths with `OPENCODE_AGENT_MEMORY_SKIP_SKILLS=1`.

## Install

```bash
npm install -g github:rramirz/opencode-agent-memory
```

## Configure opencode.json

```json
"mcp": {
  "agent-memory": {
    "type": "local",
    "command": ["opencode-agent-memory"],
    "enabled": true
  }
}
```

If `MEMORY_TOKEN` is not in your shell env, pass it explicitly:

```json
"command": ["env", "MEMORY_TOKEN=your-token-here", "opencode-agent-memory"]
```

## Workstation config

Requires `~/.agent-memory/config.yaml`:

```yaml
workstation: home-mac
default_org: personal
allowed_orgs:
  - personal
api_url: https://memory.theramirez.casa
token_env: MEMORY_TOKEN
```

## Repo config

Optional `.agent-memory.yaml` in repo root:

```yaml
org: personal
project: my-app
repo: my-repo
sync:
  output_dir: docs/ai
```

Without it, `save_memory` uses `default_org` from workstation config, and `sync_memory` will fail.

## Timeouts

- `save_memory`: 1000ms (queues to outbox on failure)
- `search_memory`: 1500ms (returns error on failure)
- `sync_memory`: 10000ms (manual, returns error on failure)
