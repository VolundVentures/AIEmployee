/**
 * Trading-specific tool definitions for the Claude agent tool-use loop.
 * These get merged with the core AGENT_TOOLS when the trading bot runs.
 *
 * Design philosophy — token-efficient, deep analysis:
 *   - `generate_signal` does the heavy lifting: multi-TF analysis via Sonnet
 *     strategy engine, with fallback to hardcoded signal engine.
 *   - `get_xauusd_price` is kept for quick "what's the price?" queries.
 *   - `get_market_overview` is kept for broad market snapshots.
 *
 * IMPORTANT: The heartbeat uses `runHeartbeatAnalysis()` which fetches all
 * market data ONCE (5 API calls) instead of calling tools separately (9 calls).
 * This stays within Twelve Data's 8 req/min free tier limit.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MarketDataProvider } from "./market-data.js";
import type { CandleData, MarketSnapshot } from "./market-data.js";
import { SignalEngine } from "./signal-engine.js";
import type { TradingSignal, MarketRegime } from "./signal-engine.js";
import type { StrategyEngine, StrategyDecision } from "./strategy-engine.js";

const marketData = new MarketDataProvider();
const signalEngine = new SignalEngine();

// Strategy engine is injected from trading-bot.ts (needs API key)
let strategyEngine: StrategyEngine | null = null;

export function initStrategyEngine(engine: StrategyEngine): void {
  strategyEngine = engine;
}

export const TRADING_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_xauusd_price",
    description:
      "Get the current XAUUSD (Gold/USD) price, spread, and 24h change. Use this ONLY for simple price check requests.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "generate_signal",
    description:
      "Generate a deep, high-confidence XAUUSD trading signal. This tool performs multi-timeframe analysis (15min + 1h + 4h) using AI strategy analysis, and returns a pre-formatted WhatsApp-ready signal message. Call this ONCE — do NOT call other tools alongside it. Forward the result directly to the user without reformatting.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_market_overview",
    description:
      "Get a quick multi-timeframe overview of XAUUSD (5min/15min/1h/4h directions). Use this for general 'how is the market' or 'what is the trend' questions — NOT for signal generation.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

/**
 * Execute a trading tool and return the result string.
 * Used for on-demand WhatsApp queries (not heartbeats).
 */
export async function executeTradingTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "get_xauusd_price": {
      const quote = await marketData.getQuote();
      return formatQuote(quote);
    }

    case "generate_signal": {
      return await generateDeepSignal();
    }

    case "get_market_overview": {
      const [multiTf, quote] = await Promise.all([
        marketData.getMultiTimeframeCandles(),
        marketData.getQuote(),
      ]);
      return formatOverview(multiTf, quote);
    }

    // Keep backward compat for analyze_xauusd if called from old conversations
    case "analyze_xauusd": {
      return await generateDeepSignal();
    }

    default:
      return `Unknown trading tool: ${name}`;
  }
}

// ─── Heartbeat: single batch fetch for all data ───────────────────

export interface HeartbeatData {
  quote: MarketSnapshot;
  candles5min: CandleData;
  candles15min: CandleData;
  candles1h: CandleData;
  candles4h: CandleData;
}

/**
 * Fetch all market data for a heartbeat in one batch (5 API calls).
 * Returns the raw data for reuse across signal + overview.
 */
export async function fetchHeartbeatData(): Promise<HeartbeatData> {
  const [candles5min, candles15min, candles1h, candles4h, quote] = await Promise.all([
    marketData.getCandles("5min", 100),
    marketData.getCandles("15min", 100),
    marketData.getCandles("1h", 250),   // 250 for EMA200
    marketData.getCandles("4h", 250),   // 250 for EMA200
    marketData.getQuote(),
  ]);
  return { quote, candles5min, candles15min, candles1h, candles4h };
}

/**
 * Run full heartbeat analysis from pre-fetched data.
 * Uses Sonnet strategy engine if available, falls back to hardcoded signal engine.
 * Returns { signalResult, overviewResult, strategyCost }.
 */
