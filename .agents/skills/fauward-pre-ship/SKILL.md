---
name: fauward-pre-ship
description: Run Fauward's full pre-ship validation pipeline: build, lint, and tests. Use when the user asks to ship, validate, release-check, or run the pre-ship pipeline.
---

Run the full Fauward pre-ship pipeline from the repository root.

1. Run `npm run build`.
2. If build passes, run `npm run lint`.
3. If lint passes, run `npm run test`.
4. Stop on the first failure.
5. Report the failing command, important error output, and any file path or line number present.
6. Suggest the fix only when it is clear from the output.

If every step passes, report exactly: `Ready to ship. Build, lint, and tests all passed.`

