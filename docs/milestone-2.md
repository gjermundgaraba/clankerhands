# Milestone 2: no agent favoured

The same tasks as [milestone 1](milestone-1.md), run on another model family and other harnesses, with the same tools.

| Run | Harness | Model | Result |
| --- | --- | --- | --- |
| A | Amp | GPT-6.2 Sol | Passed, below |
| B | Claude Code | Claude | Not run yet: needs a Claude login on the machine |
| C | Codex | GPT | Not run yet: needs an OpenAI login on the machine |

## GPT-6.2 Sol on Amp

Proven on 2026-11-23 at `d03d5b3`, with effect-actions 0.37.0, in [this thread](https://ampcode.com/threads/T-01a208ea-649d-7377-b32a-2ebeb4babfee). It was set up and disarmed as in milestone 1.

### The disarm check

Amp's GPT mode has its own `apply_patch`, so the check tried to change a file as well as read one and run a command.

|  | Without clankerhands | With clankerhands |
| --- | --- | --- |
| Read the file | `shell_command` and the shell inside `Task`: `tool "async_shell_command" is disabled: settings`. `view_media`: unsupported media file. `code_exec` alone: `ReferenceError: require is not defined` | `hands.read`: `1\tMarigold` |
| Run `echo $((6*7))` | `shell_command` and `Task`'s shell: `disabled: settings`. `code_exec` alone: `ReferenceError: require is not defined` | `hands.shell`: `42` and `exit code: 0` |
| Change the file | `apply_patch`: `tool "apply_patch" is disabled: settings`. `shell_command`: `disabled: settings`. `code_exec` alone: `ReferenceError: require is not defined` | `hands.edit`: `Updated …/secret.txt (1 replacement).` then `1\tchanged` |

On Amp the disarm rests on settings for every built-in tool except `code_exec`. `code_exec` must stay on, because Amp reaches MCP tools through it, and it is bounded only by what its runtime can do: the `require is not defined` above is that runtime, not a policy. If a later `code_exec` could reach a file system or a process, the same settings would stop disarming the agent and nothing would say so. So each call below was checked: every `code_exec` imported `hands` functions, called them and printed the result, and did nothing else.

### Task A: a real bug

The same more-itertools #1344 task as milestone 1. Calls: `hands.shell` 4, `hands.read` 1, `hands.edit` 2, through 5 `code_exec` calls.

Both edits matched on their first try, each `old_string` made unique by the line after it:

```
old_string: "        len_self = len(self)\n        if len_self != len(other):"
new_string: "        len_self = self._len\n        if len_self != other._len:"

Updated …/more_itertools/more.py (1 replacement).
2379	        len_self = self._len
2380	        if len_self != other._len:
```

and the same for `__hash__`. The diff is the upstream fix, 3 lines in 2 hunks. Its own check of the fix failed once, on a wrong `Fraction` default; it read the `AssertionError` from `shell`, corrected the check and reran:

```
Ran 741 tests in 2.873s

OK (skipped=1)
```

So a GPT model works with `edit`, and `apply_patch` stays out. This is one small edit: it shows GPT uses `edit` without friction, not that it never wants a patch across many files. Daily use would show that.

### Task B: a long-running process

Calls: `hands.shell` 3, `hands.shell_output` 2, through 5 `code_exec` calls.

1. `hands.shell`: `exec python3 -u -m http.server 8765 --bind 127.0.0.1` in `docs/`, with `timeout_ms: 300`, in the foreground with no `&`. It answered with the server's banner, then `[Still running as id 6. …]`.
2. `hands.shell`: `curl` for `/index.rst` piped to `cmp` against the file: `HTTP 200, 34 bytes`, and the body matched byte for byte.
3. `hands.shell_output` on id 6: the server's log, `"GET /index.rst HTTP/1.1" 200 -`.
4. `hands.shell_output` with `stop: true`: `(no new output)`, then `ended by SIGTERM (stopped on request)`.
5. `hands.shell`: `curl` exited 7, the server's PID was gone, no `http.server` process was left, and nothing listened on 8765.
