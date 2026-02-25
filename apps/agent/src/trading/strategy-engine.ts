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
 *   4. Risk calculator shows actual risk (user decides)
 *
 * IMPORTANT: The engine ALWAYS outputs a trade (BUY or SELL) with a confidence
 * score. The user decides whether to act based on confidence level.
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
  action: "BUY" | "SELL";
  setup: "trend_pullback" | "range_bounce" | "squeeze_breakout" | "divergence_reversal" | "strong_momentum" | "momentum_move" | "breakout_retest" | "none";
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

  // Extended risk for high-confidence setups
  const extRiskPercent = Math.max(config.riskPercent, 2);
  const extMaxRisk = config.accountSize * (extRiskPercent / 100);
  const extMaxSlDistance = extMaxRisk / dollarPerPoint;

  return `You are a gold (XAUUSD) trading analyst. You receive technical data from 3 timeframes (15min, 1h, 4h) and decide the BEST trade to take right now.

## CRITICAL RULE: ALWAYS output a trade (BUY or SELL)
You MUST always pick a direction (BUY or SELL). There is no NO_TRADE option. Every market condition has a best trade — your job is to find it and assign an honest confidence score.
- Strong, clear setups: confidence 65-90%
- Decent setups with some uncertainty: confidence 40-64%
- Weak or unclear setups: confidence 15-39%
The user will decide whether to act based on your confidence score.

## Account Info
- Account: $${config.accountSize}
- Position size: ${config.lotSize} lots ($${dollarPerPoint} per $1 gold move)
- Standard risk: ${config.riskPercent}% = $${maxRiskDollars} max loss (stop loss within $${maxSlDistance.toFixed(1)})
- Extended risk (confidence >= 65%): ${extRiskPercent}% = $${extMaxRisk.toFixed(0)} max loss (stop loss within $${extMaxSlDistance.toFixed(1)})
- Typical profit target: $7-20 per trade

## What to Look For

Find the BEST matching setup. Assign confidence based on how clean and clear it is.

### 1. Trend Pullback (TRENDING, ADX > 25)
Price is in a clear trend on 4H, pulled back on 1H, and is bouncing on 15M.
- 4H: EMA20 > EMA50 (bull) or EMA20 < EMA50 (bear)
- 1H: Price near EMA20 or EMA50 (a "dip" in the trend)
- 15M: Signs of bounce — RSI turning up from 40-55 (bull) or down from 45-60 (bear)
- SL: Below the pullback low (bull) or above pullback high (bear)

### 2. Momentum Move (TRENDING, ADX > 20)
Price is moving strongly in one direction. Multiple timeframes agree. Ride the wave.
- 1H+4H: Price above EMA20, EMA20 above EMA50 (bull) — or all below for bear
- 15M: MACD positive and rising (bull), RSI 50-70 (not overbought yet)
- Recent candles show consistent direction (not choppy)
- SL: Below the most recent 15M swing low + $1 buffer (bull), or above swing high (bear)
- TP: Next pivot level or ATR-based projection

### 3. Range Bounce (RANGING, ADX < 20)
Price is bouncing off the edge of a range.
- Price near Bollinger Band edge or pivot support/resistance
- RSI < 35 (buy) or > 65 (sell)
- Stochastic in extreme zone and crossing back
- SL: Just beyond the range edge
- TP: Middle of range or opposite edge

### 4. Squeeze Breakout (BB bandwidth was tight, now expanding)
- BB bandwidth was compressed (< 3%) and is now expanding
- ADX starting to rise
- MACD confirming direction
- SL: Below breakout level

### 5. Breakout Retest (any regime)
Price broke through a key level and is now retesting it as support/resistance.
- Clear break of a pivot level, EMA, or previous range boundary
- Price returned to test the level from the other side
- Holding the level (not breaking back through)
- SL: Beyond the level by $1-2

### 6. Divergence Reversal (any regime)
- RSI divergence detected (provided in data)
- Price at a key level (pivot, BB band, or EMA200)
- SL: Beyond the extreme

## Risk Rules
- Stop loss MUST fit within the account risk limits shown above
- Use extended risk (up to ${extRiskPercent}%) for setups with confidence >= 65%
- Minimum reward:risk of 1.0 — prefer 1.5+ but 1.0 is fine for high-confidence setups
- Factor in ~$0.30-0.50 spread

## IMPORTANT: How to Write Your Reasoning
Write your reasoning as if explaining to a friend who does NOT know trading jargon.
- Say "gold is pushing higher, good momentum" NOT "bullish momentum confirmed by MACD histogram expansion"
- Say "price bounced off a support level" NOT "RSI divergence at S1 pivot with stochastic crossover"
- Say "market is sideways but leaning up" NOT "ranging regime with ADX at 15, RSI neutral"
- Keep it to 1-2 short sentences. Like texting a friend.
- NEVER use: RSI, MACD, EMA, ADX, Stochastic, Bollinger Bands, divergence, confluence, oscillator.

## Output Format — STRICT JSON

You MUST respond with ONLY a JSON object. No markdown, no explanation outside JSON.

Example BUY:
{"action":"BUY","setup":"momentum_move","confidence":72,"entry":2900.50,"stopLoss":2895.50,"takeProfit1":2904.00,"takeProfit2":2908.00,"takeProfit3":2912.00,"riskDollars":10.00,"riskPercent":1.0,"rewardDollars":15.00,"riskReward":1.50,"reasoning":"Gold is pushing up strongly and has good momentum. Looks like it wants to keep going higher.","regime":"TRENDING"}

Example low-confidence:
{"action":"SELL","setup":"range_bounce","confidence":30,"entry":2910.00,"stopLoss":2913.00,"takeProfit1":2907.00,"takeProfit2":2904.00,"takeProfit3":2900.00,"riskDollars":6.00,"riskPercent":0.6,"rewardDollars":12.00,"riskReward":2.00,"reasoning":"Gold is near the top of its recent range and might pull back, but it's not very clear yet.","regime":"RANGING"}`;
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

  sections.push("Analyze the data above. You MUST output a BUY or SELL decision with confidence. Output your decision as a single JSON object.");

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

      // Force action to BUY or SELL — never NO_TRADE
      let action: "BUY" | "SELL" = parsed.action === "SELL" ? "SELL" : "BUY";

      return {
        action,
        setup: parsed.setup || "none",
        confidence: Math.max(1, Number(parsed.confidence) || 25),
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
      // If JSON parsing fails, return a low-confidence BUY as fallback
      return {
        action: "BUY",
        setup: "none",
        confidence: 10,
        entry: 0, stopLoss: 0,
        takeProfit1: 0, takeProfit2: 0, takeProfit3: 0,
        riskDollars: 0, riskPercent: 0, rewardDollars: 0, riskReward: 0,
        reasoning: `Could not analyze the market right now. Wait for the next check.`,
        regime: "UNKNOWN",
      };
    }
  }

  /**
   * Recalculate actual risk numbers (don't trust Sonnet's math).
   * No hard rejection — user sees the risk and decides.
   */
  private validateRisk(decision: StrategyDecision): void {
    const { dollarPerPoint } = calculateRiskParams(this.config);
    const slDistance = Math.abs(decision.entry - decision.stopLoss);

    // Recalculate risk (don't trust Sonnet's math)
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
