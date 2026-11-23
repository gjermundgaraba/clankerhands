# Milestone 2: no agent favoured

The same tasks as [milestone 1](milestone-1.md), run on another model family and other harnesses, with the same tools.

| Harness | Model | Result |
| --- | --- | --- |
| Amp | GPT-6.2 Sol | Passed, below |
| Claude Code | Claude | Not run yet: needs a Claude login on the machine |
| Codex | GPT | Not run yet: needs an OpenAI login on the machine |

## GPT-6.2 Sol on Amp

Proven on 2026-11-23 at `5614b64`, with effect-actions 0.38.0, in [this thread](https://ampcode.com/threads/T-01a208fe-6157-765d-8e59-b55dbbf3fd64). An earlier run at `d03d5b3`, on effect-actions 0.37.0 ([thread](https://ampcode.com/threads/T-01a208ea-649d-7377-b32a-2ebeb4babfee)), passed the same disarm check and both tasks the same way, with the same two edits.

### How the run was set up

The thread set up clankerhands and the task with its normal tools, as in milestone 1, with one change: hands went into the orb's user settings, and the workspace settings held only the disarm.

```json
// ~/.config/amp/settings.json, added to what was there
{ "amp.mcpServers": { "hands": { "url": "http://127.0.0.1:4870/mcp" } } }

// ROOT/.amp/settings.json, written as the thread's last setup action
{ "amp.tools.disable": ["builtin:*"] }
```

A server in workspace settings makes Amp ask a person to allow it, in every new orb, even after "Always Allow". A server in user settings needs no approval, so the run needs no one. An `amp.mcpPermissions` allow rule for the URL in workspace settings does not stop the dialog ([probe](https://ampcode.com/threads/T-01a208fb-7d3d-7427-9ed3-e9bd84cdeabd)).

Do not restart the hands server from inside the run, such as `amp orb service restart hands` through `hands.shell`. That command runs in the server's own process group, which the restart stops first, so the server never comes back and the disarmed agent is left with no way to do anything. The 0.37.0 run ended that way.

### The disarm check

Amp's GPT mode has its own `apply_patch`, so the check tried to change a file as well as read one and run a command.

|  | Without clankerhands | With clankerhands |
| --- | --- | --- |
| Read the file | `shell_command` and the shell inside `Task`: `tool "async_shell_command" is disabled: settings`. `view_media`: unsupported media file. `code_exec` alone: `ReferenceError: readFile is not defined` | `hands.read`: `1\tkingfisher` |
| Run `echo $((6*7))` | `shell_command` and `Task`'s shell: `disabled: settings`. `code_exec` alone: `ReferenceError: exec is not defined` | `hands.shell`: `42` and `exit code: 0` |
| Change the file | `apply_patch`: `tool "apply_patch" is disabled: settings`. `shell_command`: `disabled: settings`. `code_exec` alone: `ReferenceError: writeFile is not defined` | `hands.edit`: `Updated …/secret.txt (1 replacement).` then `1\tchanged` |

On Amp the disarm rests on settings for every built-in tool except `code_exec`, which must stay on to reach MCP tools: the `ReferenceError`s above come from its runtime, not a setting ([milestone 1](milestone-1.md#the-disarm-check) says what that leaves open). So each call below was checked: every `code_exec` imported `hands` functions, called them, printed the result and did nothing else.

### What Amp hands the model

effect-actions 0.38.0 sends a string success as one raw text block, with no `structuredContent`. Amp's `code_exec` used to give the model the `structuredContent`, so it now reads the text block instead. One `code_exec` wrote a file holding a quote, a tab, a backslash, a line of JSON and trailing spaces, read it back, and printed `typeof` and `JSON.stringify` of each answer:

```
read: typeof=string isArray=false value="1\tsay \"hi\"\tthere\n2\tback\\slash and 'single'\n3\t{\"a\": 1, \"b\": \"two\"}\n4\t  indented  "
line 1 copied === written: … value=true      (lines 2 to 4 the same)
shell json-only: typeof=string isArray=false value="{\"x\": 2}\nexit code: 0"
edit miss threw: … value="<error>old_string was not found in …/quotes.txt. The closest lines are below, …\n1\tsay \"hi\"\tthere\n…</error>"
edit with copied line 1: typeof=string … value="Updated …/quotes.txt (1 replacement).\n1\tsay \"bye\"\tthere"
get_about: typeof=object isArray=false value={"name":"clankerhands","version":"0.0.0"}
```

The escaping is `JSON.stringify`'s: the strings hold real tabs, quotes and backslashes. A line copied from `read`, without its number, equals the file's line, and `edit` takes it. A declared error reaches the model as its `message`. No answer was parsed into an object, and none can be: every answer carries a line-number prefix, a status line or a verb sentence, so none is valid JSON on its own. A new tool that answers with bare text would need the same check. `get_about` is the one tool whose success is a struct, not a string, so it still goes out as `structuredContent` and arrives as an object.

### Task A: a real bug

The same more-itertools #1344 task as milestone 1. Calls: `hands.shell` 4, `hands.read` 2, `hands.edit` 2, through 5 `code_exec` calls.

Both edits matched on their first try, each `old_string` made unique by the line after it:

```
old_string: "        len_self = len(self)\n        if len_self != len(other):"
new_string: "        len_self = self._len\n        if len_self != other._len:"

Updated …/more_itertools/more.py (1 replacement).
2379	        len_self = self._len
2380	        if len_self != other._len:
```

and the same for `__hash__`. The diff is the upstream fix, 3 lines in 2 hunks. Two of its `rg` patterns failed to parse, and `shell` returned rg's error; it fixed one and read the file instead of the other.

```
Ran 741 tests in 3.633s

OK (skipped=1)
```

GPT-6.2 Sol used `edit` without a miss. That was one small edit on one harness, so it does not show that a GPT model never wants a patch across many files; [PLAN.md](../PLAN.md) says when `apply_patch` would come back.

### Task B: a long-running process

Calls: `hands.shell` 3, `hands.shell_output` 2, through 4 `code_exec` calls.

1. `hands.shell`: `exec python3 -u -m http.server 8765 --bind 127.0.0.1` in `docs/`, with `timeout_ms: 1000`, in the foreground with no `&`. It answered with the server's banner, then `[Still running as id 8. …]`.
2. `hands.shell`: `curl` for `/index.rst` piped to `cmp` against the file: `HTTP 200`, and the body matched byte for byte.
3. `hands.shell_output` on id 8: the server's log, `"GET /index.rst HTTP/1.1" 200 -`.
4. `hands.shell_output` with `stop: true`: `(no new output)`, then `ended by SIGTERM (stopped on request)`. Then `hands.shell`: `curl` exited 7, nothing listened on 8765, and no `http.server` process was left.
