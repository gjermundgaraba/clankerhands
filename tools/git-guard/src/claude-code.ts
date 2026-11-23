import { stdin } from "node:process";
import { text } from "node:stream/consumers";

import { Option, Schema } from "effect";

import { refusalOf } from "./policy.ts";

const PreToolUse = Schema.fromJsonString(
  Schema.Struct({ tool_input: Schema.Unknown })
);

const reason = Schema.decodeOption(PreToolUse)(await text(stdin)).pipe(
  Option.flatMap(({ tool_input }) => refusalOf(tool_input))
);

if (Option.isSome(reason)) {
  process.stderr.write(`${reason.value}\n`);
  process.exitCode = 2;
}
