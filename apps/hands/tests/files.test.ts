import { assert, describe, it } from "@effect/vitest";
import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";
import { Effect, FileSystem, Path } from "effect";

import { Read, Write } from "../src/files.ts";
import { served } from "./served.ts";

const encoder = new TextEncoder();

const withFile = (name: string, content: Uint8Array) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    const path = paths.join(dir, name);

    yield* fs.writeFile(path, content);

    return { dir, path };
  });

describe("read", () => {
  it.effect("numbers lines as the number, a tab, then the raw line", () =>
    Effect.gen(function* () {
      const { path } = yield* withFile(
        "a.ts",
        encoder.encode('const a = "x";\n\tindented\n')
      );

      const mcp = yield* ActionMcp.client([Read]);

      assert.strictEqual(
        yield* mcp.read({ path }),
        '1\tconst a = "x";\n2\t\tindented'
      );
    }).pipe(Effect.provide(served))
  );

  it.effect("pages a long file and names the offset to read next", () =>
    Effect.gen(function* () {
      const lines = Array.from({ length: 2500 }, (_, i) => `line ${i + 1}`);

      const { path } = yield* withFile(
        "long.txt",
        encoder.encode(`${lines.join("\n")}\n`)
      );

      const mcp = yield* ActionMcp.client([Read]);
      const first = yield* mcp.read({ path });

      assert.isTrue(first.startsWith("1\tline 1\n"));
      assert.include(first, "2000\tline 2000\n");
      assert.notInclude(first, "2001\t");
      assert.isTrue(
        first.endsWith(
          "[Showing lines 1-2000 of 2500. Use offset=2001 to continue.]"
        )
      );

      const second = yield* mcp.read({ path, offset: 2001 });

      assert.isTrue(second.startsWith("2001\tline 2001\n"));
      assert.isTrue(second.endsWith("2500\tline 2500"));

      const slice = yield* mcp.read({ path, offset: 10, limit: 2 });

      assert.strictEqual(
        slice,
        "10\tline 10\n11\tline 11\n\n[Showing lines 10-11 of 2500. Use offset=12 to continue.]"
      );
    }).pipe(Effect.provide(served))
  );

  it.effect("fails with a tagged error for each thing a caller can fix", () =>
    Effect.gen(function* () {
      const { dir, path } = yield* withFile(
        "short.txt",
        encoder.encode("one\ntwo\n")
      );

      const binary = yield* withFile("bin", new Uint8Array([1, 0, 2]));
      const mcp = yield* ActionMcp.client([Read]);

      const tagOf = (input: { path: string; offset?: number }) =>
        mcp.read(input).pipe(
          Effect.flip,
          Effect.map((error) => error._tag)
        );

      assert.strictEqual(
        yield* tagOf({ path: `${dir}/missing` }),
        "FileNotFound"
      );
      assert.strictEqual(yield* tagOf({ path: dir }), "NotAFile");
      assert.strictEqual(yield* tagOf({ path: binary.path }), "BinaryFile");
      assert.strictEqual(yield* tagOf({ path, offset: 3 }), "OffsetPastEnd");
    }).pipe(Effect.provide(served))
  );
});

describe("write", () => {
  it.effect("creates parent directories, then overwrites, saying which", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const path = `${dir}/a/b/c.txt`;
      const mcp = yield* ActionMcp.client([Write]);

      assert.strictEqual(
        yield* mcp.write({ path, content: "one\ntwo\n" }),
        `Created ${path} (2 lines).`
      );
      assert.strictEqual(
        yield* mcp.write({ path, content: "three" }),
        `Overwrote ${path} (1 line).`
      );
      assert.strictEqual(yield* fs.readFileString(path), "three");

      const error = yield* mcp
        .write({ path: dir, content: "x" })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "NotAFile");
    }).pipe(Effect.provide(served))
  );
});
