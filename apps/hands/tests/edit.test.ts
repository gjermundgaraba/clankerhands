import { assert, describe, it } from "@effect/vitest";
import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";
import { Effect, FileSystem, Schema } from "effect";

import { Edit, exactOrLooseSpans, loosen } from "../src/edit.ts";
import { served } from "./served.ts";

const Text = Schema.String.check(
  Schema.isPattern(/^[a-z \n]*$/u),
  Schema.isMaxLength(40)
);

const asPlain = (to: string, codes: readonly number[]) =>
  codes.map((code) => [String.fromCodePoint(code), to] as const);

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const lookalikes = new Map([
  ...asPlain("'", [0x20_18, 0x20_19, 0x20_1a, 0x20_1b, 0x20_32]),
  ...asPlain('"', [0x20_1c, 0x20_1d, 0x20_1e, 0x20_1f, 0x20_33]),
  ...asPlain("-", [...range(0x20_10, 0x20_15), 0x22_12]),
  ...asPlain(" ", [
    0xa0,
    ...range(0x20_00, 0x20_0a),
    0x20_2f,
    0x20_5f,
    0x30_00,
  ]),
]);

const Mixed = Schema.Array(
  Schema.Literals([...lookalikes.keys(), "a", "b", "'", '"', "-", " ", "\n"])
).check(Schema.isMaxLength(60));

describe("matching", () => {
  it.effect.prop(
    "a unique exact substring matches its own span",
    [Text, Text, Schema.String.check(Schema.isPattern(/^[xyz]{1,8}$/u))],
    ([before, after, marker]) =>
      Effect.sync(() => {
        const text = `${before}Q${marker}Q${after}`;
        const needle = `Q${marker}Q`;

        assert.deepStrictEqual(exactOrLooseSpans(text, needle), [
          [before.length, before.length + needle.length],
        ]);
      })
  );

  it.effect.prop(
    "a needle with plain quotes, dashes and spaces finds the lookalike span in the file",
    [Text, Text, Schema.String.check(Schema.isPattern(/^[a-z]{1,8}$/u))],
    ([before, after, word]) =>
      Effect.sync(() => {
        const inFile = `\u201C${word}\u2014${word}\u00A0\u2019`;
        const text = `${before}Q${inFile}Q${after}`;
        const needle = `Q"${word}-${word} 'Q`;
        const start = before.length;

        assert.deepStrictEqual(exactOrLooseSpans(text, needle), [
          [start, start + inFile.length + 2],
        ]);
      })
  );

  it.effect.prop(
    "makes every lookalike quote, dash and space the plain character it looks like",
    [Mixed],
    ([chars]) =>
      Effect.sync(() => {
        const ascii = chars.map((char) => lookalikes.get(char) ?? char);

        assert.strictEqual(
          loosen(chars.join("")).text,
          loosen(ascii.join("")).text
        );
      })
  );

  it.effect("ignores trailing whitespace and CRLF on the file's side", () =>
    Effect.sync(() => {
      const text = "one  \r\ntwo\t\r\nthree";

      assert.deepStrictEqual(exactOrLooseSpans(text, "one\ntwo\nthree"), [
        [0, text.length],
      ]);
    })
  );
});

const fileWith = (content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = `${dir}/file.ts`;

    yield* fs.writeFileString(path, content);

    return path;
  });

describe("edit", () => {
  it.effect("replaces one exact match and shows the changed lines", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* fileWith('a\nconst x = "1";\nb\n');
      const mcp = yield* ActionMcp.client([Edit]);

      assert.strictEqual(
        yield* mcp.edit({
          path,
          old_string: 'const x = "1";',
          new_string: 'const x = "2";\nconst y = 3;',
        }),
        `Updated ${path} (1 replacement).\n2\tconst x = "2";\n3\tconst y = 3;`
      );
      assert.strictEqual(
        yield* fs.readFileString(path),
        'a\nconst x = "2";\nconst y = 3;\nb\n'
      );
    }).pipe(Effect.provide(served))
  );

  it.effect(
    "accepts old_str and new_str too, and keeps CRLF line endings",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* fileWith("one\r\ntwo\r\n");
        const mcp = yield* ActionMcp.client([Edit]);

        yield* mcp.edit({ path, old_str: "two", new_str: "2\n3" });

        assert.strictEqual(yield* fs.readFileString(path), "one\r\n2\r\n3\r\n");
      }).pipe(Effect.provide(served))
  );

  it.effect("refuses more than one match unless replace_all is set", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* fileWith("x = 1\ny = 2\nx = 1\n");
      const mcp = yield* ActionMcp.client([Edit]);

      const error = yield* mcp
        .edit({ path, old_string: "x = 1", new_string: "x = 9" })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "AmbiguousMatch");
      assert.deepStrictEqual(
        error._tag === "AmbiguousMatch" ? error.lines : [],
        [1, 3]
      );

      yield* mcp.edit({
        path,
        old_string: "x = 1",
        new_string: "x = 9",
        replace_all: true,
      });

      assert.strictEqual(
        yield* fs.readFileString(path),
        "x = 9\ny = 2\nx = 9\n"
      );
    }).pipe(Effect.provide(served))
  );

  it.effect("on a miss, answers the closest lines, numbered", () =>
    Effect.gen(function* () {
      const lines = Array.from(
        { length: 30 },
        (_, i) => `line number ${i + 1}`
      );

      lines[19] = "  return computeTotal(items, taxRate);";

      const path = yield* fileWith(lines.join("\n"));
      const mcp = yield* ActionMcp.client([Edit]);

      const error = yield* mcp
        .edit({
          path,
          old_string: "return computeTotal(items, rate);",
          new_string: "x",
        })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "NoMatch");
      assert.include(
        error._tag === "NoMatch" ? error.closest : "",
        "20\t  return computeTotal(items, taxRate);"
      );
    }).pipe(Effect.provide(served))
  );

  it.effect("refuses an edit that changes nothing", () =>
    Effect.gen(function* () {
      const path = yield* fileWith("same\n");
      const mcp = yield* ActionMcp.client([Edit]);

      const error = yield* mcp
        .edit({ path, old_string: "same", new_string: "same" })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "NoChange");
    }).pipe(Effect.provide(served))
  );
});
