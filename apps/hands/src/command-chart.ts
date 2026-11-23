import { initialTransition, setup, transition, types } from "xstate";
import type { InferEvents, SnapshotFrom } from "xstate";

export type Ending =
  | { readonly _tag: "Exited"; readonly code: number }
  | { readonly _tag: "Signalled"; readonly signal: string };

interface CommandFacts {
  readonly ending: Ending | undefined;
  readonly stopRequested: boolean;
}

const events = {
  stop: types<object>(),
  ended: types<{ readonly ending: Ending }>(),
};

export type CommandEvent = InferEvents<typeof events>;

export const command = setup({
  schemas: {
    context: types<CommandFacts>(),
    events,
  },
}).createMachine({
  id: "command",
  context: { ending: undefined, stopRequested: false },
  initial: "running",
  states: {
    running: {
      on: {
        stop: { target: "stopping", context: { stopRequested: true } },
        ended: ({ event }) => ({
          target: "ended",
          context: { ending: event.ending },
        }),
      },
    },
    stopping: {
      on: {
        ended: ({ event }) => ({
          target: "ended",
          context: { ending: event.ending },
        }),
      },
    },
    ended: {},
  },
});

export type CommandSnapshot = SnapshotFrom<typeof command>;

export const started = (): CommandSnapshot => initialTransition(command)[0];

/**
 * The command's next state. A `stop` after it has ended changes nothing: `follow` reads the
 * state and then sends `stop` in two steps, so the command can end in between.
 */
export const advance = (
  snapshot: CommandSnapshot,
  event: CommandEvent
): CommandSnapshot => transition(command, snapshot, event)[0];
