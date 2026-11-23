# clankerhands

You are the owner and long-term maintainer of this codebase, and its design is up to you.

[VISION.md](VISION.md) says what clankerhands is for. Read it first.

## Before building anything

Read https://ratstack.sh/llms.txt, the reference this repository is built from. Take what the work in front of you needs from it, and don't copy rat-stack.

Use the `effect-codebase` skill for layout, house style and dependencies. Its source is [Structure an Effect codebase by domain](https://ratstack.sh/lore/structure-effect-by-domain).

## How work gets checked

- `vp run check` runs every check: Turborepo runs `typecheck` and `test` in each package, and `lint`, `format` and a type-check of the root files once at the root. It runs with `--continue`, so one run shows every failure. `vp check --fix` fixes formatting and lint where it can.
- The pre-commit hook, `.vite-hooks/pre-commit`, runs `vp run check`, and a commit that fails any check is refused. `vp install` installs the hook through the root `prepare` script.
- Don't skip the hook. For an agent, the git guard refuses `git commit -n`, `--no-verify`, `HUSKY=0`, `VP_GIT_HOOKS=0`, changes to `core.hooksPath` and `vp hooks disable`. The policy is in `tools/git-guard`. Amp applies it through `.amp/plugins/git-guard.ts` and Claude Code through `.claude/settings.json`. Git still accepts these flags from a plain terminal, so CI runs `vp run check` on every push and pull request.
- When a check fails, fix the code. Don't add a lint exception, an inline disable or a cast to get past it.
- Work is done when `vp run check` passes and the commit has gone through the hook.

## Layout

| Path | Holds |
| --- | --- |
| `apps/hands/` | The service: its tools, served over MCP through effect-actions |
| `tools/git-guard/` | The policy that refuses commands that skip the commit hook |

Code is grouped by domain, not by mechanism, in flat files under each package's `src/`. Tests mirror `src/` under `tests/`. Layers are chosen only in an app's `src/main.ts`, its composition root. Tests provide their own Layers, for routes through effect-actions' `Testing.layer`.

## House style

These hold from the first line of code:

- **Tools are effect-actions contracts.** Each tool is one `Action.make` with Schema input and success types, implemented with `Action.implement`. `ActionMcp` derives the MCP tools from them.
- **Tools answer in text written for the model,** as Claude Code's and Amp's do: a `Schema.String` success holding the output raw, with facts such as `exit code: 0` or the next offset on short lines beside it. Each tool turns its facts into that text in one place, and each error's `message` is written for the model too. effect-actions 0.37.0 sends a string success raw only to MCP 2025-11-25 clients, so that one place per tool is where a fix in effect-actions gets adopted.
- **Data is Effect Schema.** Every value that crosses a boundary, such as a tool's input and output, a file, the environment or stdin, is decoded with a Schema before code branches on it.
- **State lives in XState charts,** where something has a lifecycle; the file tools hold none. A chart is `src/<name>-chart.ts`, and it is pure: no `invoke`, timers or actors. It imports only `xstate` and other charts, and uses no `Date`, `crypto` or `Math.random`. Lint enforces this in `apps/*/src/*-chart.ts`. What a chart needs from the world rides on its event, and fibers do the work that takes time, then tell the chart what they found as an event. `command-chart.ts`, a backgrounded command's lifecycle, is the one chart today.
- **Errors carry context.** Each failure a caller can act on is its own tagged error with fields.
- **Tests are Effects** under `@effect/vitest`, with `it.effect`. Use a property test where a rule holds for every input, and keep tests to behaviour a caller relies on.

## Dependencies

Dependencies are pinned exactly in the catalog in `pnpm-workspace.yaml`, and packages take them as `catalog:`. Registry releases wait a day (`minimumReleaseAge`), except the scopes `minimumReleaseAgeExclude` lists.

## Effect

Before writing or reviewing Effect code, read `node_modules/effect/AGENTS.md` in the package you are changing and the examples it links under `ai-docs/`. They ship with the installed `effect`, so they match the APIs the code compiles against. For exact signatures, read that package's installed source and types in `node_modules/effect` and `node_modules/@effect/*`. For what npm does not ship, such as `MIGRATION.md`, the guides under `packages/effect/` and the tests, read `.agents/repos/effect`, a shallow clone of `Effect-TS/effect` at the installed version's tag. If it is missing, or `git -C .agents/repos/effect tag --points-at HEAD --list 'effect@*'` names another version, delete it and clone again with `git clone --depth 1 --branch effect@<version> https://github.com/Effect-TS/effect .agents/repos/effect`. Do not write Effect APIs from memory or from examples for another version.
