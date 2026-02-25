/**
 * Trading-specific tool definitions for the Claude agent tool-use loop.
 * These get merged with the core AGENT_TOOLS when the trading bot runs.
 *
 * Design philosophy — token-efficient, deep analysis:
 *   - `generate_signal` does the heavy lifting: multi-TF confluence, deep
 *     analysis, and pre-formatted WhatsApp-ready output. The AI should call
 *     this ONCE and forward the result — no reformatting needed.
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
import type { TradingSignal } from "./signal-engine.js";

const marketData = new MarketDataProvider();
const signalEngine = new SignalEngine();

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
      "Generate a deep, high-confidence XAUUSD trading signal. This tool performs multi-timeframe analysis (15min + 1h + 4h), cross-validates confluence across timeframes, and returns a pre-formatted WhatsApp-ready signal message. Call this ONCE — do NOT call other tools alongside it. Forward the result directly to the user without reformatting.",
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
//
// The heartbeat needs signal + overview. Instead of calling each tool
// separately (9 API calls, exceeds Twelve Data 8/min limit), we fetch
// all unique data once (5 calls) and derive both outputs from it.

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
    marketData.getCandles("1h", 100),
    marketData.getCandles("4h", 100),
    marketData.getQuote(),
  ]);
  return { quote, candles5min, candles15min, candles1h, candles4h };
}

/**
 * Run full heartbeat analysis from pre-fetched data.
 * Returns { signalResult, overviewResult } — no additional API calls.
 */
export function runHeartbeatAnalysis(data: HeartbeatData): {
  signalResult: string;
  overviewResult: string;
} {
  const signalResult = generateDeepSignalFromData(
    data.candles15min, data.candles1h, data.candles4h, data.quote
  );
  const overviewResult = formatOverview(
    {
      "5min": data.candles5min,
      "15min": data.candles15min,
      "1h": data.candles1h,
      "4h": data.candles4h,
    },
    data.quote
  );
  return { signalResult, overviewResult };
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
    lines.push(
      `${emoji} *${tf}:* ${signal.direction} (${signal.strength}, conf ${signal.confidence}%)`
    );
  }

  lines.push(``);
  const sourceLabel = quote.source === "twelvedata" ? "Twelve Data (spot)" : "Yahoo GC=F (futures)";
  lines.push(`_Data: ${sourceLabel}_`);

  return lines.join("\n");
}

// ─── Deep signal generation ───────────────────────────────────────

/**
 * Generate signal by fetching data (for on-demand queries).
 */
async function generateDeepSignal(): Promise<string> {
  const [candles15, candles1h, candles4h, quote] = await Promise.all([
    marketData.getCandles("15min", 100),
    marketData.getCandles("1h", 100),
    marketData.getCandles("4h", 100),
    marketData.getQuote(),
  ]);
  return generateDeepSignalFromData(candles15, candles1h, candles4h, quote);
}

/**
 * Generate signal from pre-fetched data (for heartbeats — no API calls).
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

  const sourceLabel = source === "twelvedata" ? "spot XAUUSD" : "GC=F futures";

  return [
    `⚪ *XAUUSD — NO CLEAR SIGNAL*`,
    `Price: $${price.toFixed(2)}`,
    ``,
    `${dir(sig15)} 15min: ${sig15.direction} (conf ${sig15.confidence}%)`,
    `${dir(sig1h)} 1h: ${sig1h.direction} (conf ${sig1h.confidence}%)`,
    `${dir(sig4h)} 4h: ${sig4h.direction} (conf ${sig4h.confidence}%)`,
    ``,
    `RSI: ${sig15.indicators.rsi14.toFixed(1)} | MACD: ${sig15.indicators.macdHistogram > 0 ? "Bullish" : "Bearish"}`,
    `Trend: EMA20 ${sig15.indicators.ema20 > sig15.indicators.ema50 ? ">" : "<"} EMA50`,
    ``,
    `_Timeframes not aligned — waiting for confluence._`,
    `_Data: ${sourceLabel}_`,
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
  const stars =
    strength === "STRONG" ? "⭐⭐⭐" :
    strength === "MODERATE" ? "⭐⭐" : "⭐";

  const sourceLabel = source === "twelvedata" ? "spot XAUUSD" : "GC=F futures";

  const lines = [
    `${emoji} *XAUUSD ${s.direction} SIGNAL* ${emoji}`,
    `${strength} ${stars} | Confidence: ${confidence}%`,
    ``,
    `📍 Entry: $${s.entry.toFixed(2)}`,
    `🛑 SL: $${s.stopLoss.toFixed(2)}`,
    `🎯 TP1: $${s.takeProfit1.toFixed(2)}`,
    `🎯 TP2: $${s.takeProfit2.toFixed(2)}`,
    `🎯 TP3: $${s.takeProfit3.toFixed(2)}`,
    `📊 R:R ${s.riskRewardRatio.toFixed(2)} | TF: ${primary.tf}`,
    ``,
    `📈 *Why:*`,
  ];

  const topReasons = s.reasons
    .filter((r) => !r.includes("Insufficient"))
    .slice(0, 4);
  for (const reason of topReasons) {
    lines.push(`• ${reason}`);
  }

  lines.push(``);
  lines.push(`🔄 *Multi-TF:* ${alignment.join(" | ")}`);
  lines.push(``);
  lines.push(`⚠️ _Max 1-2% risk per trade. Not financial advice._`);
  lines.push(`_Data: ${sourceLabel}_`);

  return lines.join("\n");
}

export function isTradingTool(name: string): boolean {
  return TRADING_TOOLS.some((t) => t.name === name) || name === "analyze_xauusd";
}
