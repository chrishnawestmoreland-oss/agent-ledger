# Contributing to agent-ledger

1. **Never weaken the scanner or the ledger.** A new secret pattern is
   welcome; a change that lets a secret into the ledger, or that makes an
   entry editable after the fact, is not. The ledger is append-only.
2. **Redact, don't print.** Tests and examples must use obviously fake
   secrets (e.g. `sk-test-FAKE123`). Never put a real key, token or
   password in code, tests, examples or commit messages.
3. **Small, reviewable changes.** One concern per pull request, with a
   short description and how you tested it (`npm run build`, plus a demo
   run from `examples/demo.md`).
4. **No arbitrary execution.** agent-ledger only records what a caller
   passes it and reads `git status` / `git diff` in the workspace. It
   must never execute shell from ledger input.
