#!/usr/bin/env node
/**
 * agent-ledger CLI.
 * Usage: agent-ledger <init|start|record|finish|report|verify> [args]
 * It only records what the caller passes and reads git status/diff.
 * It never executes shell from ledger input.
 */
import { captureSnapshot } from "./git.js";
import {
  appendEntry,
  buildStepEntry,
  initLedger,
  ledgerPath,
  newRunId,
  readLedger,
  readRunState,
  runStatePath,
  writeRunState,
  type RunState,
} from "./ledger.js";
import { buildSummary, writeReport } from "./report.js";
import { priceFromEnv } from "./cost.js";
import { scanForSecrets } from "./scanner.js";

const HELP = `agent-ledger — a verifiable audit trail for AI agent work

Usage:
  agent-ledger init
  agent-ledger start "<goal>"
  agent-ledger record --tool <name> --input <text> --output <text> [--files a,b] [--approved]
  agent-ledger finish
  agent-ledger report
  agent-ledger verify

Options:
  --workspace <dir>   Workspace to record in (default: current directory)

Environment:
  AGENT_LEDGER_PRICE_IN   $ per 1M input tokens (default 3)
  AGENT_LEDGER_PRICE_OUT  $ per 1M output tokens (default 15)
`;

function workspaceFrom(args: string[]): string {
  const i = args.indexOf("--workspace");
  return i >= 0 && args[i + 1] ? args[i + 1] : process.cwd();
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`agent-ledger: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const workspace = workspaceFrom(args);

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(command ? 0 : 1);
  }

  if (command === "init") {
    await initLedger(workspace);
    console.log(`Initialised agent-ledger in ${workspace}`);
    console.log(`Ledger: ${ledgerPath(workspace)}`);
    return;
  }

  if (command === "start") {
    const goal = args.filter((a) => !a.startsWith("-") && a !== "start").join(" ").trim();
    if (!goal) fail("start needs a goal, e.g. agent-ledger start \"Write SUMMARY.md\"");
    const baseline = await captureSnapshot(workspace);
    const state: RunState = {
      runId: newRunId(),
      goal,
      startedAt: new Date().toISOString(),
      steps: 0,
      baseline,
    };
    await writeRunState(workspace, state);
    await appendEntry(workspace, {
      ts: state.startedAt,
      runId: state.runId,
      kind: "run_start",
      goal,
    });
    console.log(`Started ${state.runId}`);
    console.log(`Goal: ${goal}`);
    console.log(`Run state: ${runStatePath(workspace)}`);
    return;
  }

  if (command === "record") {
    const state = await readRunState(workspace);
    if (!state) fail("no active run — run `agent-ledger start \"<goal>\"` first");
    const tool = flagValue(args, "--tool");
    const input = flagValue(args, "--input") ?? "";
    const output = flagValue(args, "--output") ?? "";
    if (!tool) fail("record needs --tool <name>");
    const files = (flagValue(args, "--files") ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    const approved = args.includes("--approved");
    const step = state.steps + 1;
    const entry = buildStepEntry(state.runId, step, tool, input, output, files, approved);
    await appendEntry(workspace, entry);
    await writeRunState(workspace, { ...state, steps: step });
    const findings = entry.secretFindings ?? [];
    if (findings.length > 0) {
      for (const f of findings) {
        console.error(`⚠ SECRET FOUND — pattern: ${f.pattern}, line ${f.line} (redacted in ledger)`);
      }
    }
    console.log(`Recorded step ${step} (${tool}) — ${findings.length} secret finding(s)`);
    return;
  }

  if (command === "finish") {
    const state = await readRunState(workspace);
    if (!state) fail("no active run to finish");
    const after = await captureSnapshot(workspace);
    const finishedAt = new Date().toISOString();
    await appendEntry(workspace, {
      ts: finishedAt,
      runId: state.runId,
      kind: "run_finish",
      goal: state.goal,
      durationMs: Date.parse(finishedAt) - Date.parse(state.startedAt),
      filesChanged: after.changed.map((f) => f.path),
    });
    await writeRunState(workspace, { ...state, finishedAt });
    console.log(`Finished ${state.runId} — ${state.steps} step(s)`);
    return;
  }

  if (command === "report") {
    const state = await readRunState(workspace);
    if (!state) fail("no run to report on — run `agent-ledger start` first");
    const entries = await readLedger(workspace);
    const after = await captureSnapshot(workspace);
    const summary = buildSummary(state, entries, after, priceFromEnv());
    const { reportPath, summaryPath } = await writeReport(workspace, summary, entries);
    console.log(`Report: ${reportPath}`);
    console.log(`Summary: ${summaryPath}`);
    console.log(`Secret scan: ${summary.secretScan.toUpperCase()} (${summary.secretFindings.length} finding(s))`);
    console.log(`Estimated cost: $${summary.estimatedCostUsd.toFixed(4)}`);
    return;
  }

  if (command === "verify") {
    const entries = await readLedger(workspace);
    const state = await readRunState(workspace);
    let problems: string[] = [];
    if (entries.length === 0) problems.push("ledger is empty");
    for (const [i, entry] of entries.entries()) {
      if (!entry.ts || !entry.runId || !entry.kind) {
        problems.push(`line ${i + 1}: entry is missing ts/runId/kind`);
      }
      // Previews must never contain an unredacted secret.
      const combined = `${entry.inputPreview ?? ""} ${entry.outputPreview ?? ""}`;
      const leaked = scanForSecrets(combined);
      if (leaked.length > 0) {
        problems.push(`line ${i + 1}: preview contains an unredacted secret (${leaked[0]?.pattern})`);
      }
    }
    if (state && !entries.some((e) => e.kind === "run_start" && e.runId === state.runId)) {
      problems.push(`no run_start entry for ${state.runId}`);
    }
    const secretFindings = entries.flatMap((e) => e.secretFindings ?? []).length;
    if (problems.length > 0) {
      console.error("✗ Ledger INVALID:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`✓ Ledger valid — ${entries.length} entries, run ${state?.runId ?? "(none)"}`);
    console.log(`  Secret findings recorded (redacted): ${secretFindings}`);
    console.log("  Note: valid means the ledger is intact and honest, not that the run was clean.");
    return;
  }

  fail(`unknown command: ${command}\n${HELP}`);
}

main().catch((error: unknown) => {
  console.error("agent-ledger failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
