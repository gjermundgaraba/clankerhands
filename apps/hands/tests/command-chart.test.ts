import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { advance, started } from "../src/command-chart.ts";

const exited = (code: number) =>
  ({ type: "ended", ending: { _tag: "Exited", code } }) as const;

describe("a command's lifecycle", () => {
  it.effect("remembers that it was asked to stop", () =>
    Effect.sync(() => {
      const stopping = advance(started(), { type: "stop" });

      assert.isTrue(stopping.matches("stopping"));

      const ended = advance(stopping, exited(143));

      assert.isTrue(ended.matches("ended"));
      assert.isTrue(ended.context.stopRequested);
    })
  );

  it.effect(
    "ignores a stop that arrives after it ended, as one can when the command ends between follow's read and its stop",
    () =>
      Effect.sync(() => {
        const ended = advance(started(), exited(0));

        assert.deepStrictEqual(
          advance(ended, { type: "stop" }).context,
          ended.context
        );
      })
  );
});
