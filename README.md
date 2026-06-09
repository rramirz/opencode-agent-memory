# opencode-agent-memory

OpenCode MCP plugin for [agent-memory](https://github.com/rramirz/agent-memory). Adds `save_memory`, `search_memory`, and `sync_memory` tools to OpenCode.

## Tools

| Tool | Description |
|---|---|
| `save_memory` | Save a decision, note, architecture entry, etc. to memory API |
| `search_memory` | Search memories for current org/project |
| `sync_memory` | Pull context from API and write to `docs/ai/` |

All tools are manual-only. Nothing auto-injects. Service outages are fail-open: `save_memory` queues writes to `~/.agent-memory/outbox/` if the API is unreachable.

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
