/**
 * Sonnet Strategy Engine — LLM as the Trading Brain.
 *
 * Instead of hardcoded indicator scoring, this sends structured market data
 * to Claude Sonnet 4.6 and lets the LLM apply strategic reasoning to identify
 * high-probability setups.
 *
 * Architecture:
 *   1. signal-engine.ts computes all indicators (free, instant)
 *   2. This engine formats indicators into a structured prompt
 *   3. Sonnet analyzes and returns a JSON trade decision
 *   4. Risk validator ensures SL is within account budget
 *
 * Setups Sonnet looks for:
 *   - Trend Pullback (ADX > 25, price pulls back to EMA, bounces)
 *   - Range Bounce (ADX < 20, price at BB band + RSI extreme)
 *   - Squeeze Breakout (BB bandwidth expanding from < 3%)
 *   - Divergence Reversal (RSI divergence at key level)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { IndicatorSnapshot, MarketRegime } from "./signal-engine.js";
import type { Candle, MarketSnapshot } from "./market-data.js";

// ─── Types ───────────────────────────────────────────────────────

export interface AccountConfig {
  accountSize: number;   // e.g. 1000
  lotSize: number;       // e.g. 0.02
  riskPercent: number;   // e.g. 1 or 2
}

export interface StrategyDecision {
  action: "BUY" | "SELL" | "NO_TRADE";
  setup: "trend_pullback" | "range_bounce" | "squeeze_breakout" | "divergence_reversal" | "none";
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskDollars: number;
  riskPercent: number;
  rewardDollars: number;
  riskReward: number;
  reasoning: string;
  regime: string;
}

export interface MultiTfSnapshots {
  tf15m: IndicatorSnapshot;
  tf1h: IndicatorSnapshot;
  tf4h: IndicatorSnapshot;
}

// ─── Risk Calculator ─────────────────────────────────────────────

function calculateRiskParams(config: AccountConfig) {
  const dollarPerPoint = config.lotSize * 100; // 0.02 lot = $2 per $1 gold move
  const maxRiskDollars = config.accountSize * (config.riskPercent / 100);
  const maxSlDistance = maxRiskDollars / dollarPerPoint;
  return { dollarPerPoint, maxRiskDollars, maxSlDistance };
}

// ─── Strategy System Prompt ──────────────────────────────────────

function buildSystemPrompt(config: AccountConfig): string {
  const { dollarPerPoint, maxRiskDollars, maxSlDistance } = calculateRiskParams(config);

  return `You are an expert XAUUSD (Gold/USD) intraday trader. You receive structured technical indicator data from multiple timeframes and must determine if there is a high-probability trading setup RIGHT NOW.

## Account Constraints
- Account: $${config.accountSize}
- Position: ${config.lotSize} lots (${dollarPerPoint} oz gold = $${dollarPerPoint} per $1 move)
- Max risk per trade: ${config.riskPercent}% = $${maxRiskDollars}
- Max stop-loss distance: $${maxSlDistance.toFixed(2)} from entry
- Target profit per trade: $7-15 ($3.50-$7.50 gold move)

## Setup Identification

Look for EXACTLY these setups. If none match cleanly, output NO_TRADE.

### 1. Trend Pullback (TRENDING regime, ADX > 25)
- 4H: Clear trend structure (EMA20 > EMA50 for bull, or < for bear)
- 1H: Price has pulled back toward EMA20 or EMA50
- 15M: RSI bouncing from 40-55 zone (bull) or 45-60 (bear), Stochastic crossing in trend direction
- MACD histogram should be flattening or turning in trend direction
- Entry: at current price after bounce confirmation
- SL: below recent 15m swing low/high (MUST be within $${maxSlDistance.toFixed(1)})
- TP: next pivot level, R1/R2 for buys, S1/S2 for sells

### 2. Range Bounce (RANGING regime, ADX < 20)
- Price touching or near Bollinger Band lower (BUY) or upper (SELL)
- RSI < 35 for buys, > 65 for sells
- Stochastic in extreme zone (< 20 for buys, > 80 for sells) and crossing
- Better if RSI divergence is present
- Entry: at current price near the band
- SL: beyond the band by $1-2 (MUST be within $${maxSlDistance.toFixed(1)})
- TP: BB middle band or opposite band

### 3. Squeeze Breakout (BB bandwidth was < 3%, now expanding)
- Bollinger Band bandwidth recently < 3% and now increasing
- ADX rising from below 20
- MACD confirming breakout direction
- Price breaking above recent range highs (BUY) or below lows (SELL)
- Entry: at current price on breakout
- SL: below breakout level (MUST be within $${maxSlDistance.toFixed(1)})
- TP: ATR-based projection

### 4. Divergence Reversal (any regime)
- RSI divergence detected (provided in data)
- Price at a key level: pivot point, BB band, or near EMA200
- Stochastic confirming the reversal direction
- Entry: at current price
- SL: beyond the extreme (MUST be within $${maxSlDistance.toFixed(1)})
- TP: next pivot level

## Risk Rules — STRICT
- Stop-loss MUST be within $${maxSlDistance.toFixed(1)} of entry. Violations will be rejected.
- Minimum risk:reward ratio of 1.5 (prefer 2.0+)
- Do NOT trade against EMA200 on 4H unless divergence confirms reversal
- If the setup is marginal or unclear, choose NO_TRADE. Protecting capital > forcing trades.
- Consider spread: entry is at ask (BUY) or bid (SELL). Factor ~$0.30-0.50 spread into levels.

## Output Format — STRICT JSON

You MUST respond with ONLY a JSON object. No markdown, no explanation outside the JSON. The JSON must match this exact structure:

{"action":"BUY","setup":"trend_pullback","confidence":72,"entry":2900.50,"stopLoss":2895.50,"takeProfit1":2904.00,"takeProfit2":2908.00,"takeProfit3":2912.00,"riskDollars":10.00,"riskPercent":1.0,"rewardDollars":15.00,"riskReward":1.50,"reasoning":"Clear 1H pullback to EMA20 in established uptrend. RSI bouncing from 48, MACD histogram turning positive. 4H structure intact above EMA200.","regime":"TRENDING"}

For NO_TRADE:
{"action":"NO_TRADE","setup":"none","confidence":0,"entry":0,"stopLoss":0,"takeProfit1":0,"takeProfit2":0,"takeProfit3":0,"riskDollars":0,"riskPercent":0,"rewardDollars":0,"riskReward":0,"reasoning":"Ranging market with ADX at 15. Price in mid-BB range, RSI neutral at 52. No clear setup. Watch for bounce at S1 $2893 or rejection at R1 $2907.","regime":"RANGING"}`;
}

// ─── Prompt Builder ──────────────────────────────────────────────

function buildAnalysisPrompt(
  snapshots: MultiTfSnapshots,
  recentCandles: Candle[],
  quote: MarketSnapshot,
  memory: string
): string {
  const sections: string[] = [];

  // Price header
  sections.push(`## Current Price: $${quote.price.toFixed(2)} | Bid: $${quote.bid.toFixed(2)} | Ask: $${quote.ask.toFixed(2)} | Spread: $${quote.spread.toFixed(2)}`);
  sections.push(`24H: ${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}% | Range: $${quote.low24h.toFixed(2)}-$${quote.high24h.toFixed(2)}`);
  sections.push("");

  // Format each timeframe
  for (const [label, snap] of [
    ["15-Minute", snapshots.tf15m],
    ["1-Hour", snapshots.tf1h],
    ["4-Hour", snapshots.tf4h],
  ] as [string, IndicatorSnapshot][]) {
    sections.push(`## ${label} Timeframe [${snap.regime}]`);
    sections.push(`EMA20: $${snap.ema20.toFixed(2)} | EMA50: $${snap.ema50.toFixed(2)}${isFinite(snap.ema200) ? ` | EMA200: $${snap.ema200.toFixed(2)}` : ""}`);
    sections.push(`RSI(14): ${snap.rsi14.toFixed(1)} | Stoch K: ${snap.stochK.toFixed(1)} D: ${snap.stochD.toFixed(1)}`);
    sections.push(`MACD: ${snap.macdHistogram > 0 ? "+" : ""}${snap.macdHistogram.toFixed(4)} (line: ${snap.macdLine.toFixed(4)}, signal: ${snap.macdSignal.toFixed(4)})`);
    sections.push(`BB: $${snap.bbLower.toFixed(2)} / $${snap.bbMiddle.toFixed(2)} / $${snap.bbUpper.toFixed(2)} | BW: ${isFinite(snap.bbBandwidth) ? snap.bbBandwidth.toFixed(1) + "%" : "N/A"}`);
    sections.push(`ATR(14): $${snap.atr14.toFixed(2)} | ADX: ${isFinite(snap.adx) ? snap.adx.toFixed(1) : "N/A"} | +DI: ${isFinite(snap.plusDI) ? snap.plusDI.toFixed(1) : "N/A"} | -DI: ${isFinite(snap.minusDI) ? snap.minusDI.toFixed(1) : "N/A"}`);
    if (isFinite(snap.vwap) && snap.vwap > 0) {
      sections.push(`VWAP: $${snap.vwap.toFixed(2)}`);
    }
    sections.push(`Pivot: $${snap.pivots.pivot.toFixed(2)} | S1: $${snap.pivots.s1.toFixed(2)} S2: $${snap.pivots.s2.toFixed(2)} | R1: $${snap.pivots.r1.toFixed(2)} R2: $${snap.pivots.r2.toFixed(2)}`);
    if (snap.divergence) {
      sections.push(`⚡ RSI ${snap.divergence.type} divergence detected (strength: ${snap.divergence.strength.toFixed(2)})`);
    }
    sections.push("");
  }

  // Recent 15m candles (last 10)
  const last10 = recentCandles.slice(-10);
  if (last10.length > 0) {
    sections.push("## Recent 15M Candles (last 10)");
    for (const c of last10) {
      const time = new Date(c.timestamp).toISOString().slice(11, 16);
      const dir = c.close >= c.open ? "▲" : "▼";
      sections.push(`${time} ${dir} O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`);
    }
    sections.push("");
  }

  // Memory context
  if (memory) {
    sections.push("## Previous Analysis");
    sections.push(memory);
    sections.push("");
  }

  sections.push("Analyze the data above. Output your decision as a single JSON object.");

  return sections.join("\n");
}

// ─── Strategy Engine ─────────────────────────────────────────────

export class StrategyEngine {
  private anthropic: Anthropic;
  private config: AccountConfig;
  private systemPrompt: string;

  constructor(apiKey: string, config: AccountConfig) {
    this.anthropic = new Anthropic({ apiKey });
    this.config = config;
    this.systemPrompt = buildSystemPrompt(config);
  }

  /**
   * Analyze market data using Sonnet and return a strategy decision.
   */
  async analyze(
    snapshots: MultiTfSnapshots,
    recentCandles: Candle[],
    quote: MarketSnapshot,
    memory: string = ""
  ): Promise<{ decision: StrategyDecision; tokensIn: number; tokensOut: number; cost: number }> {
    const prompt = buildAnalysisPrompt(snapshots, recentCandles, quote, memory);

    const response = await this.anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: this.systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract text from response
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const cost = (tokensIn / 1_000_000) * 3.0 + (tokensOut / 1_000_000) * 15.0;

    const decision = this.parseResponse(text);
    this.validateRisk(decision);

    return { decision, tokensIn, tokensOut, cost };
  }

  /**
   * Parse Sonnet's JSON response into a StrategyDecision.
   */
  private parseResponse(text: string): StrategyDecision {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    try {
      const parsed = JSON.parse(cleaned);

      return {
        action: parsed.action || "NO_TRADE",
        setup: parsed.setup || "none",
        confidence: Number(parsed.confidence) || 0,
        entry: Number(parsed.entry) || 0,
        stopLoss: Number(parsed.stopLoss) || 0,
        takeProfit1: Number(parsed.takeProfit1) || 0,
        takeProfit2: Number(parsed.takeProfit2) || 0,
        takeProfit3: Number(parsed.takeProfit3) || 0,
        riskDollars: Number(parsed.riskDollars) || 0,
        riskPercent: Number(parsed.riskPercent) || 0,
        rewardDollars: Number(parsed.rewardDollars) || 0,
        riskReward: Number(parsed.riskReward) || 0,
        reasoning: String(parsed.reasoning || ""),
        regime: String(parsed.regime || "UNKNOWN"),
      };
    } catch {
      // If JSON parsing fails, return NO_TRADE with the raw text as reasoning
      return {
        action: "NO_TRADE",
        setup: "none",
        confidence: 0,
        entry: 0, stopLoss: 0,
        takeProfit1: 0, takeProfit2: 0, takeProfit3: 0,
        riskDollars: 0, riskPercent: 0, rewardDollars: 0, riskReward: 0,
        reasoning: `Analysis failed to parse: ${text.slice(0, 200)}`,
        regime: "UNKNOWN",
      };
    }
  }

  /**
   * Validate that the decision respects account risk constraints.
   * If SL exceeds max distance, downgrade to NO_TRADE.
   */
  private validateRisk(decision: StrategyDecision): void {
    if (decision.action === "NO_TRADE") return;

    const { maxSlDistance, maxRiskDollars, dollarPerPoint } = calculateRiskParams(this.config);
    const slDistance = Math.abs(decision.entry - decision.stopLoss);

    if (slDistance > maxSlDistance * 1.1) {
      // Allow 10% tolerance, then reject
      decision.action = "NO_TRADE";
      decision.reasoning = `[RISK OVERRIDE] SL distance $${slDistance.toFixed(2)} exceeds max $${maxSlDistance.toFixed(2)}. Original: ${decision.reasoning}`;
      return;
    }

    // Recalculate risk in case Sonnet got the math wrong
    decision.riskDollars = slDistance * dollarPerPoint;
    decision.riskPercent = (decision.riskDollars / this.config.accountSize) * 100;

    // Recalculate reward based on TP2
    if (decision.takeProfit2 > 0) {
      const rewardDistance = Math.abs(decision.takeProfit2 - decision.entry);
      decision.rewardDollars = rewardDistance * dollarPerPoint;
      decision.riskReward = decision.riskDollars > 0
        ? decision.rewardDollars / decision.riskDollars : 0;
    }
  }
}
