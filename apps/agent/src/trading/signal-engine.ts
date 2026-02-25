/**
 * XAUUSD Trading Signal Engine.
 *
 * Combines multiple technical indicators to generate BUY/SELL/HOLD signals
 * with entry, stop-loss, and take-profit levels.
 *
 * Strategy: Multi-indicator confluence approach
 *   - Trend: EMA 20/50 crossover + MACD direction
 *   - Momentum: RSI extremes + Stochastic crossover
 *   - Volatility: Bollinger Band squeeze/breakout + ATR for SL/TP
 *   - Support/Resistance: Pivot points for target levels
 *
 * A signal fires only when >= 3 indicators agree (confluence).
 */

import type { Candle, CandleData, MarketSnapshot } from "./market-data.js";
import {
  ema, rsi, macd, bollingerBands, atr,
  stochastic, pivotPoints, vwap,
  type MACDResult, type BollingerBands, type StochasticResult, type PivotLevels,
} from "./indicators.js";

// ─── Types ───────────────────────────────────────────────────────

export type SignalDirection = "BUY" | "SELL" | "HOLD";
export type SignalStrength = "STRONG" | "MODERATE" | "WEAK";
export type SignalTimeframe = "SCALP" | "INTRADAY" | "SWING";

export interface TradingSignal {
  direction: SignalDirection;
  strength: SignalStrength;
  timeframe: SignalTimeframe;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  riskRewardRatio: number;
  confidence: number;        // 0-100
  confluenceCount: number;   // how many indicators agree
  reasons: string[];         // human-readable reasons
  indicators: IndicatorSnapshot;
  timestamp: number;
}

export interface IndicatorSnapshot {
  price: number;
  ema20: number;
  ema50: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  atr14: number;
  stochK: number;
  stochD: number;
  pivots: PivotLevels;
}

// ─── Signal Engine ───────────────────────────────────────────────

