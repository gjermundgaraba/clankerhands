import * as Action from "@gjermundgaraba/effect-actions/Action";
import { Effect, FileSystem, Option, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { limits, linesOf, tail } from "./output.ts";
import type { Cut } from "./output.ts";

export class WorkdirNotFound extends Schema.TaggedError<
  WorkdirNotFound,
  { readonly brand: unique symbol }
>()("WorkdirNotFound", { workdir: Schema.String, message: Schema.String }) {}

export class ShellUnavailable extends Schema.TaggedError<
  ShellUnavailable,
  { readonly brand: unique symbol }
>()("ShellUnavailable", { message: Schema.String }) {}

const maxTimeout = 600_000;

const defaultTimeout = 120_000;

export const Shell = Action.make("shell", {
  description: [
    "Run a bash command and get its output, stdout and stderr merged in order, and its exit code.",
    "stdin is empty, so a command that waits for input gets none: pass flags such as --yes instead.",
    `Long output keeps its last ${limits.lines} lines or ${limits.bytes / 1024} KB, and the answer names a file holding all of it.`,
    "Search with rg, find files with rg --files, and chain commands with && as usual.",
  ].join(" "),
  input: {
    command: Schema.String.annotate({
      description: "The bash command to run.",
    }),
    workdir: Schema.optional(Schema.String).annotate({
      description:
        "The directory to run it in. Defaults to the directory clankerhands runs in.",
    }),
    timeout_ms: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxTimeout }))
    ).annotate({
      description: `How long to wait for the command, in milliseconds, at most ${maxTimeout}. Defaults to ${defaultTimeout}.`,
    }),
  },
  success: Schema.String,
  error: [WorkdirNotFound, ShellUnavailable],
  readOnly: false,
  caller: Action.Anyone,
});

type Ending =
  | { readonly _tag: "Exited"; readonly code: number }
  | { readonly _tag: "Signalled"; readonly reason: string }
  | { readonly _tag: "TimedOut"; readonly afterMs: number };

interface RunFacts {
  readonly output: string;
  readonly log: string;
  readonly ending: Ending;
}

const endingText = (ending: Ending): string => {
  switch (ending._tag) {
    case "Exited": {
      return `exit code: ${ending.code}`;
    }

    case "Signalled": {
      return `ended by a signal: ${ending.reason}`;
    }

    case "TimedOut": {
      return `[Stopped after ${ending.afterMs} ms, when timeout_ms ran out. Run it again with a longer timeout_ms.]`;
    }
  }
};

const cutNote = (kept: Cut, total: number, log: string): string => {
  if (kept.partial) {
    return `[The output ends in a line longer than ${limits.bytes / 1024} KB; this shows its last ${kept.keptBytes} bytes. Full output: ${log}]\n`;
  }

  if (kept.lines.length < total) {
    return `[Showing the last ${kept.lines.length} of ${total} lines. Full output: ${log}]\n`;
  }

  return "";
};

const runText = ({ output, log, ending }: RunFacts): string => {
  const all = linesOf(output);
  const kept = tail(all);
  const body = all.length === 0 ? "(no output)" : kept.lines.join("\n");

  return `${cutNote(kept, all.length, log)}${body}\n${endingText(ending)}`;
};

const wrapper = 'exec >"$0" 2>&1 </dev/null; exec bash -c "$1"';

export const shell = Action.implement(
  Shell,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const logs = yield* fs.makeTempDirectoryScoped({ prefix: "clankerhands-" });
    let runs = 0;

    return ({ command, workdir = ".", timeout_ms = defaultTimeout }) =>
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

        runs += 1;

        const log = paths.join(logs, `${runs}.log`);

        const ending = yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(
              ChildProcess.make("bash", ["-c", wrapper, log, command], {
                cwd,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              })
            );

            const exited = yield* handle.exitCode.pipe(
              Effect.map((code): Ending => ({ _tag: "Exited", code })),
              Effect.catchTag("PlatformError", (error) =>
                Effect.succeed<Ending>({
                  _tag: "Signalled",
                  reason: error.reason.message,
                })
              ),
              Effect.timeoutOption(timeout_ms)
            );

            if (Option.isSome(exited)) {
              return exited.value;
            }

            yield* handle.kill({ forceKillAfter: "5 seconds" });

            return { _tag: "TimedOut", afterMs: timeout_ms } satisfies Ending;
          })
        ).pipe(
          Effect.mapError(
            (error) =>
              new ShellUnavailable({
                message: `The command could not be run: ${error.reason.message}`,
              })
          )
        );

        const output = yield* fs
          .readFileString(log)
          .pipe(Effect.orElseSucceed(() => ""));

        return runText({ output, log, ending });
      });
  })
);
