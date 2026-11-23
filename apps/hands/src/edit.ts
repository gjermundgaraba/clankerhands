import * as Action from "@gjermundgaraba/effect-actions/Action";
import { Effect, FileSystem, Path, Schema } from "effect";

import { failureOf, FileNotFound, FileUnavailable, NotAFile } from "./files.ts";

export class NoMatch extends Schema.TaggedError<
  NoMatch,
  { readonly brand: unique symbol }
>()("NoMatch", {
  path: Schema.String,
  closest: Schema.String,
  message: Schema.String,
}) {}

export class AmbiguousMatch extends Schema.TaggedError<
  AmbiguousMatch,
  { readonly brand: unique symbol }
>()("AmbiguousMatch", {
  path: Schema.String,
  count: Schema.Int,
  lines: Schema.Array(Schema.Int),
  message: Schema.String,
}) {}

export class NoChange extends Schema.TaggedError<
  NoChange,
  { readonly brand: unique symbol }
>()("NoChange", { path: Schema.String, message: Schema.String }) {}

const lookalikes: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B\u2032]/gu, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033]/gu, '"'],
  [/[\u2010-\u2015\u2212]/gu, "-"],
  [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/gu, " "],
];

const plainChar = (char: string): string => {
  let plainer = char;

  for (const [from, to] of lookalikes) {
    plainer = plainer.replace(from, to);
  }

  return plainer;
};

/**
 * `text` with lookalike quotes, dashes and spaces made plain, `\r` before a newline dropped, and
 * whitespace at the end of each line dropped; `origin[i]` is where character `i` came from.
 */
export interface Plain {
  readonly text: string;
  readonly origin: readonly number[];
}

export const plain = (text: string): Plain => {
  const chars: string[] = [];
  const origin: number[] = [];
  let pending: Array<readonly [string, number]> = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = plainChar(text.charAt(index));

    if (char === "\n") {
      pending = [];
      chars.push(char);
      origin.push(index);
    } else if (char === " " || char === "\t" || char === "\r") {
      pending.push([char, index]);
    } else {
      for (const [held, at] of pending) {
        chars.push(held);
        origin.push(at);
      }

      pending = [];
      chars.push(char);
      origin.push(index);
    }
  }

  return { text: chars.join(""), origin };
};

const indexesOf = (text: string, needle: string): readonly number[] => {
  const found: number[] = [];
  let from = text.indexOf(needle);

  while (from !== -1) {
    found.push(from);
    from = text.indexOf(needle, from + needle.length);
  }

  return found;
};

/** Where `needle` occurs in `text`, as spans of `text`: exactly if it can, else ignoring lookalikes. */
export const spansOf = (
  text: string,
  needle: string
): ReadonlyArray<readonly [number, number]> => {
  const exact = indexesOf(text, needle);

  if (exact.length > 0) {
    return exact.map((start) => [start, start + needle.length] as const);
  }

  const haystack = plain(text);
  const wanted = plain(needle).text;

  if (wanted === "") {
    return [];
  }

  return indexesOf(haystack.text, wanted).map((start) => {
    const end = start + wanted.length - 1;

    return [
      haystack.origin[start] ?? 0,
      (haystack.origin[end] ?? 0) + 1,
    ] as const;
  });
};

const lineAt = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

const bigrams = (line: string): readonly string[] => {
  const flat = plain(line).text.trim();

  return Array.from({ length: Math.max(flat.length - 1, 0) }, (_, index) =>
    flat.slice(index, index + 2)
  );
};

const likeness = (a: string, b: string): number => {
  const left = bigrams(a);
  const right = bigrams(b);

  if (left.length + right.length === 0) {
    return a.trim() === b.trim() ? 1 : 0;
  }

  const pool = [...right];
  let shared = 0;

  for (const pair of left) {
    const at = pool.indexOf(pair);

    if (at !== -1) {
      shared += 1;
      pool.splice(at, 1);
    }
  }

  return (2 * shared) / (left.length + right.length);
};

/** The lines of `text` most like `needle`'s, with two lines either side, numbered as read shows them. */
export const closestLines = (text: string, needle: string): string => {
  const lines = text.split("\n");
  const wanted = needle.split("\n");
  let best = 0;
  let bestScore = -1;

  for (
    let start = 0;
    start + wanted.length <= Math.max(lines.length, wanted.length);
    start += 1
  ) {
    const score = wanted.reduce(
      (total, line, index) =>
        total + likeness(line, lines[start + index] ?? ""),
      0
    );

    if (score > bestScore) {
      best = start;
      bestScore = score;
    }
  }

  const from = Math.max(best - 2, 0);
  const to = Math.min(best + wanted.length + 2, lines.length, from + 40);

  return lines
    .slice(from, to)
    .map((line, index) => `${from + index + 1}\t${line}`)
    .join("\n");
};

