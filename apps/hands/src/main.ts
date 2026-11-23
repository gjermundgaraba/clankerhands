import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";

import { routes } from "./routes.ts";

const server = Layer.unwrap(
  Effect.gen(function* () {
    const host = yield* Config.String("HOST").pipe(
      Config.withDefault("127.0.0.1")
    );

    const port = yield* Config.Port("PORT").pipe(Config.withDefault(4870));

    return HttpRouter.serve(routes).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { host, port }))
    );
  })
);

Layer.launch(server).pipe(NodeRuntime.runMain());
