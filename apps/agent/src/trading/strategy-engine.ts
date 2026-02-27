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
 * The engine outputs BUY or SELL with a confidence score (HOLD only when
 * truly directionless). The user decides whether to act based on confidence.
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
  action: "BUY" | "SELL" | "HOLD";
  setup: string;
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

  return `You are an elite XAUUSD (Gold) trading analyst using Smart Money / ICT methodology. You receive multi-timeframe market data (4H, 1H, 15M) including structure, FVGs, Order Blocks, liquidity levels, volume, and indicators.

## YOUR JOB
Always output BUY or SELL with an honest confidence score. The confidence score tells the user whether to act — you don't need to protect them by refusing to trade. A 25% confidence BUY is fine — it tells the user "slight lean up but not much conviction."

Only output HOLD in truly directionless markets where you genuinely cannot determine even a slight lean (this should be rare — maybe 10-15% of the time).

## Confidence Scale — BE HONEST
- 75-90%: A+ setup — multi-TF alignment, key level, confirmation pattern, volume, during a kill zone
- 60-74%: Solid — 2+ TFs agree, at/near a key level, some confirmation
- 45-59%: Decent lean — direction seems right but setup isn't perfect. Include the trade.
- 25-44%: Weak lean — slight directional bias but market is unclear. Still output the direction.
- Below 25%: No directional bias at all → output HOLD

## Account Info
- Account: $${config.accountSize} | Position: ${config.lotSize} lots ($${dollarPerPoint}/point)
- Standard risk: ${config.riskPercent}% = $${maxRiskDollars} (SL ≤ $${maxSlDistance.toFixed(1)})
- Extended risk (confidence ≥ 70%): ${extRiskPercent}% = $${extMaxRisk.toFixed(0)} (SL ≤ $${extMaxSlDistance.toFixed(1)})

## TOP-DOWN ANALYSIS

### Step 1: 4H Bias (sets direction)
- Structure: HH+HL = bullish, LH+LL = bearish, mixed = neutral
- EMA: 20 > 50 = bullish, 20 < 50 = bearish. EMA200 for long-term trend.
- Trading WITH 4H = higher confidence. Against it = lower confidence (but still trade if other factors are strong).

### Step 2: 1H Key Levels
- Order Blocks, Fair Value Gaps (unfilled), liquidity levels (equal highs/lows), swing points

### Step 3: 15M Entry Timing
- Price near a key level from 1H + confirmation pattern (engulfing, pin bar, hammer) = boost confidence
- Volume spike = real move. Low volume at a level = reduce confidence.
- Kill Zones (London 07-10 UTC, NY 12-15 UTC) = boost confidence

## SETUP TYPES
1. **Liquidity Sweep + FVG**: Price sweeps stops, reverses into FVG/OB. Best setup.
2. **Order Block Rejection**: Price returns to OB, rejects with confirmation candle.
3. **Trend Pullback**: Clear trend, price pulls back to structure level, resumes.
4. **Displacement**: Strong directional move with volume across multiple candles.
5. **Range Bounce**: ADX < 20, price at range extreme with reversal pattern.

## PREMIUM / DISCOUNT ZONES
50% of 4H swing range: Discount = favor buys, Premium = favor sells.
Trading in the wrong zone = reduce confidence by 10-15%, don't automatically HOLD.

## AMD CYCLE
Asian = accumulation. London open = manipulation (fake sweep). London-NY = distribution (real move).
If London swept Asian high → favor SELL. Swept Asian low → favor BUY.

## STOP LOSS
- Place beyond nearest structure level (swing, OB edge, FVG boundary)
- Add $2-3 buffer (gold noise is ~$1-2)
- If structural SL would be too wide (> $${maxSlDistance.toFixed(0)}), use the max and reduce confidence

## TAKE PROFIT
- TP1: 1.0-1.5x risk. TP2: 2.0-3.0x risk (primary target). TP3: 3.0-5.0x risk.

## REASONING — SIMPLE LANGUAGE
1-2 SHORT sentences for a non-trader.
NEVER use jargon: RSI, MACD, EMA, ADX, Stochastic, Bollinger, divergence, confluence, FVG, OB, smart money.

## Output — STRICT JSON only (no markdown, no text)
{"action":"BUY","setup":"liquidity_sweep","confidence":72,"entry":2900.50,"stopLoss":2894.00,"takeProfit1":2907.00,"takeProfit2":2913.00,"takeProfit3":2920.00,"riskDollars":13.00,"riskPercent":1.3,"rewardDollars":25.00,"riskReward":1.92,"reasoning":"Gold dipped below a key level to grab stops, then bounced back strongly. Good spot to ride it higher.","regime":"TRENDING"}`;
}

