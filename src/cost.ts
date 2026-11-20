/** Token / cost estimation. Rough on purpose (~1 token per 4 chars),
 *  and always labelled as an estimate in the report. */

export interface PriceConfig {
  priceInPerMillion: number;
  priceOutPerMillion: number;
}

export function priceFromEnv(): PriceConfig {
  const priceIn = Number.parseFloat(process.env.AGENT_LEDGER_PRICE_IN ?? "3");
  const priceOut = Number.parseFloat(process.env.AGENT_LEDGER_PRICE_OUT ?? "15");
  return {
    priceInPerMillion: Number.isFinite(priceIn) && priceIn >= 0 ? priceIn : 3,
    priceOutPerMillion: Number.isFinite(priceOut) && priceOut >= 0 ? priceOut : 15,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  price: PriceConfig,
): number {
  return (
    (inputTokens / 1_000_000) * price.priceInPerMillion +
    (outputTokens / 1_000_000) * price.priceOutPerMillion
  );
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
