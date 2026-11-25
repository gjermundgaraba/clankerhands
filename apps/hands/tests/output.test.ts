import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { bytesOf, head, tail } from "../src/output.ts";
import type { Cut, Limits } from "../src/output.ts";

const Lines = Schema.Array(Schema.String);

const Within = Schema.Struct({
  lines: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
  bytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120 })),
});

const sizeOf = (lines: readonly string[]): number =>
  lines.reduce((total, line) => total + bytesOf(line) + 1, 0);

const assertWithin = (kept: Cut, within: Limits) => {
  if (kept._tag === "LinePart") {
    assert.isAtMost(bytesOf(kept.part), within.bytes);
  } else {
    assert.isAtMost(kept.lines.length, within.lines);
    assert.isAtMost(sizeOf(kept.lines), within.bytes);
  }
};

const assertFull = (
  kept: readonly string[],
  next: string | undefined,
  within: Limits
) => {
  if (next === undefined) {
    return;
  }

  const room =
    kept.length < within.lines &&
    sizeOf(kept) + bytesOf(next) + 1 <= within.bytes;

  assert.isFalse(room, "a line that fits was left out");
};

describe("the cut", () => {
  it.effect.prop(
    "head keeps the first lines, within both limits, and as many as fit",
    [Lines, Within],
    ([lines, within]) =>
      Effect.sync(() => {
        const kept = head(lines, within);

        assertWithin(kept, within);

        if (kept._tag === "LinePart") {
          assert.isTrue(lines[0]?.startsWith(kept.part));
        } else {
          assert.deepStrictEqual(kept.lines, lines.slice(0, kept.lines.length));
          assertFull(kept.lines, lines[kept.lines.length], within);
        }
      })
  );

  it.effect.prop(
    "tail keeps the last lines, in order, within both limits, and as many as fit",
    [Lines, Within],
    ([lines, within]) =>
      Effect.sync(() => {
        const kept = tail(lines, within);

        assertWithin(kept, within);

        if (kept._tag === "LinePart") {
          assert.isTrue(lines.at(-1)?.endsWith(kept.part));
        } else {
          assert.deepStrictEqual(
            kept.lines,
            lines.slice(lines.length - kept.lines.length)
          );
          assertFull(kept.lines, lines.at(-1 - kept.lines.length), within);
        }
      })
  );

  it.effect("cuts a long line between characters, not inside one", () =>
    Effect.sync(() => {
      const kept = head(["ééé"], { lines: 5, bytes: 5 });

      assert.deepStrictEqual(kept, { _tag: "LinePart", part: "éé" });
    })
  );
});
