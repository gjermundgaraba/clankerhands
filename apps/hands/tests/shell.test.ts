import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";
import * as Testing from "@gjermundgaraba/effect-actions/Testing";
import { Effect, FileSystem, Layer } from "effect";

import { Commands } from "../src/commands.ts";
import { routes } from "../src/routes.ts";
import { Shell, ShellOutput } from "../src/shell.ts";

const served = Layer.mergeAll(
  Testing.layer(routes).pipe(
    Layer.provide(Commands.layer),
    Layer.provide(NodeServices.layer)
  ),
  NodeServices.layer
);

describe("shell", () => {
  it.live("merges stdout and stderr in order and ends with the exit code", () =>
    Effect.gen(function* () {
      const mcp = yield* ActionMcp.client([Shell]);

      assert.strictEqual(
        yield* mcp.shell({ command: "echo a; echo b >&2; echo c; exit 3" }),
        "a\nb\nc\nexit code: 3"
      );
    }).pipe(Effect.provide(served))
  );

  it.live(
    "runs in workdir, with empty stdin, and says when there is no output",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const mcp = yield* ActionMcp.client([Shell]);

        assert.strictEqual(
          yield* mcp.shell({ command: "pwd", workdir: dir }),
          `${yield* fs.realPath(dir)}\nexit code: 0`
        );
        assert.strictEqual(
          yield* mcp.shell({ command: "cat" }),
          "(no output)\nexit code: 0"
        );
      }).pipe(Effect.provide(served))
  );

  it.live(
    "keeps the tail of long output and names the file holding all of it",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const mcp = yield* ActionMcp.client([Shell]);
        const answer = yield* mcp.shell({ command: "seq 200000" });

        const note =
          /^\[Showing the last (?<kept>\d+) of 200000 lines\. Full output: (?<log>\S+)\]\n/u.exec(
            answer
          );

        assert.isNotNull(note);
        assert.isTrue(answer.endsWith("\n200000\nexit code: 0"));

        const full = yield* fs.readFileString(note?.groups?.["log"] ?? "");

        assert.strictEqual(full.split("\n").length, 200_001);
      }).pipe(Effect.provide(served))
  );

  it.live(
    "leaves a slow command running, then follows it to its exit code",
    () =>
      Effect.gen(function* () {
        const mcp = yield* ActionMcp.client([Shell, ShellOutput]);

        const first = yield* mcp.shell({
          command: "echo started; sleep 1; echo done",
          timeout_ms: 200,
        });

        const id = Number(/as id (?<id>\d+)\./u.exec(first)?.groups?.["id"]);

        assert.isTrue(first.startsWith("started\n[Still running as id "));
        assert.strictEqual(
          yield* mcp.shell_output({ id, timeout_ms: 5000 }),
          "done\nexit code: 0"
        );
        assert.strictEqual(
          yield* mcp.shell_output({ id }),
          "(no new output)\nexit code: 0"
        );
      }).pipe(Effect.provide(served))
  );

  it.live("stops a command and everything it started", () =>
    Effect.gen(function* () {
      const mcp = yield* ActionMcp.client([Shell, ShellOutput]);
      const marker = `clankerhands-test-${process.pid}`;

      const first = yield* mcp.shell({
        command: `bash -c 'sleep 1000; : ${marker}' & sleep 1000; wait`,
        timeout_ms: 0,
      });

      const id = Number(/as id (?<id>\d+)\./u.exec(first)?.groups?.["id"]);

      const stopped = yield* mcp.shell_output({
        id,
        stop: true,
        timeout_ms: 10_000,
      });

      assert.match(stopped, /stopped on request/u);

      const stillRunning = yield* mcp.shell({
        command: `pgrep -fc '[c]${marker.slice(1)}'; true`,
      });

      assert.strictEqual(stillRunning, "0\nexit code: 0");
    }).pipe(Effect.provide(served))
  );

  it.live("answers an unknown id with its own error", () =>
    Effect.gen(function* () {
      const mcp = yield* ActionMcp.client([ShellOutput]);
      const error = yield* mcp.shell_output({ id: 9999 }).pipe(Effect.flip);

      assert.strictEqual(error._tag, "UnknownCommand");
    }).pipe(Effect.provide(served))
  );

  it.live("refuses a workdir that is not a directory", () =>
    Effect.gen(function* () {
      const mcp = yield* ActionMcp.client([Shell]);

      const error = yield* mcp
        .shell({ command: "true", workdir: "/nowhere/at/all" })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "WorkdirNotFound");
    }).pipe(Effect.provide(served))
  );
});
