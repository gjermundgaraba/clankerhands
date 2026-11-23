import * as Action from "@gjermundgaraba/effect-actions/Action";
import { Effect, Schema } from "effect";

import manifest from "../package.json" with { type: "json" };

export const About = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
});

export const GetAbout = Action.make("get_about", {
  description: "Name the clankerhands service and the version that runs.",
  success: About,
  readOnly: true,
  caller: Action.Anyone,
});

export const about = Action.implement(GetAbout, () =>
  Effect.succeed({ name: "clankerhands", version: manifest.version })
);
