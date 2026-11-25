import * as Action from "@gjermundgaraba/effect-actions/Action";
import { Effect, FileSystem, Option, Path, Schema } from "effect";

import type { Ending } from "./command-chart.ts";
import { CommandUnavailable, Commands } from "./commands.ts";
import type { Progress } from "./commands.ts";
import { bytesOf, limits, linesOf, tail } from "./output.ts";
import type { Cut } from "./output.ts";

export class WorkdirNotFound extends Schema.TaggedError<
  WorkdirNotFound,
  { readonly brand: unique symbol }
>()("WorkdirNotFound", { workdir: Schema.String, message: Schema.String }) {}

export class UnknownCommand extends Schema.TaggedError<
  UnknownCommand,
  { readonly brand: unique symbol }
>()("UnknownCommand", { id: Schema.Int, message: Schema.String }) {}

const maxWait = 600_000;

const shellWait = 120_000;

const followWait = 30_000;

const Wait = (fallback: number) =>
  Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: maxWait }))
  ).annotate({
    description: `How long to wait, in milliseconds, from 0 to ${maxWait}. Defaults to ${fallback}.`,
  });

export const Shell = Action.make("shell", {
  description: [
    "Run a bash command and get its output, stdout and stderr merged in order, and its exit code.",
    "stdin is empty, so a command that waits for input gets none: pass flags such as --yes instead.",
    `Long output keeps its last ${limits.lines} lines or ${limits.bytes / 1024} KB, and the answer names a file holding all of it.`,
    "A command still running when timeout_ms runs out keeps running in the background, and the answer gives its id for shell_output.",
    "When the command ends, anything it left running, such as with & or nohup, is stopped with it.",
    "To start a server or watcher and carry on, run it in the foreground with timeout_ms 0 or a few seconds, and follow it with shell_output.",
    "Search with rg, find files with rg --files.",
  ].join(" "),
  input: {
    command: Schema.String.annotate({
      description: "The bash command to run.",
    }),
    workdir: Schema.optional(Schema.String).annotate({
      description:
        "The directory to run it in. Defaults to the directory clankerhands runs in.",
    }),
    timeout_ms: Wait(shellWait),
  },
  success: Schema.String,
  error: [WorkdirNotFound, CommandUnavailable],
  readOnly: false,
  caller: Action.Anyone,
});

export const ShellOutput = Action.make("shell_output", {
  description: [
    "Follow a command shell left running in the background: wait for it, get the output it wrote since you last looked, and its exit code once it ends.",
    "It answers as soon as the command ends, or when timeout_ms runs out.",
    "Set stop to end the command and everything it started.",
  ].join(" "),
  input: {
    id: Schema.Int.annotate({ description: "The id shell gave the command." }),
    timeout_ms: Wait(followWait),
    stop: Schema.optional(Schema.Boolean).annotate({
      description:
        "Stop the command: SIGTERM, then SIGKILL after 5 seconds. Defaults to false.",
    }),
  },
  success: Schema.String,
  error: UnknownCommand,
  readOnly: false,
  caller: Action.Anyone,
});

const endingText = (ending: Ending, stopped: boolean): string => {
  const on = stopped ? " (stopped on request)" : "";

  return ending._tag === "Exited"
    ? `exit code: ${ending.code}${on}`
    : `ended by ${ending.signal}${on}`;
};

const cutNote = (kept: Cut, total: number, log: string): string => {
  if (kept._tag === "LinePart") {
    return `[The output ends in a line longer than ${limits.bytes / 1024} KB; this shows its last ${bytesOf(kept.part)} bytes. Full output: ${log}]\n`;
  }

  if (kept.lines.length < total) {
    return `[Showing the last ${kept.lines.length} of ${total} lines. Full output: ${log}]\n`;
  }

  return "";
};

const statusText = ({ id, snapshot }: Progress): string => {
  const { ending, stopRequested } = snapshot.context;

  if (ending !== undefined) {
    return endingText(ending, stopRequested);
  }

  if (snapshot.matches("stopping")) {
    return `[Stopping id ${id}. Call shell_output with id ${id} to see it end.]`;
  }

  return `[Still running as id ${id}. Call shell_output with id ${id} to wait for more output, or with stop: true to stop it.]`;
};

const emptyText = (fresh: boolean): string =>
  fresh ? "(no output)" : "(no new output)";

const keptText = (kept: Cut): string =>
  kept._tag === "LinePart" ? kept.part : kept.lines.join("\n");

const progressText = (progress: Progress, fresh: boolean): string => {
  const all = linesOf(progress.output);
  const kept = tail(all);

  const body = all.length === 0 ? emptyText(fresh) : keptText(kept);

  return `${cutNote(kept, all.length, progress.log)}${body}\n${statusText(progress)}`;
};

export const shell = Action.implement(
  [Shell, ShellOutput],
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const commands = yield* Commands;

    return {
      shell: ({ command, workdir = ".", timeout_ms = shellWait }) =>
        Effect.gen(function* () {
          const cwd = paths.resolve(workdir);

          const isDirectory = yield* fs.stat(cwd).pipe(
            Effect.map((info) => info.type === "Directory"),
            Effect.orElseSucceed(() => false)
          );

          if (!isDirectory) {
            return yield* new WorkdirNotFound({
              workdir: cwd,
              message: `${cwd} is not a directory, so the command did not run.`,
            });
          }

          return progressText(
            yield* commands.start(command, cwd, timeout_ms),
            true
          );
        }),
      shell_output: ({ id, timeout_ms = followWait, stop = false }) =>
        Effect.gen(function* () {
          const progress = yield* commands.follow(id, timeout_ms, stop);

          if (Option.isNone(progress)) {
            return yield* new UnknownCommand({
              id,
              message: `No command has id ${id}. shell gives an id when a command is still running at its timeout.`,
            });
          }

          return progressText(progress.value, false);
        }),
    };
  })
);
