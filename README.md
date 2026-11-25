# clankerhands

The hands to the brains of an agent: a service that runs on a machine and gives an agent its tools over MCP.

```sh
vp install         # installs dependencies and the pre-commit hook
vp run check       # typecheck, lint, format and tests, through Turborepo
cd apps/hands && vp run start   # serves MCP at http://127.0.0.1:4870/mcp
```

## Using it from Amp

Amp is the only MCP client it has been run with. Before relying on another client, check that its per-call timeout outlasts `shell`'s wait (120 s by default, 600 s at most), how it shows a text result, and that a session it opens with `initialize` on a 2025 protocol revision works.

Add the server to the user settings, `~/.config/amp/settings.json`, not to a workspace's `.amp/settings.json`. Amp asks a person to allow a server from workspace settings in every new orb, even after "Always Allow", and an `amp.mcpPermissions` allow rule in workspace settings does not stop it.

```json
{ "amp.mcpServers": { "hands": { "url": "http://127.0.0.1:4870/mcp" } } }
```

To make it the agent's only tools, set `"amp.tools.disable": ["builtin:*"]` in the workspace settings. `code_exec` stays on, since it is how Amp calls MCP tools. Its runtime has no file system or process today, but that is Amp's limit, not a setting.

Don't restart the hands server through its own `shell` tool, such as `amp orb service restart hands`. The command runs in the server's process group, which the restart stops first, so the server never comes back.