const changedLines = (text: string, first: number, count: number): string =>
  text
    .split("\n")
    .slice(first - 1, first - 1 + Math.min(count, 20))
    .map((line, index) => `${first + index}\t${line.replace(/\r$/u, "")}`)
    .join("\n");

export const Edit = Action.make("edit", {
  description: [
    "Replace text in a file: old_string must match the file exactly, including indentation, and is replaced by new_string.",
    "If an exact match fails, quotes, dashes and spaces that only look alike, and whitespace at line ends, are ignored.",
    "It fails if old_string occurs more than once, unless replace_all is set; include more surrounding lines to make it unique.",
    "When nothing matches, the answer shows the closest lines in the file.",
    "Leave out the line numbers read shows. To create a file or replace all of it, use write.",
  ].join(" "),
  input: {
    path: Schema.String.annotate({
      description:
        "The file's path, absolute or relative to the directory clankerhands runs in.",
    }),
    old_string: Schema.optional(Schema.String).annotate({
      description: "The text to replace, as it appears in the file.",
    }),
    new_string: Schema.optional(Schema.String).annotate({
      description: "The text to put in its place.",
    }),
    replace_all: Schema.optional(Schema.Boolean).annotate({
      description:
        "Replace every occurrence instead of exactly one. Defaults to false.",
    }),
    old_str: Schema.optional(Schema.String).annotate({
      description: "Another name for old_string.",
    }),
    new_str: Schema.optional(Schema.String).annotate({
      description: "Another name for new_string.",
    }),
  },
  success: Schema.String,
  error: [
    FileNotFound,
    NotAFile,
    FileUnavailable,
    NoMatch,
    AmbiguousMatch,
    NoChange,
  ],
  readOnly: false,
  caller: Action.Anyone,
  mcp: { destructiveHint: true },
});

const missing = (field: string) =>
  new Action.InvalidInput({
    message: `edit needs ${field}.`,
    issues: [{ path: [field], message: `edit needs ${field}.` }],
  });

export const edit = Action.implement(
  Edit,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;

    return (input) =>
      Effect.gen(function* () {
        const path = paths.resolve(input.path);
        const oldString = input.old_string ?? input.old_str;
        const newString = input.new_string ?? input.new_str;

        if (oldString === undefined || oldString === "") {
          return yield* missing("old_string");
        }

        if (newString === undefined) {
          return yield* missing("new_string");
        }

        if (oldString === newString) {
          return yield* new NoChange({
            path,
            message:
              "old_string and new_string are the same, so there is nothing to change.",
          });
        }

        const info = yield* fs.stat(path);

        if (info.type !== "File") {
          return yield* new NotAFile({
            path,
            message: `${path} is a ${info.type.toLowerCase()}, not a file.`,
          });
        }

        const text = yield* fs.readFileString(path);
        const spans = spansOf(text, oldString);

        if (spans.length === 0) {
          const closest = closestLines(text, oldString);

          return yield* new NoMatch({
            path,
            closest,
            message: `old_string was not found in ${path}. The closest lines are below, numbered as read shows them; copy the text without the numbers.\n${closest}`,
          });
        }

        if (spans.length > 1 && input.replace_all !== true) {
          const lines = spans.map(([start]) => lineAt(text, start));

          return yield* new AmbiguousMatch({
            path,
            count: spans.length,
            lines,
            message: `old_string occurs ${spans.length} times in ${path}, at lines ${lines.join(", ")}. Include more surrounding lines to pick one, or set replace_all to replace them all.`,
          });
        }

        const crlf = text.includes("\r\n");

        const replacement = crlf
          ? newString.replaceAll(/\r?\n/gu, "\r\n")
          : newString;

        let updated = text;

        for (const [start, end] of spans.toReversed()) {
          updated = updated.slice(0, start) + replacement + updated.slice(end);
        }

        yield* fs.writeFileString(path, updated);

        const [firstStart] = spans[0] ?? [0];
        const count = spans.length;

        const shown = changedLines(
          updated,
          lineAt(text, firstStart),
          newString.split("\n").length
        );

        return `Updated ${path} (${count} ${count === 1 ? "replacement" : "replacements"}).\n${shown}`;
      }).pipe(
        Effect.catchTag("PlatformError", (error) =>
          Effect.fail(failureOf(paths.resolve(input.path), error))
        )
      );
  })
);
