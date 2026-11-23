import {
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Schema,
  Scope,
} from "effect";
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
  readonly ended: Deferred.Deferred<Ending>;
  readonly cursor: Ref.Ref<number>;
  readonly kill: Effect.Effect<void>;
}

const wrapper = 'exec >"$0" 2>&1 </dev/null; exec bash -c "$1"';

export class Commands extends Context.Service<
  Commands,
  {
    readonly start: (
      command: string,
      cwd: string
    ) => Effect.Effect<number, CommandUnavailable>;
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

      const start = Effect.fn("Commands.start")(function* (
        command: string,
        cwd: string
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
        const ended = yield* Deferred.make<Ending>();

        yield* handle.exitCode.pipe(
          Effect.map((code): Ending => ({ _tag: "Exited", code })),
          Effect.catchTag("PlatformError", (error) =>
            Effect.succeed<Ending>({
              _tag: "Signalled",
              reason: error.reason.message,
            })
          ),
          Effect.tap((ending) =>
            Ref.update(chart, (snapshot) =>
              advance(snapshot, { type: "ended", ending })
            )
          ),
          Effect.tap((ending) => Deferred.succeed(ended, ending)),
          Effect.ensuring(Scope.close(jobScope, Exit.void)),
          Effect.forkIn(scope)
        );

        jobs.set(id, {
          log,
          chart,
          ended,
          cursor: yield* Ref.make(0),
          kill: handle
            .kill({ forceKillAfter: "5 seconds" })
            .pipe(Effect.ignore),
        });

        return id;
      });

      const unread = (job: Job) =>
        Effect.gen(function* () {
          const bytes = yield* fs
            .readFile(job.log)
            .pipe(Effect.orElseSucceed(() => new Uint8Array()));

          const from = yield* Ref.getAndSet(job.cursor, bytes.length);

          return new TextDecoder().decode(bytes.subarray(from));
        });

      const follow = Effect.fn("Commands.follow")(function* (
        id: number,
        waitMs: number,
        stop: boolean
      ) {
        const job = jobs.get(id);

        if (job === undefined) {
          return Option.none();
        }

        const before = yield* Ref.get(job.chart);

        if (stop && before.matches("running")) {
          yield* Ref.update(job.chart, (snapshot) =>
            advance(snapshot, { type: "stop" })
          );
          yield* Effect.forkIn(job.kill, scope);
        }

        yield* Deferred.await(job.ended).pipe(Effect.timeoutOption(waitMs));

        return Option.some({
          id,
          log: job.log,
          output: yield* unread(job),
          snapshot: yield* Ref.get(job.chart),
        });
      });

      return Commands.of({ start, follow });
    })
  );
}
