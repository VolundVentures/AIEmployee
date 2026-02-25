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
export async function runHeartbeatAnalysis(data: HeartbeatData, memory?: string): Promise<{
  signalResult: string;
  overviewResult: string;
  strategyCost: number;
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
        data.candles15min, data.candles1h, data.candles4h, data.quote, memory
      );
      return {
        signalResult: result.formatted,
        overviewResult,
        strategyCost: result.cost,
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
  memory?: string
): Promise<{ formatted: string; cost: number }> {
  if (!strategyEngine) throw new Error("Strategy engine not initialized");

  // Compute indicator snapshots via signal engine (free, instant)
  const snap15 = signalEngine.computeSnapshot(candles15, quote);
  const snap1h = signalEngine.computeSnapshot(candles1h, quote);
  const snap4h = signalEngine.computeSnapshot(candles4h, quote);

  // Call Sonnet for strategy analysis
  const result = await strategyEngine.analyze(
    { tf15m: snap15.snapshot, tf1h: snap1h.snapshot, tf4h: snap4h.snapshot },
    candles15.candles,
    quote,
    memory || ""
  );

  console.log(
    `[Tools] Strategy: ${result.decision.action} (${result.decision.setup}) | ` +
    `${result.tokensIn}+${result.tokensOut} tokens | $${result.cost.toFixed(4)}`
  );

  const formatted = formatStrategyDecision(result.decision, quote);
  return { formatted, cost: result.cost };
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
 * Format a Sonnet strategy decision as a WhatsApp message.
 */
function formatStrategyDecision(decision: StrategyDecision, quote: MarketSnapshot): string {
  const sourceLabel = quote.source === "twelvedata" ? "spot" : "futures";

  if (decision.action === "NO_TRADE") {
    return [
      `⚪ *XAUUSD — NO TRADE* (${decision.regime})`,
      ``,
      `📊 ${decision.reasoning}`,
      ``,
      `_${sourceLabel} data | AI strategy analysis_`,
    ].join("\n");
  }

  const emoji = decision.action === "BUY" ? "🟢" : "🔴";
  const setupLabel = decision.setup.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const stars =
    decision.confidence >= 75 ? "⭐⭐⭐" :
    decision.confidence >= 55 ? "⭐⭐" : "⭐";

  return [
    `${emoji} *XAUUSD ${decision.action}* — ${setupLabel} ${stars} (${decision.regime})`,
    `Confidence: ${decision.confidence}% | R:R ${decision.riskReward.toFixed(2)}`,
    ``,
    `📍 Entry: $${decision.entry.toFixed(2)}`,
    `🛑 SL: $${decision.stopLoss.toFixed(2)} (Risk: $${decision.riskDollars.toFixed(0)} / ${decision.riskPercent.toFixed(1)}%)`,
    `🎯 TP1: $${decision.takeProfit1.toFixed(2)} | TP2: $${decision.takeProfit2.toFixed(2)} | TP3: $${decision.takeProfit3.toFixed(2)}`,
    `💰 Target: $${decision.rewardDollars.toFixed(0)} (TP2)`,
    ``,
    `📊 ${decision.reasoning}`,
    ``,
    `⚠️ _Max 1-2% risk. Not financial advice. ${sourceLabel} data._`,
  ].join("\n");
}

// ─── Deep signal generation ───────────────────────────────────────

/**
 * Generate signal by fetching data (for on-demand queries).
 * Uses strategy engine if available, otherwise falls back to hardcoded.
 */
async function generateDeepSignal(): Promise<string> {
  const [candles15, candles1h, candles4h, quote] = await Promise.all([
    marketData.getCandles("15min", 100),
    marketData.getCandles("1h", 250),   // 250 for EMA200
    marketData.getCandles("4h", 250),   // 250 for EMA200
    marketData.getQuote(),
  ]);

  // Try strategy engine first
  if (strategyEngine) {
    try {
      const result = await runStrategyAnalysis(candles15, candles1h, candles4h, quote);
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
  const dir = (s: TradingSignal) =>
    s.direction === "BUY" ? "🟢" : s.direction === "SELL" ? "🔴" : "⚪";

  const sourceLabel = source === "twelvedata" ? "spot" : "futures";
  const ind = sig1h.indicators; // use 1h for key levels
  const regime = sig1h.indicators.regime;
  const adxStr = isFinite(ind.adx) ? ind.adx.toFixed(1) : "N/A";

  return [
    `⚪ *XAUUSD — WAIT* (${regime}, no confluence)`,
    ``,
    `${dir(sig15)} 15min: ${sig15.direction} (${sig15.strength}, ${sig15.confidence}%) [${sig15.indicators.regime}]`,
    `${dir(sig1h)} 1h: ${sig1h.direction} (${sig1h.strength}, ${sig1h.confidence}%) [${regime}]`,
    `${dir(sig4h)} 4h: ${sig4h.direction} (${sig4h.strength}, ${sig4h.confidence}%) [${sig4h.indicators.regime}]`,
    ``,
    `ADX: ${adxStr} | RSI: ${ind.rsi14.toFixed(1)} | Stoch: ${ind.stochK.toFixed(0)}/${ind.stochD.toFixed(0)}`,
    `MACD: ${ind.macdHistogram > 0 ? "+" : ""}${ind.macdHistogram.toFixed(2)} | ATR: ${ind.atr14.toFixed(2)}`,
    `BB: ${ind.bbLower.toFixed(0)} / ${ind.bbMiddle.toFixed(0)} / ${ind.bbUpper.toFixed(0)} (BW: ${isFinite(ind.bbBandwidth) ? ind.bbBandwidth.toFixed(1) + "%" : "N/A"})`,
    `S1: $${ind.pivots.s1.toFixed(2)} | R1: $${ind.pivots.r1.toFixed(2)}`,
    ind.divergence ? `⚡ RSI ${ind.divergence.type} divergence (${ind.divergence.strength.toFixed(2)})` : "",
    ``,
    `_${sourceLabel} data_`,
  ].filter(Boolean).join("\n");
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
  const stars =
    strength === "STRONG" ? "⭐⭐⭐" :
    strength === "MODERATE" ? "⭐⭐" : "⭐";

  const sourceLabel = source === "twelvedata" ? "spot" : "futures";
  const ind = s.indicators;
  const regime = ind.regime;
  const adxStr = isFinite(ind.adx) ? ind.adx.toFixed(1) : "N/A";

  const lines = [
    `${emoji} *XAUUSD ${s.direction}* — ${strength} ${stars} (${regime})`,
    `Confidence: ${confidence}% | R:R ${s.riskRewardRatio.toFixed(2)}`,
    ``,
    `📍 Entry: $${s.entry.toFixed(2)}`,
    `🛑 SL: $${s.stopLoss.toFixed(2)}`,
    `🎯 TP1: $${s.takeProfit1.toFixed(2)} | TP2: $${s.takeProfit2.toFixed(2)} | TP3: $${s.takeProfit3.toFixed(2)}`,
    ``,
  ];

  // Top reasons (max 5)
  const topReasons = s.reasons
    .filter((r) => !r.includes("Insufficient"))
    .slice(0, 5);
  for (const reason of topReasons) {
    lines.push(`• ${reason}`);
  }

  lines.push(``);
  lines.push(`🔄 ${alignment.join(" | ")}`);
  lines.push(`ADX: ${adxStr} | RSI: ${ind.rsi14.toFixed(1)} | ATR: ${ind.atr14.toFixed(2)}`);
  lines.push(`S1: $${ind.pivots.s1.toFixed(0)} R1: $${ind.pivots.r1.toFixed(0)}${isFinite(ind.ema200) ? ` | EMA200: $${ind.ema200.toFixed(0)}` : ""}`);
  if (ind.divergence) {
    lines.push(`⚡ RSI ${ind.divergence.type} divergence (${ind.divergence.strength.toFixed(2)})`);
  }
  lines.push(``);
  lines.push(`⚠️ _Max 1-2% risk. Not financial advice. ${sourceLabel} data._`);

  return lines.join("\n");
}

export function isTradingTool(name: string): boolean {
  return TRADING_TOOLS.some((t) => t.name === name) || name === "analyze_xauusd";
}
