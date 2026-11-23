/** What one answer holds at most: whichever of the two limits comes first. */
export interface Limits {
  readonly lines: number;
  readonly bytes: number;
}

export const limits: Limits = { lines: 2000, bytes: 50 * 1024 };

/**
 * The lines kept by a cut. `partial` is set when a single line was longer than the byte limit:
 * it is then the only line kept, cut inside, and `keptBytes` says how much of it.
 */
export interface Cut {
  readonly lines: readonly string[];
  readonly partial: boolean;
  readonly keptBytes: number;
}

const encoder = new TextEncoder();

const graphemes = new Intl.Segmenter();

const charsOf = (line: string): readonly string[] =>
  Array.from(graphemes.segment(line), ({ segment }) => segment);

export const bytesOf = (text: string): number => encoder.encode(text).length;

const fitting = (chars: readonly string[], budget: number): number => {
  let used = 0;
  let count = 0;

  for (const char of chars) {
    const size = bytesOf(char);

    if (used + size > budget) {
      break;
    }

    used += size;
    count += 1;
  }

  return count;
};

const cut = (
  lines: readonly string[],
  within: Limits,
  edge: (line: string, budget: number) => string
): Cut => {
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    if (kept.length >= within.lines) {
      break;
    }

    const size = bytesOf(line) + 1;

    if (used + size > within.bytes) {
      if (kept.length === 0) {
        const part = edge(line, within.bytes);

        return { lines: [part], partial: true, keptBytes: bytesOf(part) };
      }

      break;
    }

    used += size;
    kept.push(line);
  }

  return { lines: kept, partial: false, keptBytes: used };
};

/** The first lines that fit, as `read` keeps them. */
export const head = (lines: readonly string[], within: Limits = limits): Cut =>
  cut(lines, within, (line, budget) => {
    const chars = charsOf(line);

    return chars.slice(0, fitting(chars, budget)).join("");
  });

/** The last lines that fit, in their order, as `shell` keeps them. */
export const tail = (
  lines: readonly string[],
  within: Limits = limits
): Cut => {
  const kept = cut(lines.toReversed(), within, (line, budget) => {
    const chars = charsOf(line);

    return chars
      .slice(chars.length - fitting(chars.toReversed(), budget))
      .join("");
  });

  return { ...kept, lines: kept.lines.toReversed() };
};

/** A text's lines, without the empty one after a final newline, and without `\r` endings. */
export const linesOf = (text: string): readonly string[] => {
  if (text === "") {
    return [];
  }

  const lines = text.split("\n").map((line) => line.replace(/\r$/u, ""));

  return text.endsWith("\n") ? lines.slice(0, -1) : lines;
};
