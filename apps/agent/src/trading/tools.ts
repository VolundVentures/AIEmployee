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
 */

import Anthropic from "@anthropic-ai/sdk";
import { MarketDataProvider } from "./market-data.js";
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
 */
export async function executeTradingTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "get_xauusd_price": {
      const quote = await marketData.getQuote();
      return [
        `XAUUSD: $${quote.price.toFixed(2)}`,
        `Bid/Ask: $${quote.bid.toFixed(2)}/$${quote.ask.toFixed(2)} (spread $${quote.spread.toFixed(2)})`,
        `24h: ${quote.change24h >= 0 ? "+" : ""}$${quote.change24h.toFixed(2)} (${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}%)`,
        `Range: $${quote.low24h.toFixed(2)} – $${quote.high24h.toFixed(2)}`,
      ].join("\n");
    }

    case "generate_signal": {
      return await generateDeepSignal();
    }

    case "get_market_overview": {
      const [multiTf, quote] = await Promise.all([
        marketData.getMultiTimeframeCandles(),
        marketData.getQuote(),
      ]);

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

      return lines.join("\n");
    }

    // Keep backward compat for analyze_xauusd if called from old conversations
    case "analyze_xauusd": {
      return await generateDeepSignal();
    }

    default:
      return `Unknown trading tool: ${name}`;
  }
}

/**
 * The core deep analysis function.
 *
 * 1. Fetches 15min, 1h, and 4h candles + current quote in parallel (1 network round)
 * 2. Runs signal engine on each timeframe
 * 3. Cross-validates: picks the best primary timeframe, checks higher-TF alignment
 * 4. Returns a concise, WhatsApp-ready message (under 1500 chars)
 */
async function generateDeepSignal(): Promise<string> {
  // Single parallel fetch — all data in one go
  const [candles15, candles1h, candles4h, quote] = await Promise.all([
    marketData.getCandles("15min", 100),
    marketData.getCandles("1h", 100),
    marketData.getCandles("4h", 100),
    marketData.getQuote(),
  ]);

  const sig15 = signalEngine.analyze(candles15, quote);
  const sig1h = signalEngine.analyze(candles1h, quote);
  const sig4h = signalEngine.analyze(candles4h, quote);

  // ─── Cross-timeframe alignment ──────────────────────────
  // Higher TFs carry more weight. We find the best actionable signal
  // and check if higher TFs agree.

  const signals: { tf: string; signal: TradingSignal }[] = [
    { tf: "15min", signal: sig15 },
    { tf: "1h", signal: sig1h },
    { tf: "4h", signal: sig4h },
  ];

  // Pick the primary signal: prefer the highest-confidence actionable one
  const actionable = signals
    .filter((s) => s.signal.direction !== "HOLD")
    .sort((a, b) => b.signal.confidence - a.signal.confidence);

  // If nothing is actionable, return a concise "no signal" message
  if (actionable.length === 0) {
    return formatNoSignal(quote.price, sig15, sig1h, sig4h);
  }

  const primary = actionable[0];
  const primaryDir = primary.signal.direction;

  // Check alignment: how many TFs agree with the primary direction?
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

  // Boost or penalize confidence based on alignment
  let adjustedConfidence = primary.signal.confidence;
  if (aligned >= 3) adjustedConfidence = Math.min(100, adjustedConfidence + 15);
  else if (aligned >= 2) adjustedConfidence = Math.min(100, adjustedConfidence + 5);
  if (conflicting > 0) adjustedConfidence = Math.max(20, adjustedConfidence - 15);

  // If conflicting signals dominate and confidence is low, downgrade to no-signal
  if (conflicting >= 2 || adjustedConfidence < 40) {
    return formatNoSignal(quote.price, sig15, sig1h, sig4h);
  }

  // Upgrade strength based on multi-TF alignment
  let strength = primary.signal.strength;
  if (aligned >= 3 && adjustedConfidence >= 75) strength = "STRONG";
  else if (aligned >= 2 && adjustedConfidence >= 55) strength = "MODERATE";

  return formatSignal(primary, strength, adjustedConfidence, alignmentDetails);
}

/**
 * Format a concise "no signal" message (well under 1600 chars).
 */
function formatNoSignal(
  price: number,
  sig15: TradingSignal,
  sig1h: TradingSignal,
  sig4h: TradingSignal
): string {
  const dir = (s: TradingSignal) =>
    s.direction === "BUY" ? "🟢" : s.direction === "SELL" ? "🔴" : "⚪";

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
  ].join("\n");
}

/**
 * Format a concise, actionable signal message (under 1500 chars).
 */
function formatSignal(
  primary: { tf: string; signal: TradingSignal },
  strength: string,
  confidence: number,
  alignment: string[]
): string {
  const s = primary.signal;
  const emoji = s.direction === "BUY" ? "🟢" : "🔴";
  const stars =
    strength === "STRONG" ? "⭐⭐⭐" :
    strength === "MODERATE" ? "⭐⭐" : "⭐";

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

  // Top 4 reasons max to stay concise
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

  return lines.join("\n");
}

export function isTradingTool(name: string): boolean {
  // Also handle legacy analyze_xauusd calls
  return TRADING_TOOLS.some((t) => t.name === name) || name === "analyze_xauusd";
}
