# agent-ledger — a verifiable audit trail for AI agent work

AI agents are everywhere in November 2026: memory layers so they stop
forgetting between sessions, headless browsers built for agents, and
security-audit skills for the code they generate. But nobody can answer
the simple questions afterwards:

- What did the agent actually do?
- What did it change?
- What did it cost?
- Did it leak a secret?

That's the loophole agent-ledger closes. It turns an agent run into a
verifiable, append-only audit ledger — hashes instead of raw text,
redacted secrets, a git diff before and after, and an estimated cost —
so a human (or another agent) can check the work without re-running it
or trusting a chat transcript.

> **What it is not:** a runner. agent-ledger never executes agent
> actions or shell from ledger input. It only records what the caller
> passes it and reads `git status` / `git diff` in the workspace.

## Quickstart

```bash
git clone https://github.com/chrishnawestmoreland-oss/agent-ledger.git
cd agent-ledger
npm install
npm run build

# Demo in a scratch workspace
mkdir -p /tmp/agent-ledger-test && cd /tmp/agent-ledger-test
git init -q
node /path/to/agent-ledger/dist/index.js init
node /path/to/agent-ledger/dist/index.js start "Summarise the README and write SUMMARY.md"
node /path/to/agent-ledger/dist/index.js record --tool read_file --input "README.md" --output "Read the project README (120 lines)"
node /path/to/agent-ledger/dist/index.js record --tool write_file --input "SUMMARY.md" --output "Wrote SUMMARY.md" --files SUMMARY.md --approved
echo "agent-ledger demo" > SUMMARY.md
node /path/to/agent-ledger/dist/index.js finish
node /path/to/agent-ledger/dist/index.js report
node /path/to/agent-ledger/dist/index.js verify
```

See `examples/demo.md` for the full worked example, including a fake
secret the scanner must flag and redact.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Create `.agent-ledger/` and an empty `ledger.jsonl` in the workspace |
| `start "<goal>"` | Begin a run: capture the git baseline, write the run state |
| `record --tool <name> --input <text> --output <text> [--files a,b] [--approved]` | Record one step, hashed and secret-scanned |
| `finish` | Capture the git after-state and close the run |
| `report` | Write `REPORT.md` and `.agent-ledger/summary.json` |
| `verify` | Check the ledger parses, is complete, and holds no unredacted secrets |

## Ledger format

Append-only JSONL in `.agent-ledger/ledger.jsonl`, one object per line:

```json
{"ts":"2026-11-20T06:30:00.000Z","runId":"run-20261120063000-abc123","kind":"step","step":1,"tool":"write_file","inputHash":"<sha256>","outputHash":"<sha256>","inputPreview":"SUMMARY.md","outputPreview":"Wrote SUMMARY.md","inputTokens":3,"outputTokens":4,"filesChanged":["SUMMARY.md"],"approved":true,"secretFindings":[]}
```

Inputs and outputs are stored as sha256 hashes plus short redacted
previews — never the raw text, and never a secret. A finding names the
pattern and line, never the secret itself.

## Secret scanner

Scans every recorded input/output for: OpenAI-style keys (`sk-…`),
GitHub tokens (`ghp_…`, `github_pat_…`), AWS access keys (`AKIA…`)
and AWS secrets, private keys, Bearer tokens, Slack tokens, and
`.env`-style assignments (`PASSWORD=…`, `API_KEY=…`). Matches are
redacted in the ledger, warned about on stderr, and listed in the
report as `FAIL` with the pattern name only.

## Cost estimator

Tokens are estimated at ~1 token per 4 characters, and cost at a
configurable rate — default $3 / 1M input tokens and $15 / 1M output
tokens. Override with:

```bash
AGENT_LEDGER_PRICE_IN=5 AGENT_LEDGER_PRICE_OUT=20 agent-ledger report
```

Costs are always labelled as estimates in the report.

## Project layout

```
src/
  index.ts    CLI entrypoint
  ledger.ts   append-only JSONL ledger, run state, hashing
  scanner.ts  secret patterns, scanning, redaction
  cost.ts     token / cost estimation
  git.ts      git status / diff snapshots (fixed commands only)
  report.ts   Markdown report + JSON summary
examples/
  demo.md     worked example, including a fake-secret test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Never put a real key in code,
tests or examples, and never weaken the scanner or make the ledger
editable after the fact.

## License

MIT — see [LICENSE](LICENSE).
