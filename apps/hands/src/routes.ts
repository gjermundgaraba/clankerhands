import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";

import manifest from "../package.json" with { type: "json" };
import { about } from "./about.ts";

export const routes = ActionMcp.layerHttp(about, {
  name: "clankerhands",
  version: manifest.version,
});