export async function runHeartbeatAnalysis(data: HeartbeatData, memory?: string, signalHistory?: string): Promise<{
  signalResult: string;
  overviewResult: string;
  strategyCost: number;
  decision?: { action: "BUY" | "SELL"; confidence: number; setup: string; entry: number; stopLoss: number; takeProfit: number; reasoning: string; regime: string };
}> {
  const overviewResult = formatOverview(
    {
      "5min": data.candles5min,
      "15min": data.candles15min,
      "1h": data.candles1h,
      "4h": data.candles4h,
    },
    data.quote
  );

  // Try Sonnet strategy engine first
  if (strategyEngine) {
    try {
      const result = await runStrategyAnalysis(
        data.candles15min, data.candles1h, data.candles4h, data.quote, memory, signalHistory
      );
      return {
        signalResult: result.formatted,
        overviewResult,
        strategyCost: result.cost,
        decision: result.decision,
      };
    } catch (err) {
      console.warn("[Tools] Strategy engine failed, falling back to signal engine:",
        err instanceof Error ? err.message : err);
    }
  }

  // Fallback to hardcoded signal engine
  const signalResult = generateDeepSignalFromData(
    data.candles15min, data.candles1h, data.candles4h, data.quote
  );
  return { signalResult, overviewResult, strategyCost: 0 };
}

// ─── Strategy engine integration ────────────────────────────────

async function runStrategyAnalysis(
  candles15: CandleData,
  candles1h: CandleData,
  candles4h: CandleData,
  quote: MarketSnapshot,
  memory?: string,
  signalHistory?: string
): Promise<{ formatted: string; cost: number; decision: { action: "BUY" | "SELL"; confidence: number; setup: string; entry: number; stopLoss: number; takeProfit: number; reasoning: string; regime: string } }> {
  if (!strategyEngine) throw new Error("Strategy engine not initialized");

  // Compute indicator snapshots via signal engine (free, instant)
  const snap15 = signalEngine.computeSnapshot(candles15, quote);
  const snap1h = signalEngine.computeSnapshot(candles1h, quote);
  const snap4h = signalEngine.computeSnapshot(candles4h, quote);

  // Call Sonnet for strategy analysis with signal history for consistency
  const result = await strategyEngine.analyze(
    { tf15m: snap15.snapshot, tf1h: snap1h.snapshot, tf4h: snap4h.snapshot },
    candles15.candles,
    quote,
    memory || "",
    signalHistory
  );

  console.log(
    `[Tools] Strategy: ${result.decision.action} (${result.decision.setup}) | ` +
    `${result.tokensIn}+${result.tokensOut} tokens | $${result.cost.toFixed(4)}`
  );

  const formatted = formatStrategyDecision(result.decision, quote);
  return {
    formatted,
    cost: result.cost,
    decision: {
      action: result.decision.action,
      confidence: result.decision.confidence,
      setup: result.decision.setup,
      entry: result.decision.entry,
      stopLoss: result.decision.stopLoss,
      takeProfit: result.decision.takeProfit2,
      reasoning: result.decision.reasoning,
      regime: result.decision.regime,
    },
  };
}

// ─── Formatting helpers ───────────────────────────────────────────

function formatQuote(quote: MarketSnapshot): string {
  const sourceLabel = quote.source === "twelvedata"
    ? "Twelve Data (spot)"
    : "Yahoo GC=F (futures)";
  return [
    `XAUUSD: $${quote.price.toFixed(2)}`,
    `Bid/Ask: $${quote.bid.toFixed(2)}/$${quote.ask.toFixed(2)} (spread $${quote.spread.toFixed(2)})`,
    `24h: ${quote.change24h >= 0 ? "+" : ""}$${quote.change24h.toFixed(2)} (${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}%)`,
    `Range: $${quote.low24h.toFixed(2)} – $${quote.high24h.toFixed(2)}`,
    `_Source: ${sourceLabel}_`,
  ].join("\n");
}

function formatOverview(
  multiTf: Record<string, CandleData>,
  quote: MarketSnapshot
): string {
  const lines: string[] = [
    `📊 *XAUUSD Overview*`,
    `$${quote.price.toFixed(2)} (${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}%)`,
    ``,
  ];

  for (const [tf, data] of Object.entries(multiTf)) {
    const signal = signalEngine.analyze(data, quote);
    const emoji =
      signal.direction === "BUY" ? "🟢" :
      signal.direction === "SELL" ? "🔴" : "⚪";
    const regime = signal.indicators.regime;
    lines.push(
      `${emoji} *${tf}:* ${signal.direction} (${signal.strength}, ${signal.confidence}%) [${regime}]`
    );
  }

  lines.push(``);
  const sourceLabel = quote.source === "twelvedata" ? "Twelve Data (spot)" : "Yahoo GC=F (futures)";
  lines.push(`_Data: ${sourceLabel}_`);

  return lines.join("\n");
}

/**
 * Format a Sonnet strategy decision as a simple WhatsApp message.
 * Always shows a trade (BUY or SELL) with confidence level.
 */
