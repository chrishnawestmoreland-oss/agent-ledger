import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ChangedFile {
  path: string;
  status: string;
  sha256: string | null;
}

export interface GitSnapshot {
  at: string;
  branch: string | null;
  head: string | null;
  changed: ChangedFile[];
  diffStat: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/** Only these fixed git invocations are ever run — no input reaches them. */
async function git(workspace: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: workspace,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function captureSnapshot(workspace: string): Promise<GitSnapshot> {
  const status = await git(workspace, ["status", "--porcelain"]);
  const diffStat = await git(workspace, ["diff", "--stat"]);
  const branch = (await git(workspace, ["branch", "--show-current"])) || null;
  const head = (await git(workspace, ["rev-parse", "HEAD"])) || null;

  const changed: ChangedFile[] = [];
  for (const line of status.split("\n").filter(Boolean)) {
    const statusCode = line.slice(0, 2).trim();
    const path = line.slice(3).trim();
    if (!path) continue;
    let fileHash: string | null = null;
    try {
      fileHash = sha256(await readFile(join(workspace, path), "utf-8"));
    } catch {
      fileHash = null; // deleted / binary / unreadable — hash stays null
    }
    changed.push({ path, status: statusCode, sha256: fileHash });
  }

  return { at: new Date().toISOString(), branch, head, changed, diffStat };
}

/** Files that changed between two snapshots, by path. */
export function diffSnapshots(before: GitSnapshot, after: GitSnapshot): ChangedFile[] {
  const seen = new Map<string, ChangedFile>();
  for (const file of [...before.changed, ...after.changed]) {
    seen.set(file.path, file);
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}
