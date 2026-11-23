import { config } from "@clanker-stuff/oxlint-config";

export default config({
  testBlocks: [
    "it",
    "it.each",
    "it.effect",
    "it.live",
    "it.prop",
    "it.effect.prop",
  ],
  overrides: [
    {
      files: ["apps/*/src/*-chart.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["*", "!xstate", "!./*-chart.ts"],
                message:
                  "A chart is pure: it imports xstate and other charts, and what it needs from the world rides on its event.",
              },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          {
            name: "Date",
            message: "A chart reads no clock; the time rides on its event.",
          },
          {
            name: "crypto",
            message: "A chart mints no IDs; they ride on its event.",
          },
        ],
        "no-restricted-properties": [
          "error",
          {
            object: "Math",
            property: "random",
            message: "A chart is deterministic.",
          },
        ],
      },
    },
  ],
});
