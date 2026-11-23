# Plan

## Milestone

An agent does real coding work on a machine using only clankerhands' tools.

Done when an agent with its built-in tools turned off completes a real task in a repo, such as fixing a bug and running its tests.

## Scope

- Runs on any Linux machine. Nothing clankerbox-specific yet.
- Reached over HTTP(S). No auth.
- Any MCP client can connect. No agent is favoured.

## Tools

Five tools, shaped as Claude Code and Amp shape theirs, because models already know these schemas. Search goes through the shell, as `rg`.

1. **`shell`**: `command`, `workdir`, `timeout_ms`. Returns the exit code and output, stdout and stderr merged. Past 2000 lines or 50 KB it keeps the tail and saves the full output to a file whose path it returns. A command still running at its timeout keeps running and returns an ID.
2. **`shell_output`**: an ID, how long to wait, and whether to stop the command. Returns new output, and the exit code once the command ends.
3. **`read`**: `path`, `offset`, `limit`. Numbered lines, 2000 lines or 50 KB a page, and the next offset when cut.
4. **`edit`**: `path`, `old_string`, `new_string`, `replace_all`. Exact match first, then ignoring quote, dash, space and trailing-whitespace variants. More than one match fails unless `replace_all` is set. A miss returns the closest lines. Accepts `old_str` and `new_str` too.
5. **`write`**: `path`, `content`. Creates parent directories.

Every cut says what to do next: the next offset, or where the full output is.

## Steps

1. **Build the tools** as effect-actions contracts served over MCP.
2. **Prove the milestone** with an agent whose built-in tools are turned off.

## Later

Added when a model or the milestone shows it is needed: `apply_patch` for GPT models, interactive stdin and PTYs, separate `grep` and `glob`, images in `read`, and read-before-edit tracking.

## Out of scope

- Auth
- Multi-user
- clankerbox integration
