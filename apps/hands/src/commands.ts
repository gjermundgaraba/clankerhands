import {
  Context,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Ref,
  Schema,
  Scope,
} from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { advance, started } from "./command-chart.ts";
import type { CommandSnapshot, Ending } from "./command-chart.ts";

export class CommandUnavailable extends Schema.TaggedError<
  CommandUnavailable,
  { readonly brand: unique symbol }
>()("CommandUnavailable", { message: Schema.String }) {}

export interface Progress {
  readonly id: number;
  readonly log: string;
  readonly output: string;
  readonly snapshot: CommandSnapshot;
}

interface Job {
  readonly log: string;
  readonly chart: Ref.Ref<CommandSnapshot>;
  readonly exited: Fiber.Fiber<Ending>;
  readonly cursor: Ref.Ref<number>;
  readonly kill: Effect.Effect<void>;
}

const signalOf = (error: PlatformError): string => {
  const { cause } = error.reason;

  const named = Predicate.isError(cause)
    ? /signal: '(?<name>\w+)'/u.exec(cause.message)?.groups?.["name"]
    : undefined;

  return named ?? "a signal";
};

const wrapper = 'exec >"$0" 2>&1 </dev/null; exec bash -c "$1"';

export class Commands extends Context.Service<
  Commands,
  {
    readonly start: (
      command: string,
      cwd: string,
      waitMs: number
    ) => Effect.Effect<Progress, CommandUnavailable>;
    readonly follow: (
      id: number,
      waitMs: number,
      stop: boolean
    ) => Effect.Effect<Option.Option<Progress>>;
  }
>()("clankerhands/Commands") {
  static readonly layer = Layer.effect(
    Commands,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const scope = yield* Effect.scope;

      const logs = yield* fs.makeTempDirectoryScoped({
        prefix: "clankerhands-",
      });

      const jobs = new Map<number, Job>();
      let count = 0;

      const unread = (job: Job) =>
        Effect.gen(function* () {
          const bytes = yield* fs
            .readFile(job.log)
            .pipe(Effect.orElseSucceed(() => new Uint8Array()));

          const from = yield* Ref.getAndSet(job.cursor, bytes.length);

          return new TextDecoder().decode(bytes.subarray(from));
        });

      const progressOf = Effect.fnUntraced(function* (
        id: number,
        job: Job,
        waitMs: number,
        stop: boolean
      ) {
        const before = yield* Ref.get(job.chart);

        if (stop && before.matches("running")) {
          yield* Ref.update(job.chart, (snapshot) =>
            advance(snapshot, { type: "stop" })
          );
          yield* Effect.forkIn(job.kill, scope);
        }

        yield* Fiber.await(job.exited).pipe(Effect.timeoutOption(waitMs));

        return {
          id,
          log: job.log,
          output: yield* unread(job),
          snapshot: yield* Ref.get(job.chart),
        } satisfies Progress;
      });

      const start = Effect.fn("Commands.start")(function* (
        command: string,
        cwd: string,
        waitMs: number
      ) {
        count += 1;

        const id = count;
        const log = paths.join(logs, `${id}.log`);
        const jobScope = yield* Scope.fork(scope);

        const handle = yield* spawner
          .spawn(
            ChildProcess.make("bash", ["-c", wrapper, log, command], {
              cwd,
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
            })
          )
          .pipe(
            Scope.provide(jobScope),
            Effect.mapError(
              (error) =>
                new CommandUnavailable({
                  message: `The command could not be started: ${error.reason.message}`,
                })
            )
          );

        const chart = yield* Ref.make(started());

        const exited = yield* handle.exitCode.pipe(
          Effect.map((code): Ending => ({ _tag: "Exited", code })),
          Effect.catchTag("PlatformError", (error) =>
            Effect.succeed<Ending>({
              _tag: "Signalled",
              signal: signalOf(error),
            })
          ),
          Effect.tap((ending) =>
            Ref.update(chart, (snapshot) =>
              advance(snapshot, { type: "ended", ending })
            )
          ),
          Effect.ensuring(Scope.close(jobScope, Exit.void)),
          Effect.forkIn(scope)
        );

        const job: Job = {
          log,
          chart,
          exited,
          cursor: yield* Ref.make(0),
          kill: handle
            .kill({ forceKillAfter: "5 seconds" })
            .pipe(Effect.ignore),
        };

        jobs.set(id, job);

        return yield* progressOf(id, job, waitMs, false);
      });

      const follow = Effect.fn("Commands.follow")(function* (
        id: number,
        waitMs: number,
        stop: boolean
      ) {
        const job = jobs.get(id);

        return job === undefined
          ? Option.none()
          : Option.some(yield* progressOf(id, job, waitMs, stop));
      });

      return Commands.of({ start, follow });
    })
  );
}
