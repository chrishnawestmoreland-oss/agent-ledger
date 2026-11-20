/** Secret scanning. Patterns are matched, never printed: findings name
 *  the pattern and the location, and redaction replaces the secret
 *  itself with a label. */

export interface SecretFinding {
  pattern: string;
  /** 1-based line number in the scanned text, when known. */
  line: number;
  /** Redacted context around the match — the secret itself is removed. */
  context: string;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const PATTERNS: SecretPattern[] = [
  { name: "openai-api-key", regex: /sk-[A-Za-z0-9-_]{10,}/g },
  { name: "github-pat", regex: /ghp_[A-Za-z0-9]{20,}/g },
  { name: "github-fine-grained-pat", regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "aws-access-key-id", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "aws-secret", regex: /(aws_secret_access_key|secret_key)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{20,}/gi },
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "bearer-token", regex: /Bearer\s+[A-Za-z0-9._-]{10,}/g },
  { name: "slack-token", regex: /xox[baprs]-[A-Za-z0-9-]+/g },
  { name: "env-assignment", regex: /(?:PASSWORD|SECRET|TOKEN|API_KEY)\s*=\s*\S+/gi },
];

export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { name, regex } of PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    for (const match of text.matchAll(re)) {
      const before = text.slice(0, match.index ?? 0);
      const line = before.split("\n").length;
      findings.push({
        pattern: name,
        line,
        context: `[REDACTED:${name}] at line ${line}`,
      });
    }
  }
  return findings;
}

/** Replace every matched secret with a label. The secret never survives. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const { name, regex } of PATTERNS) {
    out = out.replace(new RegExp(regex.source, regex.flags), `[REDACTED:${name}]`);
  }
  return out;
}

/** A short preview for the ledger: redacted, truncated, single-line. */
export function preview(text: string, maxLength = 200): string {
  return redactSecrets(text).replace(/\s+/g, " ").trim().slice(0, maxLength);
}
