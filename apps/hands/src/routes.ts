import * as ActionMcp from "@gjermundgaraba/effect-actions/ActionMcp";

import manifest from "../package.json" with { type: "json" };
import { about } from "./about.ts";
import { read } from "./files.ts";
import { shell } from "./shell.ts";

const instructions = [
  "clankerhands gives you hands on this machine: read files, run commands, and change files.",
  "Search with shell, using rg for text and rg --files for paths.",
].join(" ");

export const routes = ActionMcp.layerHttp([about, read, shell], {
  name: "clankerhands",
  version: manifest.version,
  instructions,
});
