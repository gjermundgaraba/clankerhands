import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";
import * as Testing from "@gjermundgaraba/effect-actions/Testing";
import { Effect, FileSystem, Layer } from "effect";

import { routes } from "../src/routes.ts";
import { Shell } from "../src/shell.ts";

const served = Layer.mergeAll(
  Testing.layer(routes).pipe(Layer.provide(NodeServices.layer)),
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

  it.live("stops a command that outlives timeout_ms", () =>
    Effect.gen(function* () {
      const mcp = yield* ActionMcp.client([Shell]);

      const answer = yield* mcp.shell({
        command: "echo started; sleep 30",
        timeout_ms: 300,
      });

      assert.isTrue(answer.startsWith("started\n[Stopped after 300 ms"));
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
