import * as Action from "@gjermundgaraba/effect-actions/Action";
import { Effect, FileSystem, Path, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";

import { bytesOf, head, limits, linesOf } from "./output.ts";

export class FileNotFound extends Schema.TaggedError<
  FileNotFound,
  { readonly brand: unique symbol }
>()("FileNotFound", { path: Schema.String, message: Schema.String }) {}

export class NotAFile extends Schema.TaggedError<
  NotAFile,
  { readonly brand: unique symbol }
>()("NotAFile", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class BinaryFile extends Schema.TaggedError<
  BinaryFile,
  { readonly brand: unique symbol }
>()("BinaryFile", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class OffsetPastEnd extends Schema.TaggedError<
  OffsetPastEnd,
  { readonly brand: unique symbol }
>()("OffsetPastEnd", {
  path: Schema.String,
  offset: Schema.Int,
  lines: Schema.Int,
  message: Schema.String,
}) {}

export class FileUnavailable extends Schema.TaggedError<
  FileUnavailable,
  { readonly brand: unique symbol }
>()("FileUnavailable", { path: Schema.String, message: Schema.String }) {}

const FilePath = Schema.String.annotate({
  description:
    "The file's path, absolute or relative to the directory clankerhands runs in.",
});

export const Read = Action.make("read", {
  description: [
    "Read a text file. Lines come back numbered, as the line number, a tab, then the line.",
    `A page holds at most ${limits.lines} lines or ${limits.bytes / 1024} KB; when a file is longer, the answer ends with the offset to read next.`,
    "The numbers are not part of the file: leave them out of anything you pass to edit.",
    "To find files or text, use shell with rg, rg --files, or ls.",
  ].join(" "),
  input: {
    path: FilePath,
    offset: Schema.optional(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
    ).annotate({
      description: "The line to start at, counting from 1. Defaults to 1.",
    }),
    limit: Schema.optional(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
    ).annotate({
      description: `How many lines to read at most. Defaults to ${limits.lines}, the most a page holds.`,
    }),
  },
  success: Schema.String,
  error: [FileNotFound, NotAFile, BinaryFile, OffsetPastEnd, FileUnavailable],
  readOnly: true,
  caller: Action.Anyone,
});

interface PageFacts {
  readonly path: string;
  readonly offset: number;
  readonly total: number;
  readonly lines: readonly string[];
  readonly partial: boolean;
  readonly keptBytes: number;
}

const pageText = ({
  path,
  offset,
  total,
  lines,
  partial,
  keptBytes,
}: PageFacts): string => {
  if (total === 0) {
    return `[${path} is empty.]`;
  }

  const last = offset + lines.length - 1;
  const body = lines.join("\n");

  if (partial) {
    const prefix = bytesOf(`${last}\t`);

    return `${body}\n\n[Line ${last} is longer than ${limits.bytes / 1024} KB, and this shows its first ${keptBytes - prefix} bytes. Read the rest of it with shell: sed -n '${last}p' '${path}' | tail -c +${keptBytes - prefix + 1}${last < total ? `. Then continue with offset=${last + 1}.` : "."}]`;
  }

  if (last < total) {
    return `${body}\n\n[Showing lines ${offset}-${last} of ${total}. Use offset=${last + 1} to continue.]`;
  }

  return body;
};

const hasNulInFirst8K = (bytes: Uint8Array): boolean =>
  bytes.subarray(0, 8192).includes(0);

/** The tagged error for a failed file-system call on `path`, written for the model. */
export const failureOf = (path: string, error: PlatformError) =>
  error.reason._tag === "NotFound"
    ? new FileNotFound({ path, message: `${path} does not exist.` })
    : new FileUnavailable({
        path,
        message: `${path} could not be used: ${error.reason.message}`,
      });

export const read = Action.implement(
  Read,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const paths = yield* Path.Path;

    return ({ path: given, offset = 1, limit = limits.lines }) =>
      Effect.gen(function* () {
        const path = paths.resolve(given);
        const info = yield* fs.stat(path);

        if (info.type !== "File") {
          return yield* new NotAFile({
            path,
            message: `${path} is a ${info.type.toLowerCase()}, not a file. List it with shell: ls -la '${path}'`,
          });
        }

        const bytes = yield* fs.readFile(path);

        if (hasNulInFirst8K(bytes)) {
          return yield* new BinaryFile({
            path,
            message: `${path} is a binary file, which read does not show. Inspect it with shell, such as file '${path}' or xxd '${path}' | head.`,
          });
        }

        const all = linesOf(new TextDecoder().decode(bytes));

        if (all.length > 0 && offset > all.length) {
          return yield* new OffsetPastEnd({
            path,
            offset,
            lines: all.length,
            message: `${path} has ${all.length} lines, so there is nothing at offset ${offset}.`,
          });
        }

        const numbered = all
          .slice(offset - 1)
          .map((line, index) => `${offset + index}\t${line}`);

        const page = head(numbered, {
          ...limits,
          lines: Math.min(limit, limits.lines),
        });

        return pageText({ path, offset, total: all.length, ...page });
      }).pipe(
        Effect.catchTag("PlatformError", (error) =>
          Effect.fail(failureOf(paths.resolve(given), error))
        )
      );
  })
);
