import type { PluginAPI } from "@ampcode/plugin";
import { Option } from "effect";

import { refusalOf } from "../../tools/git-guard/src/policy.ts";

export const description =
  "Refuses shell commands that would skip clankerhands' pre-commit hook, such as git commit -n or --no-verify.";

export default function gitGuard(amp: PluginAPI) {
  amp.on("tool.call", (event) =>
    Option.match(refusalOf(event.input), {
      onNone: () => ({ action: "allow" }),
      onSome: (message) => ({ action: "reject-and-continue", message }),
    })
  );
}
