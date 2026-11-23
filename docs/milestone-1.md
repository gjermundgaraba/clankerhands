# Milestone 1: one agent, one machine

Proven on 2026-11-23 on `milestone-1`: task A at `5f0da35`, and task B at `3f3dac6`. Task A does not touch what changed between the two. An Amp agent (Claude Opus 5.5) with its built-in tools turned off fixed a real bug in a real repository and ran its test suite, then started, checked and stopped a server, using only clankerhands' tools.

## How the agent was disarmed

Each run was an Amp thread in its own orb. That thread set up clankerhands and the task with its normal tools, then, as its last action, wrote its workspace's `.amp/settings.json`:

```json
{
  "amp.tools.disable": ["builtin:*"],
  "amp.mcpServers": { "hands": { "url": "http://127.0.0.1:4870/mcp" } }
}
```

From its next turn on, it was the agent under test. Amp still lists a disabled tool, so the check is what a call does, not what the list says.

### The disarm check

Each run was asked to list its tools, read a file holding a secret word, and run `echo $((6*7))`, trying every tool it had.

|  | Without clankerhands | With clankerhands |
| --- | --- | --- |
| Read the file | Failed. `shell_command`, `mac_read_file` and the shell inside `Task` were refused as `disabled: settings`; `view_media` and `read_web_page` could not read it | `hands.read` returned `1\tmarmalade` |
| Run the command | Failed. `shell_command`, `mac_shell` and `Task`'s shell were refused as `disabled: settings` | `hands.shell` returned `42` and `exit code: 0` |

Threads: [without clankerhands](https://ampcode.com/threads/T-01a20879-1ff8-7209-b8ca-028458ef1ad4), [with clankerhands](https://ampcode.com/threads/T-01a20876-1a46-74d2-82e4-25266d6fd433).

What stays on: `Task`, whose own shell is refused, and `code_exec`, which is how Amp calls MCP tools. `code_exec` also reaches Amp's own functions, such as copying a file to another thread, but none of them reads a file's contents or runs a command. That bound is the runtime's, not a setting: `code_exec` cannot be turned off, because Amp reaches MCP tools through it, and if its runtime ever gained a file system or a process, this configuration would stop disarming the agent without saying so. So each task run's calls were checked one by one: every call had to be `code_exec` calling a `hands.*` function and nothing else.

## Task A: a real bug

The repository is [more-itertools](https://github.com/more-itertools/more-itertools) at `e3f79f4`, with the fix for [issue #1344](https://github.com/more-itertools/more-itertools/issues/1344) (commit `c629214`) reverted and the history removed, so 9 tests fail. The agent got the issue's text, was asked to fix it and run `python3 -m unittest tests.test_more`, and to keep the tests unchanged.

Its calls, all `code_exec` calling clankerhands:

1. `hands.shell`: `grep -n` for `numeric_range`'s `__eq__`, `__hash__` and `_len`.
2. `hands.read`: `more.py` from line 2350, 95 lines.
3. `hands.edit` twice: `len(self)` and `len(other)` to `self._len` and `other._len` in `__eq__`, and `len(self)` to `self._len` in `__hash__`.
4. `hands.shell`: the suite, a check at `10**30`, and `git status`.

Its diff is the upstream fix, line for line. The test run, as `hands.shell` returned it:

```
Ran 741 tests in 5.690s

OK (skipped=1)
```

Before the fix: `FAILED (errors=9, skipped=1)`. Calls: `read` 1, `edit` 2, `shell` 2.

## Task B: a long-running process

Run at `3f3dac6`, in a fresh thread whose agent had not seen an earlier run. In the same repository, the agent was asked to serve `docs/` on port 8765 with `python3 -m http.server`, check it serves and what the server logged, then stop it and show it gone. Its calls, apart from three `tool_search` calls that read the hands tools' descriptions, were `code_exec` calling clankerhands:

1. `hands.shell`: `python3 -m http.server 8765 --bind 127.0.0.1`, in `docs/`, with `timeout_ms: 3000`. It answered `(no output)`, then `[Still running as id 1. Call shell_output with id 1 to wait for more output, or with stop: true to stop it.]`
2. `hands.shell`: `curl -i` for `/` and `/conf.py`, which answered `HTTP/1.0 200 OK` with the directory listing, and `conf.py: 200 9041B`.
3. `hands.shell_output` on id 1: the server's own log, `"GET / HTTP/1.1" 200 -` and `"GET /conf.py HTTP/1.1" 200 -`.
4. `hands.shell_output` with `stop: true`: `(no new output)`, then `ended by SIGTERM (stopped on request)`.
5. `hands.shell`, twice: `curl` failed with exit 7, `ss` showed no listener on 8765, and `ps -eo pid,args | grep -c '[p]ython3 -m http.server'` counted 0.

Calls: `shell` 4, `shell_output` 2. [Thread](https://ampcode.com/threads/T-01a20896-7792-7112-b604-139bf4294201).

## What broke, and what changed

A first run of task B, at `5f0da35` ([thread](https://ampcode.com/threads/T-01a20880-9a71-74df-a62e-039111cc84fd)), passed but showed two problems, fixed in `18efadc` before the run above:

- **`&` and `nohup` are stopped with their command.** The agent's first try, `nohup python3 -m http.server 8765 &`, did not survive its `shell` call. The behaviour is kept, since it is what stops commands leaving orphans, and `shell`'s description now says so and says how to keep a server running; the run above followed it first time. A test pins it.
- **A stop read `ended by a signal (stopped on request): Unknown: ChildProcess.exitCode (bash -c ...)`.** It now reads `ended by SIGTERM (stopped on request)`, as the run above shows, and a test pins it.
- **Amp speaks MCP 2026-07-28,** so the text block of every result arrives quoted and escaped, as effect-actions 0.37.0 sends a string success to that revision. Amp's `code_exec` hands the model `structuredContent`, which is the raw string, so the agent saw raw text. A client that reads text blocks under 2026-07-28 would not, until effect-actions sends a string success raw on every revision.
