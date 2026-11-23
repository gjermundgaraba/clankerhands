import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { bytesOf, head, tail } from "../src/output.ts";
import type { Cut, Limits } from "../src/output.ts";

const Lines = Schema.Array(Schema.String);

const Within = Schema.Struct({
  lines: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
  bytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120 })),
});

const sizeOf = (kept: Cut): number =>
  kept.lines.reduce((total, line) => total + bytesOf(line) + 1, 0);

const assertWithin = (kept: Cut, within: Limits) => {
  assert.isAtMost(kept.lines.length, within.lines);

  if (kept.partial) {
    assert.strictEqual(kept.lines.length, 1);
    assert.isAtMost(bytesOf(kept.lines[0] ?? ""), within.bytes);
  } else {
    assert.isAtMost(sizeOf(kept), within.bytes);
  }
};

const assertFull = (kept: Cut, next: string | undefined, within: Limits) => {
  if (kept.partial || next === undefined) {
    return;
  }

  const room =
    kept.lines.length < within.lines &&
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

        if (kept.partial) {
          assert.isTrue(lines[0]?.startsWith(kept.lines[0] ?? ""));
        } else {
          assert.deepStrictEqual(kept.lines, lines.slice(0, kept.lines.length));
        }

        assertFull(kept, lines[kept.lines.length], within);
      })
  );

  it.effect.prop(
    "tail keeps the last lines, in order, within both limits, and as many as fit",
    [Lines, Within],
    ([lines, within]) =>
      Effect.sync(() => {
        const kept = tail(lines, within);

        assertWithin(kept, within);

        if (kept.partial) {
          assert.isTrue(lines.at(-1)?.endsWith(kept.lines[0] ?? ""));
        } else {
          assert.deepStrictEqual(
            kept.lines,
            lines.slice(lines.length - kept.lines.length)
          );
        }

        assertFull(kept, lines.at(-1 - kept.lines.length), within);
      })
  );

  it.effect("cuts a long line between characters, not inside one", () =>
    Effect.sync(() => {
      const kept = head(["ééé"], { lines: 5, bytes: 5 });

      assert.deepStrictEqual(kept.lines, ["éé"]);
      assert.isTrue(kept.partial);
    })
  );
});