function formatStrategyDecision(decision: StrategyDecision, quote: MarketSnapshot): string {
  const sourceLabel = quote.source === "twelvedata" ? "spot" : "futures";
  const emoji = decision.action === "BUY" ? "🟢" : "🔴";
  const actionWord = decision.action === "BUY" ? "Buy" : "Sell";
  const slLabel = decision.action === "BUY" ? "below" : "above";

  const confidenceWord =
    decision.confidence >= 70 ? "Strong" :
    decision.confidence >= 50 ? "Good" :
    decision.confidence >= 30 ? "Moderate" : "Weak";

  return [
    `${emoji} *${confidenceWord} ${actionWord} Signal* (${decision.confidence}%)`,
    ``,
    `${decision.reasoning}`,
    ``,
    `*${actionWord} at:* $${decision.entry.toFixed(2)}`,
    `*Stop loss:* $${decision.stopLoss.toFixed(2)} (protect yourself ${slLabel} this price)`,
    `*Target:* $${decision.takeProfit2.toFixed(2)} (potential gain: $${decision.rewardDollars.toFixed(0)})`,
    `Risk: $${decision.riskDollars.toFixed(0)} (${decision.riskPercent.toFixed(1)}% of account)`,
    ``,
    `_Not financial advice. ${sourceLabel} data._`,
  ].join("\n");
}

// ─── Deep signal generation ───────────────────────────────────────

/**
 * Generate signal by fetching data (for on-demand queries).
 * Delegates to generateSignalWithMemory (no memory context).
 */
async function generateDeepSignal(): Promise<string> {
  return generateSignalWithMemory();
}

/**
 * Generate signal with optional memory context for consistency.
 * When memory is provided, Sonnet sees recent heartbeat summaries
 * and produces signals consistent with its own recent analysis.
 */
export async function generateSignalWithMemory(memory?: string, signalHistory?: string): Promise<string> {
  const [candles15, candles1h, candles4h, quote] = await Promise.all([
    marketData.getCandles("15min", 100),
    marketData.getCandles("1h", 250),
    marketData.getCandles("4h", 250),
    marketData.getQuote(),
  ]);

  if (strategyEngine) {
    try {
      const result = await runStrategyAnalysis(candles15, candles1h, candles4h, quote, memory, signalHistory);
      return result.formatted;
    } catch (err) {
      console.warn("[Tools] Strategy engine failed on demand, using fallback:",
        err instanceof Error ? err.message : err);
    }
  }

  return generateDeepSignalFromData(candles15, candles1h, candles4h, quote);
}

/**
 * Generate signal from pre-fetched data using hardcoded signal engine (fallback).
 */
function generateDeepSignalFromData(
  candles15: CandleData,
  candles1h: CandleData,
  candles4h: CandleData,
  quote: MarketSnapshot
): string {
  const sig15 = signalEngine.analyze(candles15, quote);
  const sig1h = signalEngine.analyze(candles1h, quote);
  const sig4h = signalEngine.analyze(candles4h, quote);

  // ─── Cross-timeframe alignment ──────────────────────────
  const signals: { tf: string; signal: TradingSignal }[] = [
    { tf: "15min", signal: sig15 },
    { tf: "1h", signal: sig1h },
    { tf: "4h", signal: sig4h },
  ];

  const actionable = signals
    .filter((s) => s.signal.direction !== "HOLD")
    .sort((a, b) => b.signal.confidence - a.signal.confidence);

  if (actionable.length === 0) {
    return formatNoSignal(quote.price, sig15, sig1h, sig4h, quote.source);
  }

  const primary = actionable[0];
  const primaryDir = primary.signal.direction;

  let aligned = 0;
  let conflicting = 0;
  const alignmentDetails: string[] = [];

  for (const { tf, signal } of signals) {
    if (signal.direction === primaryDir) {
      aligned++;
      alignmentDetails.push(`${tf} ${signal.direction}`);
    } else if (signal.direction !== "HOLD") {
      conflicting++;
      alignmentDetails.push(`${tf} ${signal.direction}⚠️`);
    } else {
      alignmentDetails.push(`${tf} NEUTRAL`);
    }
  }

  let adjustedConfidence = primary.signal.confidence;
  if (aligned >= 3) adjustedConfidence = Math.min(100, adjustedConfidence + 15);
  else if (aligned >= 2) adjustedConfidence = Math.min(100, adjustedConfidence + 5);
  if (conflicting > 0) adjustedConfidence = Math.max(20, adjustedConfidence - 15);

  if (conflicting >= 2 || adjustedConfidence < 40) {
    return formatNoSignal(quote.price, sig15, sig1h, sig4h, quote.source);
  }

  let strength = primary.signal.strength;
  if (aligned >= 3 && adjustedConfidence >= 75) strength = "STRONG";
  else if (aligned >= 2 && adjustedConfidence >= 55) strength = "MODERATE";

  return formatSignal(primary, strength, adjustedConfidence, alignmentDetails, quote.source);
}

