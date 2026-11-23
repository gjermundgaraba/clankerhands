import { createServer } from "node:http";

import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/http";

import { Commands } from "./commands.ts";
import { routes } from "./routes.ts";

const server = Layer.unwrap(
  Effect.gen(function* () {
    const host = yield* Config.schema(
      Schema.Literals(["127.0.0.1", "::1", "localhost"]).annotate({
        message:
          "clankerhands listens on loopback only: HOST must be 127.0.0.1, ::1 or localhost.",
      }),
      "HOST"
    ).pipe(Config.withDefault("127.0.0.1"));

    const port = yield* Config.Port("PORT").pipe(Config.withDefault(4870));

    return HttpRouter.serve(routes).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { host, port })),
      Layer.provide(Commands.layer),
      Layer.provide(NodeServices.layer)
    );
  })
);

Layer.launch(server).pipe(NodeRuntime.runMain());
