# clankerhands

The hands to the brains of an agent: a service that runs on a machine and gives an agent its tools over MCP. [VISION.md](VISION.md) says what it is for.

```sh
vp install         # installs dependencies and the pre-commit hook
vp run check       # typecheck, lint, format and tests, through Turborepo
cd apps/hands && vp run start   # serves MCP at http://127.0.0.1:4870/mcp
```
