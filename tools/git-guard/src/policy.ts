import { Option, Schema } from "effect";

const operators = new Set([";", "&", "|", "\n", "(", ")"]);

const words = (command: string): string[][] => {
  const segments: string[][] = [[]];
  let word: string | undefined;
  let quote: string | undefined;

  const end = () => {
    if (word !== undefined) {
      segments.at(-1)?.push(word);
      word = undefined;
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);

    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else if (char === "\\" && quote === '"') {
        index += 1;
        word = (word ?? "") + command.charAt(index);
      } else {
        word = (word ?? "") + char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      word ??= "";
    } else if (char === "\\") {
      index += 1;
      word = (word ?? "") + command.charAt(index);
    } else if (operators.has(char)) {
      end();
      segments.push([]);
    } else if (char === " " || char === "\t") {
      end();
    } else {
      word = (word ?? "") + char;
    }
  }

  end();

  return segments.filter((segment) => segment.length > 0);
};

const valueOptions = new Set(["-C", "-c"]);

const subcommand = (segment: readonly string[]) => {
  const git = segment.findIndex(
    (word) => word === "git" || word.endsWith("/git")
  );

  if (git === -1) {
    return;
  }

  let index = git + 1;

  while (segment[index]?.startsWith("-") === true) {
    index += valueOptions.has(segment[index] ?? "") ? 2 : 1;
  }

  return { name: segment[index], rest: segment.slice(index + 1) };
};

const shortValueFlags = new Set(["m", "F", "C", "c", "t"]);
const shortAttachedFlags = new Set(["S", "u"]);

const skipsWithShortFlag = (rest: readonly string[]) => {
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] ?? "";

    if (word === "--") {
      return false;
    }

    if (word.startsWith("-") && !word.startsWith("--")) {
      for (let at = 1; at < word.length; at += 1) {
        const flag = word.charAt(at);

        if (flag === "n") {
          return true;
        }

        if (shortValueFlags.has(flag)) {
          if (at === word.length - 1) {
            index += 1;
          }

          break;
        }

        if (shortAttachedFlags.has(flag)) {
          break;
        }
      }
    }
  }

  return false;
};

const hookEnvironment = /\b(?:HUSKY|VP_GIT_HOOKS|VITE_GIT_HOOKS)=/u;
const hookSettings = /core\.hookspath|hooks-init\.sh|husky\/init\.sh/iu;

const because =
  "The pre-commit hook runs every check, and work here is checked by it: fix what it reports and commit again.";

const refused = (command: string): string | undefined => {
  if (hookEnvironment.test(command)) {
    return `Refused: setting HUSKY, VP_GIT_HOOKS or VITE_GIT_HOOKS turns the commit hook off. ${because}`;
  }

  if (hookSettings.test(command)) {
    return `Refused: core.hooksPath and the hooks init scripts decide whether the commit hook runs. ${because}`;
  }

  for (const segment of words(command)) {
    if (
      segment[0] === "vp" &&
      segment[1] === "hooks" &&
      segment[2] === "disable"
    ) {
      return `Refused: \`vp hooks disable\` removes the commit hook. ${because}`;
    }

    const git = subcommand(segment);

    if (git === undefined) {
      continue;
    }

    if (git.rest.some((word) => word.startsWith("--no-veri"))) {
      return `Refused: --no-verify skips the commit hook. ${because}`;
    }

    if (git.name === "commit" && skipsWithShortFlag(git.rest)) {
      return `Refused: \`git commit -n\` skips the commit hook. ${because}`;
    }
  }

  return undefined;
};

export const refusal = (command: string) =>
  Option.fromUndefinedOr(refused(command));

const ShellCall = Schema.Struct({
  command: Schema.optional(Schema.String),
  cmd: Schema.optional(Schema.String),
});

export const refusalOf = (input: unknown) =>
  Schema.decodeUnknownOption(ShellCall)(input).pipe(
    Option.flatMap(({ command, cmd }) =>
      Option.fromUndefinedOr(command ?? cmd)
    ),
    Option.flatMap(refusal)
  );
