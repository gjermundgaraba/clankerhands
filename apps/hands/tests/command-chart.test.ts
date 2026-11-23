import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { advance, started } from "../src/command-chart.ts";

const exited = (code: number) =>
  ({ type: "ended", ending: { _tag: "Exited", code } }) as const;

describe("a command's lifecycle", () => {
  it.effect("ends with the exit code it reports first", () =>
    Effect.sync(() => {
      const ended = advance(advance(started(), exited(3)), exited(0));

      assert.isTrue(ended.matches("ended"));
      assert.deepStrictEqual(ended.context, {
        ending: { _tag: "Exited", code: 3 },
        stopRequested: false,
      });
    })
  );

  it.effect("remembers that it was asked to stop", () =>
    Effect.sync(() => {
      const stopping = advance(started(), { type: "stop" });

      assert.isTrue(stopping.matches("stopping"));

      const ended = advance(stopping, exited(143));

      assert.isTrue(ended.matches("ended"));
      assert.isTrue(ended.context.stopRequested);
    })
  );

  it.effect("ignores a stop once it has ended", () =>
    Effect.sync(() => {
      const ended = advance(started(), exited(0));

      assert.deepStrictEqual(
        advance(ended, { type: "stop" }).context,
        ended.context
      );
    })
  );
});
