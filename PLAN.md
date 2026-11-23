# Plan

## Milestone

An agent does real coding work on a machine using only clankerhands' tools.

Done when an agent with its built-in tools turned off completes a real task in a repo, such as fixing a bug and running its tests.

## Scope

- Runs on any Linux machine. Nothing clankerbox-specific yet.
- Reached over HTTP(S). No auth.
- Any MCP client can connect. No agent is favoured.

## Steps

1. **Research the tool shapes.** Study the tools of Pi, Codex, Claude Code, Amp, OpenCode and other harnesses with public tool definitions.
2. **Decide the tools.** The research decides which tools come first, and whether we design our own or match one harness's tools closely.
3. **Build them** as effect-actions contracts served over MCP.
4. **Prove the milestone** with an agent whose built-in tools are turned off.

## Out of scope

- Auth
- Multi-user
- clankerbox integration
