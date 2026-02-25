/**
 * XAUUSD Trading Signal Engine v2.
 *
 * Upgrades over v1:
 *   - ADX-based regime detection (TRENDING / RANGING / BREAKOUT)
 *   - Regime-adjusted indicator weights (EMAs matter in trends, RSI in ranges)
 *   - Distance-based weighted scoring (not binary +1/+2)
 *   - EMA 200 as universal trend filter
 *   - VWAP as intraday bias (was calculated but unused)
 *   - BB bandwidth for volatility context (was calculated but unused)
 *   - RSI divergence detection (strongest reversal signal)
 *   - Quality gate: minimum weighted score to fire a signal
 *
 * Strategy: Multi-indicator confluence with regime awareness
 *   - Trend: EMA 20/50 crossover + EMA 200 filter + MACD direction
 *   - Momentum: RSI extremes + Stochastic crossover + RSI divergence
 *   - Volatility: BB squeeze/breakout + ATR for SL/TP + BB bandwidth
 *   - Volume: VWAP bias (intraday only)
 *   - Support/Resistance: Pivot points for target levels
 *
 * A signal fires only when >= 3 indicators agree AND weighted score >= 2.5.
 */

import type { Candle, CandleData, MarketSnapshot } from "./market-data.js";
import {
  ema, rsi, macd, bollingerBands, atr,
  stochastic, pivotPoints, vwap, adx, detectDivergence,
  type MACDResult, type BollingerBands, type StochasticResult, type PivotLevels,
  type ADXResult, type Divergence,
} from "./indicators.js";

// ─── Types ───────────────────────────────────────────────────────

export type SignalDirection = "BUY" | "SELL" | "HOLD";
export type SignalStrength = "STRONG" | "MODERATE" | "WEAK";
export type SignalTimeframe = "SCALP" | "INTRADAY" | "SWING";
export type MarketRegime = "TRENDING" | "RANGING" | "BREAKOUT";

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
  // v2 additions
  adx: number;
  plusDI: number;
  minusDI: number;
  ema200: number;
  vwap: number;
  bbBandwidth: number;
  regime: MarketRegime;
  divergence: Divergence | null;
}

// ─── Regime weight multipliers ──────────────────────────────────

const REGIME_WEIGHTS: Record<MarketRegime, Record<string, number>> = {
  TRENDING: {
    emaCrossover: 2.0,
    priceVsEma: 1.5,
    rsi: 0.5,
    macd: 1.5,
    bbTouch: 0.5,
    stochastic: 0.5,
    pivotProximity: 1.0,
    ema200: 1.0,
    vwap: 0.8,
    divergence: 1.0,
  },
  RANGING: {
    emaCrossover: 0.3,
    priceVsEma: 0.5,
    rsi: 2.0,
    macd: 0.5,
    bbTouch: 2.0,
    stochastic: 1.5,
    pivotProximity: 1.5,
    ema200: 1.0,
    vwap: 1.0,
    divergence: 1.5,
  },
  BREAKOUT: {
    emaCrossover: 1.0,
    priceVsEma: 1.0,
    rsi: 1.0,
    macd: 1.5,
    bbTouch: 2.0,
    stochastic: 0.5,
    pivotProximity: 1.0,
    ema200: 1.0,
    vwap: 1.0,
    divergence: 0.5,
  },
};

// ─── Signal Engine ───────────────────────────────────────────────

export class SignalEngine {
  /**
   * Compute all indicators and return the snapshot + candles.
   * Used by the strategy engine as a data preparation layer.
   */
  computeSnapshot(candleData: CandleData, quote?: MarketSnapshot): {
    snapshot: IndicatorSnapshot;
    candles: Candle[];
  } {
    const { candles } = candleData;
    const closes = candles.map((c) => c.close);
    const currentPrice = quote?.price || closes[closes.length - 1];
    const last = closes.length - 1;

    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const ema200Arr = closes.length >= 200 ? ema(closes, 200) : [];
    const rsi14 = rsi(closes, 14);
    const macdResult = macd(closes);
    const bb = bollingerBands(closes);
    const atr14 = atr(candles);
    const stoch = stochastic(candles);
    const pivots = pivotPoints(candles);
    const adxResult = adx(candles);
    const vwapArr = vwap(candles);
    const divergenceResult = detectDivergence(closes, rsi14, 20);

    const regime = detectRegime(adxResult, bb, last);

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
      adx: adxResult.adx[last] ?? NaN,
      plusDI: adxResult.plusDI[last] ?? NaN,
      minusDI: adxResult.minusDI[last] ?? NaN,
      ema200: ema200Arr.length > 0 ? ema200Arr[last] : NaN,
      vwap: vwapArr[last] ?? NaN,
      bbBandwidth: bb.bandwidth[last] ?? NaN,
      regime,
      divergence: divergenceResult,
    };

