/**
 * Sonnet Strategy Engine v3 — Professional-Grade Trading Brain.
 *
 * Combines Smart Money Concepts (ICT methodology), multi-timeframe
 * top-down analysis, session awareness, and price structure analysis
 * to generate institutional-quality trade signals.
 *
 * Architecture:
 *   1. signal-engine.ts computes all indicators + structure data (free, instant)
 *   2. This engine formats everything into a structured prompt
 *   3. Sonnet analyzes using Smart Money methodology and returns a JSON decision
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
  setup: "trend_pullback" | "range_bounce" | "squeeze_breakout" | "divergence_reversal" | "strong_momentum" | "momentum_move" | "breakout_retest" | "liquidity_sweep" | "fvg_entry" | "order_block" | "none";
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

  const extRiskPercent = Math.max(config.riskPercent, 3);
  const extMaxRisk = config.accountSize * (extRiskPercent / 100);
  const extMaxSlDistance = extMaxRisk / dollarPerPoint;

  return `You are an elite XAUUSD (Gold) trading analyst who thinks like institutional Smart Money. You receive comprehensive market data including price structure, Fair Value Gaps, Order Blocks, swing points, volume analysis, session timing, and traditional indicators across 3 timeframes. Your job is to find the best possible trade RIGHT NOW.

## CRITICAL RULE: ALWAYS output a trade (BUY or SELL)
You MUST always pick a direction. There is no "no trade" option. Every market state has an optimal direction — find it.
- Confidence 70-95%: Strong institutional setup with multi-timeframe alignment
- Confidence 50-69%: Good setup with decent structure support
- Confidence 30-49%: Decent lean with some supporting factors
- Confidence 10-29%: Weak lean, market is unclear

## Account Info
- Account: $${config.accountSize} | Position: ${config.lotSize} lots ($${dollarPerPoint}/point)
- Standard risk: ${config.riskPercent}% = $${maxRiskDollars} (SL ≤ $${maxSlDistance.toFixed(1)})
- Extended risk (confidence ≥ 60%): ${extRiskPercent}% = $${extMaxRisk.toFixed(0)} (SL ≤ $${extMaxSlDistance.toFixed(1)})

## TOP-DOWN ANALYSIS METHOD (How Smart Money Trades)

### Step 1: Determine Bias from 4H
- Check market structure: Is 4H making Higher Highs + Higher Lows (bullish) or Lower Highs + Lower Lows (bearish)?
- Check EMA alignment: EMA20 > EMA50 = bullish, EMA20 < EMA50 = bearish
- EMA200 position: Price above = long-term bullish, below = bearish
- The 4H sets your DIRECTION. Do not fight it unless there's a confirmed structure break.

### Step 2: Find Key Levels on 1H
- Identify Order Blocks (OBs): the last opposite candle before a big move — institutional positions
- Identify Fair Value Gaps (FVGs): price imbalances that price wants to fill
- Identify unfilled liquidity levels: equal highs/lows where stops are sitting
- Identify swing highs/lows for support/resistance

### Step 3: Time Your Entry on 15M
- Wait for price to reach a key level (OB, FVG, swing point, pivot)
- Look for confirmation: candlestick patterns (engulfing, pin bar, hammer)
- Volume confirmation: volume spike = real move, low volume = fake
- Session timing: London Kill Zone (07:00-10:00 UTC) and NY Kill Zone (12:00-15:00 UTC) are the best times to trade

## SETUP TYPES (Ranked by Reliability)

### 1. Liquidity Sweep + FVG Entry (HIGHEST PROBABILITY)
Price hunts stop losses beyond a key level, then reverses into a Fair Value Gap.
- Look for: liquidity sweep of equal highs/lows or previous day high/low
- Entry: at a nearby FVG or Order Block after the sweep
- Confirmation: displacement candle (big body, small wicks) in the reversal direction
- Best during: London or NY Kill Zone
- Confidence boost: +15% if during kill zone, +10% if volume confirms

### 2. Order Block Rejection
Price returns to an Order Block and rejects it (continuation of the institutional move).
- 4H/1H: Clear trend direction
- Price touches or enters the Order Block zone
- 15M: Shows rejection candle (pin bar, engulfing) at the OB
- SL: Beyond the Order Block
- TP: Next swing high/low or FVG

### 3. Trend Continuation with Structure
Price is in a clear trend with proper market structure (HH/HL or LH/LL).
- 4H: Clear structure (multiple HH/HL for bull, LH/LL for bear)
- 1H: Price has pulled back but structure is intact
- 15M: Shows reversal pattern at a support/resistance level
- Use VWAP: price above VWAP = bullish bias, below = bearish
- SL: Below the recent swing low (bull) / above swing high (bear)

### 4. Strong Momentum / Displacement
A big, fast directional move with volume confirmation.
- Multiple candles closing in one direction with large bodies
- MACD histogram growing in the direction
- Volume above average (volume ratio > 1.2)
- RSI confirming (50-70 for buys, 30-50 for sells)
- SL: Below the displacement origin (last swing before the move)
- Best when: all 3 timeframes agree on direction

### 5. Range Bounce at Extreme
Price at the edge of a range with reversal signals.
- ADX < 20 (ranging market)
- Price at BB band edge, S1/R1, or equal highs/lows
- Stochastic in extreme zone crossing back
- Candlestick pattern confirms reversal
- SL: Beyond the range extreme

### 6. Squeeze Breakout
Volatility compression followed by expansion.
- BB bandwidth was tight (< 3%), now expanding
- ADX rising from below 20
- Direction confirmed by MACD and structure
- Volume spike on the breakout
- SL: Below the squeeze zone

## PREMIUM / DISCOUNT ZONES — CRITICAL
Calculate the 50% level of the current 4H swing range (recent swing high to swing low):
- **Discount zone** (below 50%): Only look for BUYS here
- **Premium zone** (above 50%): Only look for SELLS here
- Trading in the wrong zone = low probability. Reduce confidence by 15% if you must.

## THE AMD CYCLE (Session-Based)
Gold follows this cycle most days:
1. **Accumulation (Asian session)**: Price builds a tight range. Note the high and low.
2. **Manipulation (London open)**: Price sweeps one side of the Asian range — this is the FAKE move / stop hunt.
3. **Distribution (London-NY)**: After the sweep, price reverses and runs in the REAL direction.

If you're in London session and price just swept the Asian high → look for SELLS.
If you're in London session and price just swept the Asian low → look for BUYS.
The previous day high/low data and session info are provided — USE THEM.

## CONFIDENCE SCORING — BE PRECISE

Add confidence for each factor present:
- 4H structure aligns with your trade: +15%
- 1H structure aligns: +10%
- 15M confirms with pattern: +10%
- Price at key level (OB, FVG, pivot, swing): +10%
- Volume confirms (spike or OBV agrees): +10%
- During Kill Zone (London/NY): +10%
- Multiple timeframes agree on direction: +10%
- Fresh candlestick pattern (engulfing, pin bar): +5%
- VWAP aligns with direction: +5%
- RSI divergence present: +10%
- Price in correct zone (buys in discount, sells in premium): +10%
- AMD cycle aligns (e.g., London sweep → reversal trade): +10%

Subtract confidence for:
- Trading against 4H structure: -20%
- Against EMA200: -10%
- Low volume / no confirmation: -10%
- Asian session (low liquidity): -10%
- Choppy/mixed structure: -10%
- Price in wrong zone (buying in premium, selling in discount): -15%

Start at 20% base and add/subtract. Cap at 90%.

## STOP LOSS PLACEMENT — USE STRUCTURE, NOT ARBITRARY DISTANCE
- Place SL beyond the nearest structure level (swing low/high, OB edge, FVG boundary)
- Add a $1-2 buffer beyond the level
- NEVER use arbitrary pip distances — always tie to structure
- If the structural SL is too wide for the account, reduce confidence (don't skip the trade)

## REASONING — SIMPLE LANGUAGE
Write reasoning in 1-2 SHORT sentences for a non-trader friend.
- "Gold swept below yesterday's low and is bouncing back up strongly. Good spot to ride it higher."
- "Price is pushing down with force after hitting a ceiling. Looks like it wants to go lower."
- "Market is quiet and chopping around. Slight lean up but nothing clear yet."
NEVER use: RSI, MACD, EMA, ADX, Stochastic, Bollinger, divergence, confluence, FVG, OB, smart money.

## Output — STRICT JSON only (no markdown, no text)

{"action":"BUY","setup":"liquidity_sweep","confidence":78,"entry":2900.50,"stopLoss":2894.50,"takeProfit1":2905.00,"takeProfit2":2910.00,"takeProfit3":2918.00,"riskDollars":12.00,"riskPercent":1.2,"rewardDollars":19.00,"riskReward":1.58,"reasoning":"Gold dipped below a key level to grab stops, then shot back up with force. Strong bounce — riding it higher.","regime":"TRENDING"}`;
}

// ─── Prompt Builder ──────────────────────────────────────────────

function buildAnalysisPrompt(
  snapshots: MultiTfSnapshots,
  recentCandles: Candle[],
  quote: MarketSnapshot,
  memory: string
): string {
  const sections: string[] = [];

  // Session context (crucial for timing)
  const session = snapshots.tf15m.session;
  sections.push(`## SESSION: ${session.current.toUpperCase().replace(/_/g, " ")}${session.isKillZone ? " ⚡ KILL ZONE ACTIVE" : ""}`);
  sections.push(`Minutes into session: ${session.minutesIntoSession}`);
  if (session.previousDayHigh > 0) {
    sections.push(`Previous day: High $${session.previousDayHigh.toFixed(2)} | Low $${session.previousDayLow.toFixed(2)}`);
  }
  sections.push("");

  // Price header
  sections.push(`## Current Price: $${quote.price.toFixed(2)} | Bid: $${quote.bid.toFixed(2)} | Ask: $${quote.ask.toFixed(2)} | Spread: $${quote.spread.toFixed(2)}`);
  sections.push(`24H: ${quote.changePct24h >= 0 ? "+" : ""}${quote.changePct24h.toFixed(2)}% | Range: $${quote.low24h.toFixed(2)}-$${quote.high24h.toFixed(2)}`);

  // Premium/Discount zone from 4H structure
  const swingHigh4h = snapshots.tf4h.structure.recentSwingHigh;
  const swingLow4h = snapshots.tf4h.structure.recentSwingLow;
  if (swingHigh4h > 0 && swingLow4h > 0) {
    const equilibrium = (swingHigh4h + swingLow4h) / 2;
    const zone = quote.price > equilibrium ? "PREMIUM (look for sells)" : "DISCOUNT (look for buys)";
    sections.push(`4H Range: $${swingLow4h.toFixed(2)} - $${swingHigh4h.toFixed(2)} | 50% = $${equilibrium.toFixed(2)} | Zone: ${zone}`);
  }
  sections.push("");

  // Format each timeframe with full data
  for (const [label, snap] of [
    ["4-Hour (BIAS)", snapshots.tf4h],
    ["1-Hour (STRUCTURE)", snapshots.tf1h],
    ["15-Minute (ENTRY)", snapshots.tf15m],
  ] as [string, IndicatorSnapshot][]) {
    sections.push(`## ${label} [${snap.regime}]`);

    // Traditional indicators
    sections.push(`EMA20: $${snap.ema20.toFixed(2)} | EMA50: $${snap.ema50.toFixed(2)}${isFinite(snap.ema200) ? ` | EMA200: $${snap.ema200.toFixed(2)}` : ""}`);
    sections.push(`RSI(14): ${snap.rsi14.toFixed(1)} | Stoch K: ${snap.stochK.toFixed(1)} D: ${snap.stochD.toFixed(1)}`);
    sections.push(`MACD: ${snap.macdHistogram > 0 ? "+" : ""}${snap.macdHistogram.toFixed(4)} (line: ${snap.macdLine.toFixed(4)})`);
    sections.push(`BB: $${snap.bbLower.toFixed(2)} / $${snap.bbMiddle.toFixed(2)} / $${snap.bbUpper.toFixed(2)} | BW: ${isFinite(snap.bbBandwidth) ? snap.bbBandwidth.toFixed(1) + "%" : "N/A"}`);
    sections.push(`ATR(14): $${snap.atr14.toFixed(2)} | ADX: ${isFinite(snap.adx) ? snap.adx.toFixed(1) : "N/A"} | +DI: ${isFinite(snap.plusDI) ? snap.plusDI.toFixed(1) : "N/A"} | -DI: ${isFinite(snap.minusDI) ? snap.minusDI.toFixed(1) : "N/A"}`);
    if (isFinite(snap.vwap) && snap.vwap > 0) {
      sections.push(`VWAP: $${snap.vwap.toFixed(2)} (price ${quote.price > snap.vwap ? "ABOVE" : "BELOW"})`);
    }
    sections.push(`Pivot: $${snap.pivots.pivot.toFixed(2)} | S1: $${snap.pivots.s1.toFixed(2)} S2: $${snap.pivots.s2.toFixed(2)} | R1: $${snap.pivots.r1.toFixed(2)} R2: $${snap.pivots.r2.toFixed(2)}`);

    // Market Structure
    const struct = snap.structure;
    sections.push(`STRUCTURE: ${struct.structure.toUpperCase()} (HH:${struct.higherHighs} HL:${struct.higherLows} LH:${struct.lowerHighs} LL:${struct.lowerLows})${struct.structureBreak ? ` ⚡ BREAK at $${struct.breakLevel.toFixed(2)}` : ""}`);
    if (struct.recentSwingHigh > 0) {
      sections.push(`Swing High: $${struct.recentSwingHigh.toFixed(2)} | Swing Low: $${struct.recentSwingLow.toFixed(2)}`);
    }

    // Fair Value Gaps (unfilled only — these are actionable)
    const unfilledFvgs = snap.fairValueGaps.filter(g => !g.filled).slice(-3);
    if (unfilledFvgs.length > 0) {
      const fvgStrs = unfilledFvgs.map(g => `${g.type} $${g.bottom.toFixed(2)}-$${g.top.toFixed(2)}`);
      sections.push(`FVGs (unfilled): ${fvgStrs.join(" | ")}`);
    }

    // Order Blocks (last 3)
    const recentOBs = snap.orderBlocks.slice(-3);
    if (recentOBs.length > 0) {
      const obStrs = recentOBs.map(ob => `${ob.type} $${ob.bottom.toFixed(2)}-$${ob.top.toFixed(2)}`);
      sections.push(`Order Blocks: ${obStrs.join(" | ")}`);
    }

    // Candlestick Patterns (recent)
    const recentPatterns = snap.candlePatterns.slice(-3);
    if (recentPatterns.length > 0) {
      sections.push(`Patterns: ${recentPatterns.map(p => p.type.replace(/_/g, " ")).join(", ")}`);
    }

    // Volume
    const vol = snap.volume;
    sections.push(`Volume: ${vol.volumeRatio.toFixed(1)}x avg${vol.isVolumeSpike ? " ⚡ SPIKE" : ""} | Trend: ${vol.volumeTrend} | OBV: ${vol.obvDirection}`);

    // Divergence
    if (snap.divergence) {
      sections.push(`⚡ ${snap.divergence.type.toUpperCase()} divergence (strength: ${snap.divergence.strength.toFixed(2)})`);
    }

    // Liquidity levels
    const liqLevels = snap.liquidityLevels.filter(l => !l.swept).slice(0, 3);
    if (liqLevels.length > 0) {
      const liqStrs = liqLevels.map(l => `${l.type.replace(/_/g, " ")} $${l.price.toFixed(2)}`);
      sections.push(`Liquidity: ${liqStrs.join(" | ")}`);
    }

    sections.push("");
  }

  // Recent 15m candles (last 10)
  const last10 = recentCandles.slice(-10);
  if (last10.length > 0) {
    sections.push("## Recent 15M Candles");
    for (const c of last10) {
      const time = new Date(c.timestamp).toISOString().slice(11, 16);
      const dir = c.close >= c.open ? "▲" : "▼";
      const body = Math.abs(c.close - c.open).toFixed(2);
      sections.push(`${time} ${dir} O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} body:${body}`);
    }
    sections.push("");
  }

  // Memory context
  if (memory) {
    sections.push("## Previous Analysis");
    sections.push(memory);
    sections.push("");
  }

  sections.push("Analyze ALL data above using Smart Money methodology. Output BUY or SELL with confidence as a single JSON object.");

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
