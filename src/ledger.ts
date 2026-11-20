import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estimateTokens } from "./cost.js";
import type { GitSnapshot } from "./git.js";
import { preview, scanForSecrets, type SecretFinding } from "./scanner.js";

export type EntryKind = "run_start" | "step" | "approval" | "run_finish";

export interface LedgerEntry {
  ts: string;
  runId: string;
  kind: EntryKind;
  goal?: string;
  step?: number;
  tool?: string;
  inputHash?: string;
  outputHash?: string;
  inputPreview?: string;
  outputPreview?: string;
  inputTokens?: number;
  outputTokens?: number;
  filesChanged?: string[];
  durationMs?: number;
  approved?: boolean;
  secretFindings?: SecretFinding[];
}

export interface RunState {
  runId: string;
  goal: string;
  startedAt: string;
  finishedAt?: string;
  steps: number;
  baseline: GitSnapshot;
}

export function ledgerDir(workspace: string): string {
  return join(workspace, ".agent-ledger");
}

export function ledgerPath(workspace: string): string {
  return join(ledgerDir(workspace), "ledger.jsonl");
}

export function runStatePath(workspace: string): string {
  return join(ledgerDir(workspace), "run.json");
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

export async function initLedger(workspace: string): Promise<void> {
  await mkdir(ledgerDir(workspace), { recursive: true });
  try {
    await readFile(ledgerPath(workspace), "utf-8");
  } catch {
    await writeFile(ledgerPath(workspace), "", "utf-8");
  }
}

export async function appendEntry(
  workspace: string,
  entry: LedgerEntry,
): Promise<void> {
  await initLedger(workspace);
  await appendFile(ledgerPath(workspace), JSON.stringify(entry) + "\n", "utf-8");
}

export async function readLedger(workspace: string): Promise<LedgerEntry[]> {
  try {
    const raw = await readFile(ledgerPath(workspace), "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LedgerEntry);
  } catch {
    return [];
  }
}

export async function readRunState(workspace: string): Promise<RunState | null> {
  try {
    return JSON.parse(await readFile(runStatePath(workspace), "utf-8")) as RunState;
  } catch {
    return null;
  }
}

export async function writeRunState(workspace: string, state: RunState): Promise<void> {
  await initLedger(workspace);
  await writeFile(runStatePath(workspace), JSON.stringify(state, null, 2), "utf-8");
}

export function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  return `run-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a step entry: hashes + token counts from the raw text, but only
 *  redacted previews are stored — secrets never reach the ledger. */
export function buildStepEntry(
  runId: string,
  step: number,
  tool: string,
  input: string,
  output: string,
  filesChanged: string[],
  approved: boolean,
): LedgerEntry {
  const findings = [...scanForSecrets(input), ...scanForSecrets(output)];
  return {
    ts: new Date().toISOString(),
    runId,
    kind: "step",
    step,
    tool,
    inputHash: hashText(input),
    outputHash: hashText(output),
    inputPreview: preview(input),
    outputPreview: preview(output),
    inputTokens: estimateTokens(input),
    outputTokens: estimateTokens(output),
    filesChanged,
    approved,
    secretFindings: findings,
  };
}