    return { snapshot, candles };
  }

  /**
   * Analyze candle data and generate a trading signal (hardcoded fallback).
   */
  analyze(candleData: CandleData, quote?: MarketSnapshot): TradingSignal {
    const { candles } = candleData;
    const closes = candles.map((c) => c.close);
    const currentPrice = quote?.price || closes[closes.length - 1];
    const last = closes.length - 1;

    // ─── Calculate all indicators ───────────────────────────

    const ema20 = ema(closes, 20);
    const ema50 = ema(closes, 50);
    const ema200Arr = closes.length >= 200 ? ema(closes, 200) : [];
    const rsi14 = rsi(closes, 14);
    const macdResult = macd(closes);
    const bb = bollingerBands(closes);
    const atr14 = atr(candles);
    const stoch = stochastic(candles);
    const pivots = pivotPoints(candles);
    const adxResult = adx(candles);
    const vwapArr = vwap(candles);
    const divergenceResult = detectDivergence(closes, rsi14, 20);

    const ema200Val = ema200Arr.length > 0 ? ema200Arr[last] : NaN;
    const vwapVal = vwapArr[last] ?? NaN;
    const adxVal = adxResult.adx[last] ?? NaN;
    const plusDIVal = adxResult.plusDI[last] ?? NaN;
    const minusDIVal = adxResult.minusDI[last] ?? NaN;
    const bbBandwidthVal = bb.bandwidth[last] ?? NaN;

    // ─── Regime detection ───────────────────────────────────

    const regime = detectRegime(adxResult, bb, last);

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
      adx: adxVal,
      plusDI: plusDIVal,
      minusDI: minusDIVal,
      ema200: ema200Val,
      vwap: vwapVal,
      bbBandwidth: bbBandwidthVal,
      regime,
      divergence: divergenceResult,
    };

    // ─── Weighted scoring ───────────────────────────────────

    const weights = REGIME_WEIGHTS[regime];
    let bullScore = 0;
    let bearScore = 0;
    let rawBullCount = 0;
    let rawBearCount = 0;
    const reasons: string[] = [];

    // Effective ATR (used throughout)
    const effectiveAtr = isFinite(atr14[last]) && atr14[last] > 0
      ? atr14[last] : currentPrice * 0.0015;

    // 1. EMA 20/50 crossover — distance-weighted
    const ema20Last = ema20[last];
    const ema50Last = ema50[last];
    const ema20Prev = ema20[last - 1];
    const ema50Prev = ema50[last - 1];

    if (isFinite(ema20Last) && isFinite(ema50Last)) {
      const emaDistance = Math.abs(ema20Last - ema50Last);
      const emaWeight = Math.min(1.0, emaDistance / (effectiveAtr * 3));
      const isFreshCross = isFinite(ema20Prev) && isFinite(ema50Prev);

      if (ema20Last > ema50Last) {
        const bonus = (isFreshCross && ema20Prev <= ema50Prev) ? 0.5 : 0;
        bullScore += (emaWeight + bonus) * weights.emaCrossover;
        rawBullCount++;
        reasons.push(bonus > 0
          ? "EMA 20/50 bullish crossover (fresh)"
          : `EMA 20 above EMA 50 (spread: $${emaDistance.toFixed(2)})`);
      } else if (ema20Last < ema50Last) {
        const bonus = (isFreshCross && ema20Prev >= ema50Prev) ? 0.5 : 0;
        bearScore += (emaWeight + bonus) * weights.emaCrossover;
        rawBearCount++;
        reasons.push(bonus > 0
          ? "EMA 20/50 bearish crossover (fresh)"
          : `EMA 20 below EMA 50 (spread: $${emaDistance.toFixed(2)})`);
      }
    }

    // 2. Price vs both EMAs — distance-weighted
    if (isFinite(ema20Last) && isFinite(ema50Last)) {
      if (currentPrice > ema20Last && currentPrice > ema50Last) {
        const dist = Math.min(currentPrice - ema20Last, currentPrice - ema50Last);
        const w = Math.min(1.0, dist / (effectiveAtr * 2));
        bullScore += w * weights.priceVsEma;
        rawBullCount++;
        reasons.push("Price above both EMAs");
      } else if (currentPrice < ema20Last && currentPrice < ema50Last) {
        const dist = Math.min(ema20Last - currentPrice, ema50Last - currentPrice);
        const w = Math.min(1.0, dist / (effectiveAtr * 2));
        bearScore += w * weights.priceVsEma;
        rawBearCount++;
        reasons.push("Price below both EMAs");
      }
    }

    // 3. RSI — depth-weighted
    const rsiVal = rsi14[last];
    if (!isNaN(rsiVal)) {
      if (rsiVal < 30) {
        const w = (30 - rsiVal) / 30;
        bullScore += w * weights.rsi;
        rawBullCount++;
        reasons.push(`RSI oversold (${rsiVal.toFixed(1)})`);
      } else if (rsiVal < 40) {
        const w = ((40 - rsiVal) / 40) * 0.5;
        bullScore += w * weights.rsi;
        rawBullCount++;
        reasons.push(`RSI approaching oversold (${rsiVal.toFixed(1)})`);
      } else if (rsiVal > 70) {
        const w = (rsiVal - 70) / 30;
        bearScore += w * weights.rsi;
        rawBearCount++;
        reasons.push(`RSI overbought (${rsiVal.toFixed(1)})`);
      } else if (rsiVal > 60) {
        const w = ((rsiVal - 60) / 40) * 0.5;
        bearScore += w * weights.rsi;
        rawBearCount++;
        reasons.push(`RSI approaching overbought (${rsiVal.toFixed(1)})`);
      }
    }

    // 4. MACD histogram — magnitude-weighted
    const macdHist = macdResult.histogram[last];
    const macdSig = macdResult.signal[last];
    const macdHistPrev = macdResult.histogram[last - 1];
    if (isFinite(macdHist)) {
      const macdMag = isFinite(macdSig) && Math.abs(macdSig) > 0
        ? Math.min(1.0, Math.abs(macdHist) / Math.abs(macdSig) * 2)
        : Math.min(1.0, Math.abs(macdHist) / (effectiveAtr * 0.1));

      if (macdHist > 0) {
        const bonus = (isFinite(macdHistPrev) && macdHistPrev <= 0) ? 0.3 : 0;
        bullScore += (macdMag + bonus) * weights.macd;
        rawBullCount++;
        reasons.push(bonus > 0
          ? "MACD histogram turned positive (bullish momentum)"
          : "MACD histogram positive");
      } else if (macdHist < 0) {
        const bonus = (isFinite(macdHistPrev) && macdHistPrev >= 0) ? 0.3 : 0;
        bearScore += (macdMag + bonus) * weights.macd;
        rawBearCount++;
        reasons.push(bonus > 0
          ? "MACD histogram turned negative (bearish momentum)"
          : "MACD histogram negative");
      }
    }

    // 5. Bollinger Bands — distance-weighted
    if (!isNaN(bb.lower[last]) && !isNaN(bb.upper[last])) {
      const distFromLower = (currentPrice - bb.lower[last]) / effectiveAtr;
      const distFromUpper = (bb.upper[last] - currentPrice) / effectiveAtr;

      if (distFromLower <= 0) {
        // At or below lower band
        bullScore += 1.0 * weights.bbTouch;
        rawBullCount++;
        reasons.push("Price at lower Bollinger Band (potential bounce)");
      } else if (distFromLower < 1) {
        const w = 1.0 - distFromLower;
        bullScore += w * weights.bbTouch;
        rawBullCount++;
        reasons.push(`Price near lower BB ($${bb.lower[last].toFixed(2)})`);
      }

      if (distFromUpper <= 0) {
        // At or above upper band
        bearScore += 1.0 * weights.bbTouch;
        rawBearCount++;
        reasons.push("Price at upper Bollinger Band (potential rejection)");
      } else if (distFromUpper < 1) {
        const w = 1.0 - distFromUpper;
        bearScore += w * weights.bbTouch;
        rawBearCount++;
        reasons.push(`Price near upper BB ($${bb.upper[last].toFixed(2)})`);
      }
    }

    // 6. Stochastic — depth-weighted
    const stochKVal = stoch.k[last];
    const stochDVal = stoch.d[last];
    if (!isNaN(stochKVal) && !isNaN(stochDVal)) {
      if (stochKVal < 20 && stochKVal > stochDVal) {
        const w = Math.max(0, (20 - stochKVal) / 20);
        bullScore += w * weights.stochastic;
        rawBullCount++;
        reasons.push(`Stochastic bullish crossover in oversold zone (K: ${stochKVal.toFixed(1)})`);
      } else if (stochKVal > 80 && stochKVal < stochDVal) {
        const w = Math.max(0, (stochKVal - 80) / 20);
        bearScore += w * weights.stochastic;
        rawBearCount++;
        reasons.push(`Stochastic bearish crossover in overbought zone (K: ${stochKVal.toFixed(1)})`);
      }
    }

    // 7. Pivot point proximity
    const distToS1 = Math.abs(currentPrice - pivots.s1);
    const distToR1 = Math.abs(currentPrice - pivots.r1);

    if (distToS1 < effectiveAtr * 0.5 && currentPrice >= pivots.s1) {
      const w = 1.0 - (distToS1 / (effectiveAtr * 0.5));
      bullScore += w * weights.pivotProximity;
      rawBullCount++;
      reasons.push(`Price near S1 support ($${pivots.s1.toFixed(2)})`);
    }
    if (distToR1 < effectiveAtr * 0.5 && currentPrice <= pivots.r1) {
      const w = 1.0 - (distToR1 / (effectiveAtr * 0.5));
      bearScore += w * weights.pivotProximity;
      rawBearCount++;
      reasons.push(`Price near R1 resistance ($${pivots.r1.toFixed(2)})`);
    }

    // 8. EMA 200 — trend filter
    if (isFinite(ema200Val)) {
      if (currentPrice > ema200Val) {
        bullScore += 1.0 * weights.ema200;
        rawBullCount++;
        reasons.push(`Price above EMA 200 ($${ema200Val.toFixed(2)})`);
      } else if (currentPrice < ema200Val) {
        bearScore += 1.0 * weights.ema200;
        rawBearCount++;
        reasons.push(`Price below EMA 200 ($${ema200Val.toFixed(2)})`);
      }
    }

    // 9. VWAP — intraday bias (only meaningful on sub-4h timeframes)
    const isIntraday = ["1min", "5min", "15min", "1h"].includes(candleData.timeframe);
    if (isIntraday && isFinite(vwapVal) && vwapVal > 0) {
      if (currentPrice > vwapVal) {
        bullScore += 0.5 * weights.vwap;
        rawBullCount++;
        reasons.push(`Price above VWAP ($${vwapVal.toFixed(2)})`);
      } else if (currentPrice < vwapVal) {
        bearScore += 0.5 * weights.vwap;
        rawBearCount++;
        reasons.push(`Price below VWAP ($${vwapVal.toFixed(2)})`);
      }
    }

    // 10. RSI Divergence — high-value reversal signal
    if (divergenceResult) {
      const divWeight = divergenceResult.strength * 2.5;
      if (divergenceResult.type === "bullish") {
        bullScore += divWeight * weights.divergence;
        rawBullCount++;
        reasons.push(`RSI bullish divergence (strength: ${divergenceResult.strength.toFixed(2)})`);
      } else {
        bearScore += divWeight * weights.divergence;
        rawBearCount++;
        reasons.push(`RSI bearish divergence (strength: ${divergenceResult.strength.toFixed(2)})`);
      }
    }

    // ─── Determine signal ───────────────────────────────────

    const confluenceThreshold = 3;
    let direction: SignalDirection = "HOLD";
    let confluenceCount = 0;

    if (rawBullCount >= confluenceThreshold && bullScore > bearScore) {
      direction = "BUY";
      confluenceCount = rawBullCount;
    } else if (rawBearCount >= confluenceThreshold && bearScore > bullScore) {
      direction = "SELL";
      confluenceCount = rawBearCount;
    } else {
      confluenceCount = Math.max(rawBullCount, rawBearCount);
      reasons.push("Insufficient confluence — no clear signal");
    }

    // Quality gate: minimum weighted score to fire
    const winningScore = direction === "BUY" ? bullScore : direction === "SELL" ? bearScore : 0;
    if (direction !== "HOLD" && winningScore < 2.5) {
      direction = "HOLD";
      reasons.push("Signal too weak (weighted score below threshold)");
    }

    // ─── Calculate levels ───────────────────────────────────

    let entry = currentPrice;
    let stopLoss: number;
    let tp1: number, tp2: number, tp3: number;

    if (direction === "BUY") {
      stopLoss = entry - effectiveAtr * 1.5;
      tp1 = entry + effectiveAtr * 1.0;
      tp2 = entry + effectiveAtr * 2.0;
      tp3 = entry + effectiveAtr * 3.0;

      if (Math.abs(pivots.r1 - tp1) < effectiveAtr) tp1 = pivots.r1;
      if (Math.abs(pivots.r2 - tp2) < effectiveAtr) tp2 = pivots.r2;
    } else if (direction === "SELL") {
      stopLoss = entry + effectiveAtr * 1.5;
      tp1 = entry - effectiveAtr * 1.0;
      tp2 = entry - effectiveAtr * 2.0;
      tp3 = entry - effectiveAtr * 3.0;

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
      // Base: normalized weighted score
      const maxPossible = Object.values(weights).reduce((a, b) => a + b, 0);
      confidence = Math.round((winningScore / maxPossible) * 100);

      // R:R bonus
      if (riskRewardRatio > 2.5) confidence += 15;
      else if (riskRewardRatio > 2.0) confidence += 10;

      // EMA200 opposition penalty
      if (isFinite(ema200Val)) {
        if ((direction === "BUY" && currentPrice < ema200Val) ||
            (direction === "SELL" && currentPrice > ema200Val)) {
          confidence -= 15;
          reasons.push("⚠ Signal opposes EMA 200 trend");
        }
      }

      // BB squeeze penalty (low vol = wait for breakout)
      if (isFinite(bbBandwidthVal) && bbBandwidthVal < 3) {
        confidence -= 10;
        reasons.push("BB squeeze detected — breakout pending");
      }

      confidence = Math.max(0, Math.min(100, confidence));
    }

    // Final quality gate on confidence
    if (direction !== "HOLD" && confidence < 45) {
      direction = "HOLD";
      reasons.push("Confidence below minimum threshold (45%)");
    }

    // ─── Strength ───────────────────────────────────────────

    let strength: SignalStrength = "WEAK";
    if (confluenceCount >= 6 && confidence >= 70) strength = "STRONG";
    else if (confluenceCount >= 4 && confidence >= 55) strength = "MODERATE";

    // ─── Timeframe suggestion ───────────────────────────────

    const tfMap: Record<string, SignalTimeframe> = {
      "1min": "SCALP", "5min": "SCALP",
      "15min": "INTRADAY", "1h": "INTRADAY",
      "4h": "SWING", "1day": "SWING",
    };
    const timeframe = tfMap[candleData.timeframe] || "INTRADAY";

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
        `⚪ *XAUUSD — NO SIGNAL* (${signal.indicators.regime})`,
        ``,
        `Price: $${signal.entry.toFixed(2)}`,
        `RSI: ${signal.indicators.rsi14?.toFixed(1) || "N/A"}`,
        `ADX: ${isFinite(signal.indicators.adx) ? signal.indicators.adx.toFixed(1) : "N/A"}`,
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
      `Timeframe: ${signal.timeframe} | Regime: ${signal.indicators.regime}`,
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
    lines.push(`  ADX: ${isFinite(signal.indicators.adx) ? signal.indicators.adx.toFixed(1) : "N/A"}`);
    lines.push(`  BB: ${signal.indicators.bbLower?.toFixed(2)} / ${signal.indicators.bbMiddle?.toFixed(2)} / ${signal.indicators.bbUpper?.toFixed(2)}`);
    if (isFinite(signal.indicators.ema200)) {
      lines.push(`  EMA200: $${signal.indicators.ema200.toFixed(2)}`);
    }
    lines.push(``);
    lines.push(`⚠️ _Risk management: Never risk more than 1-2% of your account per trade._`);
    lines.push(`⏰ ${new Date(signal.timestamp).toUTCString()}`);

    return lines.join("\n");
  }
}

// ─── Regime detection ────────────────────────────────────────────

function detectRegime(
  adxResult: ADXResult,
  bb: BollingerBands,
  last: number
): MarketRegime {
  const adxVal = adxResult.adx[last];

  // Not enough data for ADX — default to RANGING (conservative)
  if (!isFinite(adxVal)) return "RANGING";

  if (adxVal > 25) return "TRENDING";

  if (adxVal < 20) {
    // Check for breakout: ADX rising from low level + BB was squeezed
    const adxRising =
      isFinite(adxResult.adx[last - 1]) && isFinite(adxResult.adx[last - 2]) &&
      adxResult.adx[last] > adxResult.adx[last - 1] &&
      adxResult.adx[last - 1] > adxResult.adx[last - 2];

    const bbWidth = bb.bandwidth[last];
    const recentSqueeze = isFinite(bbWidth) && bbWidth < 3;

    if (adxRising && recentSqueeze) return "BREAKOUT";
    return "RANGING";
  }

  // Transition zone (20-25): default to RANGING
  return "RANGING";
}

function round(n: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