function formatNoSignal(
  price: number,
  sig15: TradingSignal,
  sig1h: TradingSignal,
  sig4h: TradingSignal,
  source: string
): string {
  const sourceLabel = source === "twelvedata" ? "spot" : "futures";

  // Even in the fallback path, always pick a direction based on timeframe majority
  const bullish = [sig15, sig1h, sig4h].filter(s => s.direction === "BUY").length;
  const bearish = [sig15, sig1h, sig4h].filter(s => s.direction === "SELL").length;

  let direction: string;
  let emoji: string;
  let actionWord: string;

  if (bullish > bearish) {
    direction = "leaning up";
    emoji = "🟢";
    actionWord = "Buy";
  } else if (bearish > bullish) {
    direction = "leaning down";
    emoji = "🔴";
    actionWord = "Sell";
  } else {
    // Tie — use 1h as tiebreaker, default to BUY
    if (sig1h.direction === "SELL") {
      direction = "slightly leaning down";
      emoji = "🔴";
      actionWord = "Sell";
    } else {
      direction = "slightly leaning up";
      emoji = "🟢";
      actionWord = "Buy";
    }
  }

  // Use the best signal for entry/SL/TP
  const best = [sig15, sig1h, sig4h]
    .filter(s => s.direction !== "HOLD")
    .sort((a, b) => b.confidence - a.confidence)[0] || sig1h;

  return [
    `${emoji} *Weak ${actionWord} Signal* (${Math.max(best.confidence, 20)}%)`,
    ``,
    `Gold is ${direction} but the signal isn't very clear.`,
    ``,
    `*${actionWord} at:* $${best.entry.toFixed(2)}`,
    `*Stop loss:* $${best.stopLoss.toFixed(2)}`,
    `*Target:* $${best.takeProfit2.toFixed(2)}`,
    ``,
    `_Low confidence — be careful. ${sourceLabel} data._`,
  ].join("\n");
}

function formatSignal(
  primary: { tf: string; signal: TradingSignal },
  strength: string,
  confidence: number,
  alignment: string[],
  source: string
): string {
  const s = primary.signal;
  const emoji = s.direction === "BUY" ? "🟢" : "🔴";
  const sourceLabel = source === "twelvedata" ? "spot" : "futures";
  const actionWord = s.direction === "BUY" ? "Buy" : "Sell";
  const slLabel = s.direction === "BUY" ? "below" : "above";

  const confidenceWord =
    strength === "STRONG" ? "Strong" :
    strength === "MODERATE" ? "Good" : "Moderate";

  // Build a simple reason from signal reasons (strip jargon)
  const simpleReasons = s.reasons
    .filter(r => !r.includes("Insufficient"))
    .slice(0, 2)
    .map(simplifyReason)
    .join(". ");

  const reasonText = simpleReasons || `Gold is showing a ${strength.toLowerCase()} ${actionWord.toLowerCase()} setup.`;

  return [
    `${emoji} *${confidenceWord} ${actionWord} Signal* (${confidence}%)`,
    ``,
    reasonText,
    ``,
    `*${actionWord} at:* $${s.entry.toFixed(2)}`,
    `*Stop loss:* $${s.stopLoss.toFixed(2)} (protect yourself ${slLabel} this price)`,
    `*Target:* $${s.takeProfit2.toFixed(2)}`,
    ``,
    `_Not financial advice. ${sourceLabel} data._`,
  ].join("\n");
}

/** Strip common trading jargon from signal engine reasons for plain-English output. */
function simplifyReason(reason: string): string {
  return reason
    .replace(/RSI\(\d+\)\s*at\s*[\d.]+/g, "momentum indicator")
    .replace(/EMA\d+/g, "moving average")
    .replace(/MACD\s*histogram[^.]*/g, "trend strength improving")
    .replace(/Stoch(astic)?\s*[KD]\s*[\d./]+/g, "momentum")
    .replace(/ADX\s*at\s*[\d.]+/g, "trend strength")
    .replace(/BB\s*bandwidth[^.]*/g, "volatility")
    .replace(/Bollinger\s*Band/gi, "price range")
    .replace(/ATR[^.]*/g, "volatility measure")
    .replace(/\bconfluence\b/gi, "agreement")
    .replace(/\bdivergence\b/gi, "mismatch")
    .replace(/\bbullish\b/gi, "upward")
    .replace(/\bbearish\b/gi, "downward");
}

export function isTradingTool(name: string): boolean {
  return TRADING_TOOLS.some((t) => t.name === name) || name === "analyze_xauusd";
}
