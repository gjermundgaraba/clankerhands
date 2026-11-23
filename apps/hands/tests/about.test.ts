import { expect, it } from "@effect/vitest";
import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";
import * as Testing from "@gjermundgaraba/effect-actions/Testing";
import { Effect } from "effect";

import manifest from "../package.json" with { type: "json" };
import { GetAbout } from "../src/about.ts";
import { routes } from "../src/routes.ts";

it.effect("answers its name and version over MCP", () =>
  Effect.gen(function* () {
    const mcp = yield* ActionMcp.client([GetAbout]);

    expect(yield* mcp.get_about()).toStrictEqual({
      name: "clankerhands",
      version: manifest.version,
    });
  }).pipe(Effect.provide(Testing.layer(routes)))
);
