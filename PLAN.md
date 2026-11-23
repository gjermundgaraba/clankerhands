# Plan

## Done

An agent uses clankerhands, and nothing else, as its hands for a normal working day on its user's machine, whichever harness or model family it runs on.

- **The same tools for every client.** clankerhands knows nothing about models or harnesses. Claude, GPT and Gemini models do real work with the same tools, through Amp, Claude Code, Codex and Pi.
- **It holds up through a day.** Several agents on one machine at once, all working for the same person: that is concurrency, not multi-user, with no accounts, permissions or isolation between them. Background commands are never lost or orphaned, logs do not fill the disk, and an agent that disconnects mid-command can come back and read the result.
- **What it did can be checked afterwards.** A log of every tool call, for the user to see what their own agents did.
- **It is safe where it runs,** as the scope says.
- **It installs and starts with one documented command** on a fresh Linux machine.

## Scope

clankerhands is for a machine its user controls. An agent on that machine reaches it over loopback, and nothing else does. Reaching it from anywhere else is out of scope, not unsupported but possible.

- It listens on loopback only and refuses to start on any other address.
- It refuses a request that carries an `Origin` header, which a page in a browser always sends, so a web page on the machine cannot drive it.

Out of scope, by decision: auth, multi-user and clankerbox integration. If the project turns out not to be finishable without one of them, that is raised with the evidence, not planned around.

## Tools

Five tools, shaped as Claude Code and Amp shape theirs, because models already know these schemas. Search goes through the shell, as `rg`.

1. **`shell`**: `command`, `workdir`, `timeout_ms`. Returns the output, stdout and stderr merged, then `exit code: N`. Past 2000 lines or 50 KB it keeps the tail and names the file holding all of it. A command still running at its timeout keeps running and returns an id. Anything a command leaves running with `&` is stopped when it ends.
2. **`shell_output`**: `id`, `timeout_ms`, `stop`. Returns the output written since it last looked, and the exit code once the command ends. A stop ends the command's whole process group.
3. **`read`**: `path`, `offset`, `limit`. Lines as `N<TAB>line`, 2000 lines or 50 KB a page, and the next offset when cut.
4. **`edit`**: `path`, `old_string`, `new_string`, `replace_all`. Exact match first, then ignoring lookalike quotes, dashes, spaces and line-end whitespace. More than one match fails unless `replace_all` is set. A miss returns the closest lines. Accepts `old_str` and `new_str` too.
5. **`write`**: `path`, `content`. Creates parent directories.

Every cut says what to do next: the next offset, or where the full output is.

## Milestones

Each ends with an agent doing real work, not only with passing tests.

1. **One agent, one machine.** Proven: an agent with its built-in tools off fixed a real bug and ran its tests, and ran and stopped a server, using only clankerhands. The evidence is in [docs/milestone-1.md](docs/milestone-1.md).
2. **No agent favoured.** The same kind of task passes, with the same tools, on a second harness and a second model family: Claude Code with Claude, and Codex or Pi with a GPT model. In progress: GPT-6.2 Sol passed both tasks on Amp, using `edit`, so `apply_patch` stays out. The evidence is in [docs/milestone-2.md](docs/milestone-2.md).
3. **Daily use.** The user works with clankerhands, and what that use shows is needed gets built: the tool-call log, log retention, limits on concurrent commands, and maybe interactive stdin and images in `read`.

## Later

| Item | When |
| --- | --- |
| `apply_patch` | Not planned: GPT-6.2 Sol worked with `edit` in milestone 2. Back only if daily use shows a model cannot, and then for every client |
| Interactive stdin, as a small `shell_input` without a PTY | Milestone 3, if use shows it |
| Images in `read`, through `Action.Image` | Milestone 3 |
| Read-before-edit tracking | Milestone 3, if use shows lost edits |
| PTYs | Not planned unless asked for |
| Separate `grep` and `glob` | Not planned: `rg` and `rg --files` cover both |
