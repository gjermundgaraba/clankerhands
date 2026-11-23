import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";
import * as Testing from "@gjermundgaraba/effect-actions/Testing";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import manifest from "../package.json" with { type: "json" };
import { GetAbout } from "../src/about.ts";
import { Commands } from "../src/commands.ts";
import { routes } from "../src/routes.ts";

it.effect("answers its name and version over MCP", () =>
  Effect.gen(function* () {
    const mcp = yield* ActionMcp.client([GetAbout]);

    expect(yield* mcp.get_about()).toStrictEqual({
      name: "clankerhands",
      version: manifest.version,
    });
  }).pipe(
    Effect.provide(
      Testing.layer(routes).pipe(
        Layer.provide(Commands.layer),
        Layer.provide(NodeServices.layer)
      )
    )
  )
);

it.effect("refuses a request a web page sends, which carries an Origin", () =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const response = yield* client.execute(
      HttpClientRequest.post("http://localhost/mcp").pipe(
        HttpClientRequest.setHeader("origin", "https://example.com"),
        HttpClientRequest.bodyJsonUnsafe({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        })
      )
    );

    expect(response.status).toBe(403);
  }).pipe(
    Effect.provide(
      Testing.layer(routes).pipe(
        Layer.provide(Commands.layer),
        Layer.provide(NodeServices.layer)
      )
    )
  )
);
