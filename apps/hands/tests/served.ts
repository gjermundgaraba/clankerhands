import { NodeServices } from "@effect/platform-node";
import * as Testing from "@gjermundgaraba/effect-actions/Testing";
import { Layer } from "effect";

import { Commands } from "../src/commands.ts";
import { routes } from "../src/routes.ts";

export const served = Layer.mergeAll(
  Testing.layer(routes).pipe(
    Layer.provide(Commands.layer),
    Layer.provide(NodeServices.layer)
  ),
  NodeServices.layer
);
