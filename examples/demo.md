# Worked example

Run this in an empty test directory (not in a real repo):

```bash
# 1. Build agent-ledger once, from its own directory
npm install
npm run build

# 2. Demo in a scratch workspace
mkdir -p /tmp/agent-ledger-test && cd /tmp/agent-ledger-test
git init -q
node /path/to/agent-ledger/dist/index.js init
node /path/to/agent-ledger/dist/index.js start "Summarise the README and write SUMMARY.md"

# 3. Record the agent's steps (the second one contains a FAKE secret —
#    the scanner must flag it and redact it, never print it)
node /path/to/agent-ledger/dist/index.js record --tool read_file --input "README.md" --output "Read the project README (120 lines)"
node /path/to/agent-ledger/dist/index.js record --tool write_file --input "SUMMARY.md" --output "Wrote SUMMARY.md — note: the draft contained sk-test-FAKE123 which must be redacted"

echo "agent-ledger demo" > SUMMARY.md

# 4. Finish, report, verify
node /path/to/agent-ledger/dist/index.js finish
node /path/to/agent-ledger/dist/index.js report
node /path/to/agent-ledger/dist/index.js verify
```

Expected result:

- `.agent-ledger/ledger.jsonl` — one JSON object per line: run start,
  two steps, run finish. Input/output are stored as sha256 hashes plus
  short redacted previews; the fake secret never appears in the file.
- `REPORT.md` — steps, files changed (`SUMMARY.md`), estimated cost,
  approvals, and a secret-scan result of **FAIL** for this demo run,
  naming the pattern (`openai-api-key`) but not the secret.
- `verify` exits 0 and reports the ledger is valid, while still
  reporting the secret finding — validity means the ledger is intact
  and honest, not that the run was clean.
