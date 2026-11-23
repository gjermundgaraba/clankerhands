import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { refusal, refusalOf } from "../src/policy.ts";

const skipsTheHook = [
  'git commit -n -m "wip"',
  'git commit -anm "wip"',
  "git commit --no-verify -m wip",
  "git commit --no-veri -m wip",
  "cd apps && git commit -n",
  "git status; git commit -qn",
  "/usr/bin/git commit -n",
  "git -C /repo commit -n -m wip",
  "git -c core.hooksPath=/dev/null commit -m wip",
  "git config core.hooksPath /tmp/none",
  "git config --unset core.hookspath",
  "VP_GIT_HOOKS=0 git commit -m wip",
  "HUSKY=0 git commit -m wip",
  "export VITE_GIT_HOOKS=0",
  "echo 'export VP_GIT_HOOKS=0' > ~/.config/vite-plus/hooks-init.sh",
  "vp hooks disable",
  "git merge --no-verify feature",
  "git push --no-verify",
];

const keepsTheHook = [
  'git commit -m "handle -n in the parser"',
  "git commit -mn",
  "git commit -m -n",
  'git commit -am "wip"',
  "git commit --amend --no-edit",
  "git log -n 3",
  "grep -n foo README.md && git commit -m ok",
  "echo 'git commit -n'",
  "git config user.name clanker",
  "vp hooks status",
];

describe("the git guard", () => {
  it("refuses every command that skips the commit hook", () => {
    expect(
      skipsTheHook.filter((command) => Option.isNone(refusal(command)))
    ).toStrictEqual([]);
  });

  it("lets every other command through", () => {
    expect(
      keepsTheHook.filter((command) => Option.isSome(refusal(command)))
    ).toStrictEqual([]);
  });

  it("reads the command from an Amp or Claude Code tool call", () => {
    expect(Option.isSome(refusalOf({ command: "git commit -n" }))).toBe(true);
    expect(Option.isSome(refusalOf({ cmd: "git commit -n" }))).toBe(true);
    expect(Option.isNone(refusalOf({ path: "git commit -n" }))).toBe(true);
  });
});
