/**
 * Trading-specific tool definitions for the Claude agent tool-use loop.
 * These get merged with the core AGENT_TOOLS when the trading bot runs.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MarketDataProvider } from "./market-data.js";
import { SignalEngine } from "./signal-engine.js";

const marketData = new MarketDataProvider();
const signalEngine = new SignalEngine();

export const TRADING_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_xauusd_price",
    description:
      "Get the current XAUUSD (Gold/USD) price, spread, and 24h change. Use this to check the latest gold price.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "analyze_xauusd",
    description:
      "Run full technical analysis on XAUUSD and generate a trading signal. Returns BUY/SELL/HOLD with entry, stop-loss, and take-profit levels. Use the timeframe parameter to analyze different chart periods.",
    input_schema: {
      type: "object" as const,
      properties: {
        timeframe: {
          type: "string",
          enum: ["5min", "15min", "1h", "4h"],
          description: "Chart timeframe to analyze. Default: 15min",
        },
      },
      required: [],
    },
  },
  {
    name: "get_market_overview",
    description:
      "Get a comprehensive multi-timeframe analysis of XAUUSD. Scans 5min, 15min, 1h, and 4h charts to give a complete market picture.",
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
        `XAUUSD Price: $${quote.price.toFixed(2)}`,
        `Bid: $${quote.bid.toFixed(2)} | Ask: $${quote.ask.toFixed(2)} | Spread: $${quote.spread.toFixed(2)}`,
        `24h Change: ${quote.change24h >= 0 ? "+" : ""}$${quote.change24h.toFixed(2)} (${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}%)`,
        `24h High: $${quote.high24h.toFixed(2)} | Low: $${quote.low24h.toFixed(2)}`,
        `Timestamp: ${new Date(quote.timestamp).toUTCString()}`,
      ].join("\n");
    }

    case "analyze_xauusd": {
      const timeframe = (input.timeframe as string) || "15min";
      const [candleData, quote] = await Promise.all([
        marketData.getCandles(timeframe, 100),
        marketData.getQuote(),
      ]);
      const signal = signalEngine.analyze(candleData, quote);
      return signalEngine.formatSignalMessage(signal);
    }

    case "get_market_overview": {
      const [multiTf, quote] = await Promise.all([
        marketData.getMultiTimeframeCandles(),
        marketData.getQuote(),
      ]);

      const lines: string[] = [
        `📊 *XAUUSD MULTI-TIMEFRAME OVERVIEW*`,
        `Price: $${quote.price.toFixed(2)} | 24h: ${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}%`,
        ``,
      ];

      for (const [tf, data] of Object.entries(multiTf)) {
        const signal = signalEngine.analyze(data, quote);
        const emoji =
          signal.direction === "BUY" ? "🟢" :
          signal.direction === "SELL" ? "🔴" : "⚪";
        lines.push(
          `${emoji} *${tf}:* ${signal.direction} (${signal.strength}, ${signal.confluenceCount} confluences)`
        );
      }

      lines.push(``);
      lines.push(`_Use "analyze [timeframe]" for detailed signal on a specific timeframe._`);

      return lines.join("\n");
    }

    default:
      return `Unknown trading tool: ${name}`;
  }
}

export function isTradingTool(name: string): boolean {
  return TRADING_TOOLS.some((t) => t.name === name);
}
