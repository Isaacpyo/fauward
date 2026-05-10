# /ship — Pre-ship pipeline

Run the full pre-ship pipeline for the Fauward monorepo.

Steps (stop on first failure and report clearly):

1. **Build** — `npm run build` from repo root. Compiles all workspaces via Turbo.
2. **Lint** — `npm run lint` from repo root.
3. **Test** — `npm run test` from repo root. Runs Vitest across all workspaces.

If any step fails:
- Show the exact error output
- Show the file path and line number
- Do not proceed to the next step
- Suggest the fix if obvious

If all steps pass, report: "Ready to ship. Build, lint, and tests all passed."