export class SignalEngine {
  /**
   * Analyze candle data and generate a trading signal.
   */
  analyze(candleData: CandleData, quote?: MarketSnapshot): TradingSignal {
    const { candles } = candleData;
    const closes = candles.map((c) => c.close);
    const currentPrice = quote?.price || closes[closes.length - 1];

    // Calculate all indicators
    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const rsi14 = rsi(closes, 14);
    const macdResult = macd(closes);
    const bb = bollingerBands(closes);
    const atr14 = atr(candles);
    const stoch = stochastic(candles);
    const pivots = pivotPoints(candles);

    const last = closes.length - 1;

    const snapshot: IndicatorSnapshot = {
      price: currentPrice,
      ema20: ema20[last],
      ema50: ema50[last],
      rsi14: rsi14[last],
      macdLine: macdResult.macd[last],
      macdSignal: macdResult.signal[last],
      macdHistogram: macdResult.histogram[last],
      bbUpper: bb.upper[last],
      bbMiddle: bb.middle[last],
      bbLower: bb.lower[last],
      atr14: atr14[last],
      stochK: stoch.k[last],
      stochD: stoch.d[last],
      pivots,
    };

    // ─── Score each indicator ───────────────────────────────

    let bullScore = 0;
    let bearScore = 0;
    const reasons: string[] = [];

    // 1. EMA crossover (trend)
    if (ema20[last] > ema50[last]) {
      bullScore++;
      if (ema20[last - 1] <= ema50[last - 1]) {
        bullScore++; // fresh crossover = extra point
        reasons.push("EMA 20/50 bullish crossover (fresh)");
      } else {
        reasons.push("EMA 20 above EMA 50 (uptrend)");
      }
    } else if (ema20[last] < ema50[last]) {
      bearScore++;
      if (ema20[last - 1] >= ema50[last - 1]) {
        bearScore++;
        reasons.push("EMA 20/50 bearish crossover (fresh)");
      } else {
        reasons.push("EMA 20 below EMA 50 (downtrend)");
      }
    }

    // 2. Price vs EMA (trend confirmation)
    if (currentPrice > ema20[last] && currentPrice > ema50[last]) {
      bullScore++;
      reasons.push("Price above both EMAs");
    } else if (currentPrice < ema20[last] && currentPrice < ema50[last]) {
      bearScore++;
      reasons.push("Price below both EMAs");
    }

    // 3. RSI
    const rsiVal = rsi14[last];
    if (!isNaN(rsiVal)) {
      if (rsiVal < 30) {
        bullScore += 2;
        reasons.push(`RSI oversold (${rsiVal.toFixed(1)})`);
      } else if (rsiVal < 40) {
        bullScore++;
        reasons.push(`RSI approaching oversold (${rsiVal.toFixed(1)})`);
      } else if (rsiVal > 70) {
        bearScore += 2;
        reasons.push(`RSI overbought (${rsiVal.toFixed(1)})`);
      } else if (rsiVal > 60) {
        bearScore++;
        reasons.push(`RSI approaching overbought (${rsiVal.toFixed(1)})`);
      }
    }

    // 4. MACD
    const macdHist = macdResult.histogram[last];
    const macdHistPrev = macdResult.histogram[last - 1];
    if (macdHist > 0) {
      bullScore++;
      if (macdHistPrev <= 0) {
        bullScore++;
        reasons.push("MACD histogram turned positive (bullish momentum)");
      } else {
        reasons.push("MACD histogram positive");
      }
    } else if (macdHist < 0) {
      bearScore++;
      if (macdHistPrev >= 0) {
        bearScore++;
        reasons.push("MACD histogram turned negative (bearish momentum)");
      } else {
        reasons.push("MACD histogram negative");
      }
    }

    // 5. Bollinger Bands
    if (currentPrice <= bb.lower[last] && !isNaN(bb.lower[last])) {
      bullScore += 2;
      reasons.push("Price at lower Bollinger Band (potential bounce)");
    } else if (currentPrice >= bb.upper[last] && !isNaN(bb.upper[last])) {
      bearScore += 2;
      reasons.push("Price at upper Bollinger Band (potential rejection)");
    }

    // 6. Stochastic
    const stochKVal = stoch.k[last];
    const stochDVal = stoch.d[last];
    if (!isNaN(stochKVal) && !isNaN(stochDVal)) {
      if (stochKVal < 20 && stochKVal > stochDVal) {
        bullScore++;
        reasons.push(`Stochastic bullish crossover in oversold zone (K: ${stochKVal.toFixed(1)})`);
      } else if (stochKVal > 80 && stochKVal < stochDVal) {
        bearScore++;
        reasons.push(`Stochastic bearish crossover in overbought zone (K: ${stochKVal.toFixed(1)})`);
      }
    }

    // 7. Pivot point proximity
    const distToS1 = Math.abs(currentPrice - pivots.s1);
    const distToR1 = Math.abs(currentPrice - pivots.r1);
    // Use ATR value, fallback to 0.15% of price (not a hardcoded dollar amount)
    const atrVal = atr14[last] || currentPrice * 0.0015;

    if (distToS1 < atrVal * 0.5 && currentPrice >= pivots.s1) {
      bullScore++;
      reasons.push(`Price near S1 support ($${pivots.s1.toFixed(2)})`);
    }
    if (distToR1 < atrVal * 0.5 && currentPrice <= pivots.r1) {
      bearScore++;
      reasons.push(`Price near R1 resistance ($${pivots.r1.toFixed(2)})`);
    }

    // ─── Determine signal ───────────────────────────────────

    const totalSignals = bullScore + bearScore;
    const confluenceThreshold = 3;
    let direction: SignalDirection = "HOLD";
    let confluenceCount = 0;

    if (bullScore >= confluenceThreshold && bullScore > bearScore) {
      direction = "BUY";
      confluenceCount = bullScore;
    } else if (bearScore >= confluenceThreshold && bearScore > bullScore) {
      direction = "SELL";
      confluenceCount = bearScore;
    } else {
      confluenceCount = Math.max(bullScore, bearScore);
      reasons.push("Insufficient confluence -- no clear signal");
    }

    // ─── Calculate levels ───────────────────────────────────

    // Fallback to 0.15% of price if ATR failed (not a fixed dollar value)
    const effectiveAtr = isNaN(atrVal) || atrVal <= 0 ? currentPrice * 0.0015 : atrVal;

    let entry = currentPrice;
    let stopLoss: number;
    let tp1: number, tp2: number, tp3: number;

    if (direction === "BUY") {
      stopLoss = entry - effectiveAtr * 1.5;
      tp1 = entry + effectiveAtr * 1.0;
      tp2 = entry + effectiveAtr * 2.0;
      tp3 = entry + effectiveAtr * 3.0;

      // Align TPs with resistance levels if nearby
      if (Math.abs(pivots.r1 - tp1) < effectiveAtr) tp1 = pivots.r1;
      if (Math.abs(pivots.r2 - tp2) < effectiveAtr) tp2 = pivots.r2;
    } else if (direction === "SELL") {
      stopLoss = entry + effectiveAtr * 1.5;
      tp1 = entry - effectiveAtr * 1.0;
      tp2 = entry - effectiveAtr * 2.0;
      tp3 = entry - effectiveAtr * 3.0;

      // Align TPs with support levels if nearby
      if (Math.abs(pivots.s1 - tp1) < effectiveAtr) tp1 = pivots.s1;
      if (Math.abs(pivots.s2 - tp2) < effectiveAtr) tp2 = pivots.s2;
    } else {
      stopLoss = entry - effectiveAtr * 1.5;
      tp1 = entry + effectiveAtr * 1.0;
      tp2 = entry + effectiveAtr * 2.0;
      tp3 = entry + effectiveAtr * 3.0;
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(tp2 - entry);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;

    // ─── Confidence scoring ─────────────────────────────────

    let confidence = 0;
    if (direction !== "HOLD") {
      confidence = Math.min(100, confluenceCount * 15 + (riskRewardRatio > 1.5 ? 15 : 0));
    }

    // ─── Strength ───────────────────────────────────────────

    let strength: SignalStrength = "WEAK";
    if (confluenceCount >= 6) strength = "STRONG";
    else if (confluenceCount >= 4) strength = "MODERATE";

    // ─── Timeframe suggestion ───────────────────────────────

    let timeframe: SignalTimeframe = "INTRADAY";
    const tfMap: Record<string, SignalTimeframe> = {
      "1min": "SCALP", "5min": "SCALP",
      "15min": "INTRADAY", "1h": "INTRADAY",
      "4h": "SWING", "1day": "SWING",
    };
    timeframe = tfMap[candleData.timeframe] || "INTRADAY";

    return {
      direction,
      strength,
      timeframe,
      entry: round(entry),
      stopLoss: round(stopLoss),
      takeProfit1: round(tp1),
      takeProfit2: round(tp2),
      takeProfit3: round(tp3),
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
      confidence,
      confluenceCount,
      reasons,
      indicators: snapshot,
      timestamp: Date.now(),
    };
  }

  /**
   * Format a signal as a WhatsApp-friendly message.
   */
  formatSignalMessage(signal: TradingSignal): string {
    const dirEmoji =
      signal.direction === "BUY" ? "🟢" :
      signal.direction === "SELL" ? "🔴" : "⚪";

    const strengthStars =
      signal.strength === "STRONG" ? "⭐⭐⭐" :
      signal.strength === "MODERATE" ? "⭐⭐" : "⭐";

    if (signal.direction === "HOLD") {
      return [
        `⚪ *XAUUSD -- NO SIGNAL*`,
        ``,
        `Price: $${signal.entry.toFixed(2)}`,
        `RSI: ${signal.indicators.rsi14?.toFixed(1) || "N/A"}`,
        `MACD: ${signal.indicators.macdHistogram > 0 ? "Bullish" : "Bearish"}`,
        `Trend: EMA20 ${signal.indicators.ema20 > signal.indicators.ema50 ? ">" : "<"} EMA50`,
        ``,
        `_Waiting for confluence..._`,
        `_${signal.reasons[signal.reasons.length - 1] || "Mixed signals"}_`,
      ].join("\n");
    }

    const lines = [
      `${dirEmoji} *XAUUSD ${signal.direction} SIGNAL* ${dirEmoji}`,
      `Strength: ${signal.strength} ${strengthStars}`,
      `Confidence: ${signal.confidence}%`,
      `Timeframe: ${signal.timeframe}`,
      ``,
      `📍 *Entry:* $${signal.entry.toFixed(2)}`,
      `🛑 *Stop Loss:* $${signal.stopLoss.toFixed(2)}`,
      `🎯 *TP1:* $${signal.takeProfit1.toFixed(2)}`,
      `🎯 *TP2:* $${signal.takeProfit2.toFixed(2)}`,
      `🎯 *TP3:* $${signal.takeProfit3.toFixed(2)}`,
      `📊 *R:R Ratio:* ${signal.riskRewardRatio.toFixed(2)}`,
      ``,
      `📈 *Technical Analysis:*`,
    ];

    for (const reason of signal.reasons) {
      lines.push(`  • ${reason}`);
    }

    lines.push(``);
    lines.push(`📉 *Indicators:*`);
    lines.push(`  RSI(14): ${signal.indicators.rsi14?.toFixed(1) || "N/A"}`);
    lines.push(`  MACD Hist: ${signal.indicators.macdHistogram?.toFixed(4) || "N/A"}`);
    lines.push(`  ATR(14): ${signal.indicators.atr14?.toFixed(2) || "N/A"}`);
    lines.push(`  BB: ${signal.indicators.bbLower?.toFixed(2)} / ${signal.indicators.bbMiddle?.toFixed(2)} / ${signal.indicators.bbUpper?.toFixed(2)}`);
    lines.push(``);
    lines.push(`⚠️ _Risk management: Never risk more than 1-2% of your account per trade._`);
    lines.push(`⏰ ${new Date(signal.timestamp).toUTCString()}`);

    return lines.join("\n");
  }
}

function round(n: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