// ─── Prompt Builder ──────────────────────────────────────────────

function buildAnalysisPrompt(
  snapshots: MultiTfSnapshots,
  recentCandles: Candle[],
  quote: MarketSnapshot,
  memory: string,
  signalHistory?: string
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

    // Candlestick Patterns (recent) — with directional signal
    const recentPatterns = snap.candlePatterns.slice(-3);
    if (recentPatterns.length > 0) {
      const patternStrs = recentPatterns.map(p => {
        const name = p.type.replace(/_/g, " ");
        const signal = p.type.includes("bullish") || p.type === "hammer" || p.type === "pin_bar_bull"
          ? "↑" : p.type.includes("bearish") || p.type === "shooting_star" || p.type === "pin_bar_bear"
          ? "↓" : "—";
        return `${name} ${signal}`;
      });
      sections.push(`Patterns: ${patternStrs.join(", ")}`);
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

  // ─── Cross-Timeframe Confluence Summary ─────────────────────
  {
    const tfData = [
      { label: "4H", snap: snapshots.tf4h },
      { label: "1H", snap: snapshots.tf1h },
      { label: "15M", snap: snapshots.tf15m },
    ];

    // Structure agreement
    const structures = tfData.map(t => t.snap.structure.structure);
    const allBullish = structures.every(s => s === "bullish");
    const allBearish = structures.every(s => s === "bearish");
    const structureLine = tfData.map(t =>
      `${t.label}:${t.snap.structure.structure.toUpperCase()}`
    ).join(" | ");

    if (allBullish) {
      sections.push(`## ⚡ CROSS-TF CONFLUENCE: ALL BULLISH`);
      sections.push(`Structure: ${structureLine} — strong alignment for BUY setups`);
    } else if (allBearish) {
      sections.push(`## ⚡ CROSS-TF CONFLUENCE: ALL BEARISH`);
      sections.push(`Structure: ${structureLine} — strong alignment for SELL setups`);
    } else {
      sections.push(`## Cross-TF Structure`);
      sections.push(`Structure: ${structureLine}`);
    }

    // Regime agreement
    const regimes = tfData.map(t => t.snap.regime);
    const regimeLine = tfData.map(t => `${t.label}:${t.snap.regime}`).join(" | ");
    sections.push(`Regime: ${regimeLine}`);

    // EMA alignment (are all EMA20 > EMA50 or all EMA20 < EMA50?)
    const emaBullish = tfData.every(t => t.snap.ema20 > t.snap.ema50);
    const emaBearish = tfData.every(t => t.snap.ema20 < t.snap.ema50);
    if (emaBullish) {
      sections.push(`EMA alignment: ALL bullish (EMA20 > EMA50 on every TF) — trend confirmation for BUYS`);
    } else if (emaBearish) {
      sections.push(`EMA alignment: ALL bearish (EMA20 < EMA50 on every TF) — trend confirmation for SELLS`);
    }

    // Structure breaks across timeframes (high significance when multi-TF)
    const breaks = tfData.filter(t => t.snap.structure.structureBreak);
    if (breaks.length >= 2) {
      sections.push(`⚡ MULTI-TF STRUCTURE BREAK: ${breaks.map(t => `${t.label} at $${t.snap.structure.breakLevel.toFixed(2)}`).join(" + ")} — HIGH SIGNIFICANCE, likely trend shift`);
    } else if (breaks.length === 1) {
      sections.push(`Structure break: ${breaks[0].label} at $${breaks[0].snap.structure.breakLevel.toFixed(2)}`);
    }

    // Divergence across timeframes
    const divs = tfData.filter(t => t.snap.divergence !== null);
    if (divs.length >= 2) {
      const divTypes = divs.map(t => `${t.label}:${t.snap.divergence!.type}`);
      sections.push(`⚡ MULTI-TF DIVERGENCE: ${divTypes.join(" + ")} — strong reversal signal`);
    }

    // Volume confirmation
    const spikes = tfData.filter(t => t.snap.volume.isVolumeSpike);
    if (spikes.length > 0) {
      sections.push(`Volume spikes: ${spikes.map(t => `${t.label} (${t.snap.volume.volumeRatio.toFixed(1)}x avg)`).join(", ")}`);
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

  // Signal history + performance (from TradeTracker)
  if (signalHistory) {
    sections.push(signalHistory);
    sections.push("");
  }

  // Memory context (heartbeat summaries)
  if (memory) {
    sections.push("## Previous Analysis");
    sections.push(memory);
    sections.push("");
  }

  sections.push("Analyze ALL data above using Smart Money methodology. Output BUY or SELL with an honest confidence score (use confidence to express uncertainty, not HOLD). Only output HOLD if the market is truly directionless with no lean at all. Consider your signal history for consistency — only reverse direction if structural evidence supports it. Output a single JSON object.");

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
    memory: string = "",
    signalHistory?: string
  ): Promise<{ decision: StrategyDecision; tokensIn: number; tokensOut: number; cost: number }> {
    const prompt = buildAnalysisPrompt(snapshots, recentCandles, quote, memory, signalHistory);

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

      // Support HOLD action
      let action: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (parsed.action === "BUY") action = "BUY";
      else if (parsed.action === "SELL") action = "SELL";

      return {
        action,
        setup: parsed.setup || "none",
        confidence: Math.max(0, Number(parsed.confidence) || 0),
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
      // If JSON parsing fails, return HOLD
      return {
        action: "HOLD",
        setup: "none",
        confidence: 0,
        entry: 0, stopLoss: 0,
        takeProfit1: 0, takeProfit2: 0, takeProfit3: 0,
        riskDollars: 0, riskPercent: 0, rewardDollars: 0, riskReward: 0,
        reasoning: `Could not analyze the market right now. Waiting for the next check.`,
        regime: "UNKNOWN",
      };
    }
  }

  /**
   * Recalculate actual risk numbers and enforce quality gates.
   * Downgrades bad trades to HOLD rather than sending garbage.
   */
  private validateRisk(decision: StrategyDecision): void {
    if (decision.action === "HOLD") return;

    const { dollarPerPoint, maxSlDistance } = calculateRiskParams(this.config);
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

    // ─── Quality Gates: Only block truly broken trades ───

    // Gate 1: SL too close (< $2) — will get clipped by spread + noise
    if (slDistance < 2) {
      console.log(`[Strategy] HOLD: SL too close ($${slDistance.toFixed(2)} < $2 minimum)`);
      decision.action = "HOLD";
      decision.reasoning = "Setup looked interesting but the stop loss is too tight — would get clipped by normal price noise. Waiting for a better entry.";
      return;
    }

    // Gate 2: SL too wide — exceeds account risk limit (with generous buffer)
    if (slDistance > maxSlDistance * 2) {
      console.log(`[Strategy] HOLD: SL too wide ($${slDistance.toFixed(2)} > $${(maxSlDistance * 2).toFixed(2)} max)`);
      decision.action = "HOLD";
      decision.reasoning = "Setup requires too wide a stop loss for the account size. Waiting for a tighter entry.";
      return;
    }

    // Gate 3: R:R too low (< 1.0) — at least break even potential
    if (decision.riskReward < 1.0) {
      console.log(`[Strategy] HOLD: R:R too low (${decision.riskReward.toFixed(2)} < 1.0 minimum)`);
      decision.action = "HOLD";
      decision.reasoning = "The risk-to-reward ratio isn't good enough — the potential gain doesn't justify the risk. Waiting for a better setup.";
      return;
    }

    // Gate 4: SL on wrong side of entry
    if (decision.action === "BUY" && decision.stopLoss >= decision.entry) {
      console.log(`[Strategy] HOLD: BUY but SL ($${decision.stopLoss}) >= entry ($${decision.entry})`);
      decision.action = "HOLD";
      decision.reasoning = "Analysis produced invalid levels. Waiting for the next check.";
      return;
    }
    if (decision.action === "SELL" && decision.stopLoss <= decision.entry) {
      console.log(`[Strategy] HOLD: SELL but SL ($${decision.stopLoss}) <= entry ($${decision.entry})`);
      decision.action = "HOLD";
      decision.reasoning = "Analysis produced invalid levels. Waiting for the next check.";
      return;
    }
  }
}
