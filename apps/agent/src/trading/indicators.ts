/**
 * Technical indicators for XAUUSD trading signals.
 * Pure TypeScript implementations -- no external TA library needed.
 */

import type { Candle } from "./market-data.js";

// ─── Simple Moving Average ───────────────────────────────────────

export function sma(closes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

// ─── Exponential Moving Average ──────────────────────────────────

export function ema(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];

  const k = 2 / (period + 1);

  // Seed with SMA of first `period` values for accuracy (Wilder's method).
  // Without this, EMA(50) on 100 bars has ~14% weight from the arbitrary
  // first close, which can shift the EMA by ~$40 on gold at $2900.
  let seed: number;
  if (closes.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += closes[i];
    seed = sum / period;
  } else {
    seed = closes[0];
  }

  const result: number[] = [seed];
  for (let i = 1; i < closes.length; i++) {
    result.push(closes[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// ─── RSI (Relative Strength Index) ──────────────────────────────

export function rsi(closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  if (gains.length < period) return result;

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

// ─── MACD ────────────────────────────────────────────────────────

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);

  const macdLine = fastEma.map((f, i) => f - slowEma[i]);
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);

  return { macd: macdLine, signal: signalLine, histogram };
}

// ─── Bollinger Bands ─────────────────────────────────────────────

export interface BollingerBands {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number[];
}

export function bollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBands {
  const middle = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const stdDev = Math.sqrt(
      slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period
    );
    upper.push(mean + stdDevMultiplier * stdDev);
    lower.push(mean - stdDevMultiplier * stdDev);
    bandwidth.push((upper[i] - lower[i]) / middle[i] * 100);
  }

  return { upper, middle, lower, bandwidth };
}

// ─── ATR (Average True Range) ────────────────────────────────────

export function atr(candles: Candle[], period: number = 14): number[] {
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }

  // Use EMA-smoothed ATR
  const result: number[] = new Array(candles.length).fill(NaN);
  if (trueRanges.length < period) return result;

  let atrVal = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atrVal;

  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
    result[i] = atrVal;
  }

  return result;
}

// ─── Stochastic Oscillator ───────────────────────────────────────

export interface StochasticResult {
  k: number[];
  d: number[];
}

export function stochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticResult {
  const kValues: number[] = new Array(candles.length).fill(NaN);

  for (let i = kPeriod - 1; i < candles.length; i++) {
    const slice = candles.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map((c) => c.high));
    const lowestLow = Math.min(...slice.map((c) => c.low));
    const range = highestHigh - lowestLow;
    kValues[i] = range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100;
  }

  // %D is SMA of %K
  const validK = kValues.filter((v) => !isNaN(v));
  const dValues = sma(validK, dPeriod);

  // Align D values back to candle indices
  const d: number[] = new Array(candles.length).fill(NaN);
  let dIdx = 0;
  for (let i = 0; i < candles.length; i++) {
    if (!isNaN(kValues[i])) {
      d[i] = dValues[dIdx] ?? NaN;
      dIdx++;
    }
  }

  return { k: kValues, d };
}

// ─── Support & Resistance (pivot points) ─────────────────────────

export interface PivotLevels {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export function pivotPoints(candles: Candle[]): PivotLevels {
  // Use the full previous session's H/L/C for pivot calculation.
  // Gold session boundary: 5:00 PM ET = 22:00 UTC (not midnight UTC).
  // Falls back to last 24 candles if insufficient history.

  const now = candles[candles.length - 1]?.timestamp || Date.now();
  const nowDate = new Date(now);

  // Gold session starts at 22:00 UTC. Find the most recent 22:00 UTC boundary.
  const todayStart = new Date(now);
  todayStart.setUTCMinutes(0, 0, 0);
  todayStart.setUTCHours(22);
  // If current time is before 22:00 UTC today, session started yesterday at 22:00
  if (nowDate.getTime() < todayStart.getTime()) {
    todayStart.setUTCDate(todayStart.getUTCDate() - 1);
  }
  const todayMs = todayStart.getTime();

  // Gather all candles from the previous session (before today's midnight)
  const prevSession = candles.filter((c) => c.timestamp < todayMs);

  let sessionHigh: number, sessionLow: number, sessionClose: number;

  if (prevSession.length >= 4) {
    // Full previous session available — use its H/L/C
    sessionHigh = Math.max(...prevSession.map((c) => c.high));
    sessionLow = Math.min(...prevSession.map((c) => c.low));
    sessionClose = prevSession[prevSession.length - 1].close;
  } else {
    // Not enough historical candles — use last 24 candles as proxy
    const lookback = candles.slice(-Math.min(candles.length, 24), -1);
    if (lookback.length === 0) {
      const last = candles[candles.length - 1] || { high: 0, low: 0, close: 0 };
      sessionHigh = last.high;
      sessionLow = last.low;
      sessionClose = last.close;
    } else {
      sessionHigh = Math.max(...lookback.map((c) => c.high));
      sessionLow = Math.min(...lookback.map((c) => c.low));
      sessionClose = lookback[lookback.length - 1].close;
    }
  }

  const pivot = (sessionHigh + sessionLow + sessionClose) / 3;

  return {
    pivot,
    r1: 2 * pivot - sessionLow,
    r2: pivot + (sessionHigh - sessionLow),
    r3: sessionHigh + 2 * (pivot - sessionLow),
    s1: 2 * pivot - sessionHigh,
    s2: pivot - (sessionHigh - sessionLow),
    s3: sessionLow - 2 * (sessionHigh - pivot),
  };
}

// ─── ADX (Average Directional Index) ────────────────────────────

export interface ADXResult {
  adx: number[];      // ADX line (0-100, trend strength)
  plusDI: number[];    // +DI (upward directional indicator)
  minusDI: number[];  // -DI (downward directional indicator)
}

export function adx(candles: Candle[], period: number = 14): ADXResult {
  const len = candles.length;
  const adxOut: number[] = new Array(len).fill(NaN);
  const plusDIOut: number[] = new Array(len).fill(NaN);
  const minusDIOut: number[] = new Array(len).fill(NaN);

  if (len < period * 2) return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };

  // Step 1: Compute +DM, -DM, and True Range for each bar
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trueRanges: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < len; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    trueRanges.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }

  // Step 2: Wilder smooth +DM, -DM, TR over period
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let smoothTR = 0;

  for (let i = 0; i < period; i++) {
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
    smoothTR += trueRanges[i];
  }

  // Step 3: Compute +DI, -DI, DX from index (period-1) onward
  const dxValues: number[] = [];

  for (let i = period - 1; i < len; i++) {
    if (i > period - 1) {
      // Wilder smoothing: prev - prev/period + current
      smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
      smoothTR = smoothTR - smoothTR / period + trueRanges[i];
    }

    const pdi = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const mdi = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
    plusDIOut[i] = pdi;
    minusDIOut[i] = mdi;

    const diSum = pdi + mdi;
    const dx = diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  // Step 4: ADX = Wilder smooth of DX over period
  if (dxValues.length >= period) {
    let adxVal = 0;
    for (let i = 0; i < period; i++) adxVal += dxValues[i];
    adxVal /= period;
    adxOut[period * 2 - 2] = adxVal;

    for (let i = period; i < dxValues.length; i++) {
      adxVal = (adxVal * (period - 1) + dxValues[i]) / period;
      adxOut[period - 1 + i] = adxVal;
    }
  }

  return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };
}

// ─── RSI Divergence Detection ───────────────────────────────────

export interface Divergence {
  type: "bullish" | "bearish";
  priceSwing: { index: number; value: number };
  rsiSwing: { index: number; value: number };
  strength: number; // 0-1
}

export function detectDivergence(
  closes: number[],
  rsiValues: number[],
  lookback: number = 20
): Divergence | null {
  const len = closes.length;
  if (len < lookback || lookback < 5) return null;

  const start = len - lookback;

  // Find swing lows (for bullish divergence) and swing highs (for bearish)
  const swingLows: { index: number; price: number; rsi: number }[] = [];
  const swingHighs: { index: number; price: number; rsi: number }[] = [];

  for (let i = start + 1; i < len - 1; i++) {
    if (isNaN(rsiValues[i])) continue;

    if (closes[i] < closes[i - 1] && closes[i] < closes[i + 1]) {
      swingLows.push({ index: i, price: closes[i], rsi: rsiValues[i] });
    }
    if (closes[i] > closes[i - 1] && closes[i] > closes[i + 1]) {
      swingHighs.push({ index: i, price: closes[i], rsi: rsiValues[i] });
    }
  }

  // Bullish divergence: price lower low, RSI higher low
  if (swingLows.length >= 2) {
    const prev = swingLows[swingLows.length - 2];
    const curr = swingLows[swingLows.length - 1];
    if (curr.price < prev.price && curr.rsi > prev.rsi) {
      const strength = Math.min(1.0, Math.abs(curr.rsi - prev.rsi) / 20);
      return {
        type: "bullish",
        priceSwing: { index: curr.index, value: curr.price },
        rsiSwing: { index: curr.index, value: curr.rsi },
        strength,
      };
    }
  }

  // Bearish divergence: price higher high, RSI lower high
  if (swingHighs.length >= 2) {
    const prev = swingHighs[swingHighs.length - 2];
    const curr = swingHighs[swingHighs.length - 1];
    if (curr.price > prev.price && curr.rsi < prev.rsi) {
      const strength = Math.min(1.0, Math.abs(curr.rsi - prev.rsi) / 20);
      return {
        type: "bearish",
        priceSwing: { index: curr.index, value: curr.price },
        rsiSwing: { index: curr.index, value: curr.rsi },
        strength,
      };
    }
  }

  return null;
}

// ─── Volume Weighted Average Price ───────────────────────────────

export function vwap(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVol = 0;

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVol += c.volume;
    result.push(cumulativeVol === 0 ? tp : cumulativeTPV / cumulativeVol);
  }

  return result;
}

// ─── Smart Money / Price Structure Indicators ────────────────────

// ─── Swing Points Detection ─────────────────────────────────────

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
  timestamp: number;
}

/**
 * Detect swing highs and lows from candle data.
 * A swing high = candle with higher high than both neighbors.
 * A swing low = candle with lower low than both neighbors.
 */
export function detectSwingPoints(candles: Candle[], lookback: number = 2): SwingPoint[] {
  const points: SwingPoint[] = [];
  if (candles.length < lookback * 2 + 1) return points;

  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isSwingHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      points.push({ index: i, price: candles[i].high, type: "high", timestamp: candles[i].timestamp });
    }
    if (isSwingLow) {
      points.push({ index: i, price: candles[i].low, type: "low", timestamp: candles[i].timestamp });
    }
  }

  return points;
}

// ─── Market Structure (HH/HL/LH/LL) ────────────────────────────

export type MarketStructure = "bullish" | "bearish" | "neutral";

export interface StructureAnalysis {
  structure: MarketStructure;
  recentSwingHigh: number;
  recentSwingLow: number;
  higherHighs: number;   // count of HH in recent swings
  higherLows: number;    // count of HL
  lowerHighs: number;    // count of LH
  lowerLows: number;     // count of LL
  structureBreak: boolean; // whether a break of structure just happened
  breakLevel: number;     // the level that was broken
}

/**
 * Analyze market structure from swing points.
 * Bullish: Higher Highs + Higher Lows
 * Bearish: Lower Highs + Lower Lows
 */
export function analyzeStructure(swingPoints: SwingPoint[]): StructureAnalysis {
  const highs = swingPoints.filter(p => p.type === "high");
  const lows = swingPoints.filter(p => p.type === "low");

  const defaultResult: StructureAnalysis = {
    structure: "neutral",
    recentSwingHigh: 0,
    recentSwingLow: 0,
    higherHighs: 0,
    higherLows: 0,
    lowerHighs: 0,
    lowerLows: 0,
    structureBreak: false,
    breakLevel: 0,
  };

  if (highs.length < 2 || lows.length < 2) return defaultResult;

  // Count HH/LH and HL/LL in recent swings (last 5 pairs)
  const recentHighs = highs.slice(-5);
  const recentLows = lows.slice(-5);

  let hh = 0, lh = 0, hl = 0, ll = 0;

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i].price > recentHighs[i - 1].price) hh++;
    else lh++;
  }
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i].price > recentLows[i - 1].price) hl++;
    else ll++;
  }

  // Determine structure
  let structure: MarketStructure = "neutral";
  if (hh >= 2 && hl >= 2) structure = "bullish";
  else if (lh >= 2 && ll >= 2) structure = "bearish";
  else if (hh > lh && hl > ll) structure = "bullish";
  else if (lh > hh && ll > hl) structure = "bearish";

  // Check for break of structure (most recent swing broke previous)
  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];

  let structureBreak = false;
  let breakLevel = 0;

  // Bearish BOS: price made a lower low (broke below previous swing low)
  if (lastLow.price < prevLow.price && lastLow.index > prevLow.index) {
    if (structure === "bearish" || (structure === "neutral" && lh > 0)) {
      structureBreak = true;
      breakLevel = prevLow.price;
    }
  }
  // Bullish BOS: price made a higher high (broke above previous swing high)
  if (lastHigh.price > prevHigh.price && lastHigh.index > prevHigh.index) {
    if (structure === "bullish" || (structure === "neutral" && hl > 0)) {
      structureBreak = true;
      breakLevel = prevHigh.price;
    }
  }

  return {
    structure,
    recentSwingHigh: lastHigh.price,
    recentSwingLow: lastLow.price,
    higherHighs: hh,
    higherLows: hl,
    lowerHighs: lh,
    lowerLows: ll,
    structureBreak,
    breakLevel,
  };
}

// ─── Fair Value Gaps (FVGs) ─────────────────────────────────────

export interface FairValueGap {
  type: "bullish" | "bearish";
  top: number;       // upper boundary of the gap
  bottom: number;    // lower boundary of the gap
  index: number;     // candle index of the middle candle
  filled: boolean;   // whether price has returned to fill it
  timestamp: number;
}

/**
 * Detect Fair Value Gaps in candle data.
 * Bullish FVG: Gap between candle[i-2].high and candle[i].low (price moved up too fast)
 * Bearish FVG: Gap between candle[i].high and candle[i-2].low (price moved down too fast)
 */
export function detectFairValueGaps(candles: Candle[], lookback: number = 30): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  const startIdx = Math.max(2, candles.length - lookback);

  for (let i = startIdx; i < candles.length; i++) {
    // Bullish FVG: candle[i].low > candle[i-2].high (gap up)
    if (candles[i].low > candles[i - 2].high) {
      const gap: FairValueGap = {
        type: "bullish",
        top: candles[i].low,
        bottom: candles[i - 2].high,
        index: i - 1,
        filled: false,
        timestamp: candles[i - 1].timestamp,
      };
      // Check if it was filled by subsequent candles
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= gap.bottom) {
          gap.filled = true;
          break;
        }
      }
      gaps.push(gap);
    }

    // Bearish FVG: candle[i].high < candle[i-2].low (gap down)
    if (candles[i].high < candles[i - 2].low) {
      const gap: FairValueGap = {
        type: "bearish",
        top: candles[i - 2].low,
        bottom: candles[i].high,
        index: i - 1,
        filled: false,
        timestamp: candles[i - 1].timestamp,
      };
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= gap.top) {
          gap.filled = true;
          break;
        }
      }
      gaps.push(gap);
    }
  }

  return gaps;
}

// ─── Order Blocks ───────────────────────────────────────────────

export interface OrderBlock {
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  index: number;
  timestamp: number;
}

/**
 * Detect Order Blocks (last opposite candle before a displacement move).
 * Bullish OB: Last bearish candle before a strong upward move.
 * Bearish OB: Last bullish candle before a strong downward move.
 */
export function detectOrderBlocks(candles: Candle[], atrValue: number, lookback: number = 20): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const startIdx = Math.max(1, candles.length - lookback);
  const threshold = atrValue * 1.5; // displacement must be > 1.5x ATR

  for (let i = startIdx; i < candles.length - 1; i++) {
    const curr = candles[i];
    const next = candles[i + 1];
    const body = Math.abs(curr.close - curr.open);
    const nextBody = Math.abs(next.close - next.open);

    // Bullish OB: bearish candle followed by strong bullish displacement
    if (curr.close < curr.open && next.close > next.open && nextBody > threshold) {
      blocks.push({
        type: "bullish",
        top: curr.open,
        bottom: curr.low,
        index: i,
        timestamp: curr.timestamp,
      });
    }

    // Bearish OB: bullish candle followed by strong bearish displacement
    if (curr.close > curr.open && next.close < next.open && nextBody > threshold) {
      blocks.push({
        type: "bearish",
        top: curr.high,
        bottom: curr.open,
        index: i,
        timestamp: curr.timestamp,
      });
    }
  }

  return blocks;
}

// ─── Candlestick Patterns ───────────────────────────────────────

export interface CandlePattern {
  type: "bullish_engulfing" | "bearish_engulfing" | "hammer" | "shooting_star" | "doji" | "pin_bar_bull" | "pin_bar_bear";
  index: number;
  timestamp: number;
}

/**
 * Detect key candlestick patterns in the most recent candles.
 */
export function detectCandlePatterns(candles: Candle[], lookback: number = 10): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  const startIdx = Math.max(1, candles.length - lookback);

  for (let i = startIdx; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const body = Math.abs(curr.close - curr.open);
    const range = curr.high - curr.low;
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;

    // Bullish engulfing
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open <= prev.close && curr.close >= prev.open) {
      patterns.push({ type: "bullish_engulfing", index: i, timestamp: curr.timestamp });
    }

    // Bearish engulfing
    if (prev.close > prev.open && curr.close < curr.open &&
        curr.open >= prev.close && curr.close <= prev.open) {
      patterns.push({ type: "bearish_engulfing", index: i, timestamp: curr.timestamp });
    }

    if (range > 0) {
      // Hammer (bullish): small body at top, long lower wick
      if (lowerWick > body * 2 && upperWick < body * 0.5 && curr.close >= curr.open) {
        patterns.push({ type: "hammer", index: i, timestamp: curr.timestamp });
      }

      // Shooting star (bearish): small body at bottom, long upper wick
      if (upperWick > body * 2 && lowerWick < body * 0.5 && curr.close <= curr.open) {
        patterns.push({ type: "shooting_star", index: i, timestamp: curr.timestamp });
      }

      // Pin bar bullish: very long lower wick relative to range
      if (lowerWick > range * 0.6 && body < range * 0.3) {
        patterns.push({ type: "pin_bar_bull", index: i, timestamp: curr.timestamp });
      }

      // Pin bar bearish: very long upper wick relative to range
      if (upperWick > range * 0.6 && body < range * 0.3) {
        patterns.push({ type: "pin_bar_bear", index: i, timestamp: curr.timestamp });
      }

      // Doji: tiny body relative to range
      if (body < range * 0.1) {
        patterns.push({ type: "doji", index: i, timestamp: curr.timestamp });
      }
    }
  }

  return patterns;
}

// ─── Volume Analysis ────────────────────────────────────────────

export interface VolumeAnalysis {
  avgVolume: number;
  currentVolume: number;
  volumeRatio: number;        // current / average (> 1.5 = spike)
  isVolumeSpike: boolean;
  volumeTrend: "rising" | "falling" | "flat";
  obvDirection: "bullish" | "bearish" | "neutral";
}

/**
 * Analyze volume patterns: MA, spikes, OBV direction.
 */
export function analyzeVolume(candles: Candle[], period: number = 20): VolumeAnalysis {
  const len = candles.length;
  if (len < period) {
    return {
      avgVolume: 0, currentVolume: 0, volumeRatio: 0,
      isVolumeSpike: false, volumeTrend: "flat", obvDirection: "neutral",
    };
  }

  // Volume MA
  const recentVolumes = candles.slice(-period).map(c => c.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / period;
  const currentVolume = candles[len - 1].volume;
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

  // Volume trend (rising/falling over last 5 candles)
  const last5 = candles.slice(-5).map(c => c.volume);
  let risingCount = 0;
  for (let i = 1; i < last5.length; i++) {
    if (last5[i] > last5[i - 1]) risingCount++;
  }
  const volumeTrend = risingCount >= 3 ? "rising" : risingCount <= 1 ? "falling" : "flat";

  // Simple OBV direction (last 10 candles)
  let obvSum = 0;
  const last10 = candles.slice(-10);
  for (let i = 1; i < last10.length; i++) {
    if (last10[i].close > last10[i - 1].close) obvSum += last10[i].volume;
    else if (last10[i].close < last10[i - 1].close) obvSum -= last10[i].volume;
  }
  const obvDirection = obvSum > 0 ? "bullish" as const : obvSum < 0 ? "bearish" as const : "neutral" as const;

  return {
    avgVolume,
    currentVolume,
    volumeRatio,
    isVolumeSpike: volumeRatio > 1.5,
    volumeTrend,
    obvDirection,
  };
}

// ─── Session Detection ──────────────────────────────────────────

export type TradingSession = "asian" | "london" | "new_york" | "london_ny_overlap" | "off_hours";

export interface SessionInfo {
  current: TradingSession;
  isKillZone: boolean;       // London or NY kill zone (highest probability trading)
  minutesIntoSession: number;
  sessionOpen: number;       // UTC hour the session started
  previousDayHigh: number;
  previousDayLow: number;
}

/**
 * Determine the current trading session and kill zone status.
 * Sessions (UTC):
 *   Asian:   22:00 - 07:00 UTC (Tokyo/Sydney)
 *   London:  07:00 - 16:00 UTC
 *   NY:      12:00 - 21:00 UTC
 *   Overlap: 12:00 - 16:00 UTC (London + NY)
 *   Kill Zones: London 07:00-10:00, NY 12:00-15:00 UTC
 */
export function detectSession(candles: Candle[]): SessionInfo {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  let session: TradingSession;
  let isKillZone = false;
  let sessionOpen: number;

  if (utcHour >= 12 && utcHour < 16) {
    session = "london_ny_overlap";
    sessionOpen = 12;
    isKillZone = utcHour < 15; // NY kill zone: 12:00-15:00 UTC
  } else if (utcHour >= 7 && utcHour < 16) {
    session = "london";
    sessionOpen = 7;
    isKillZone = utcHour < 10; // London kill zone: 07:00-10:00 UTC
  } else if (utcHour >= 12 && utcHour < 21) {
    session = "new_york";
    sessionOpen = 12;
    isKillZone = utcHour < 15;
  } else if (utcHour >= 22 || utcHour < 7) {
    session = "asian";
    sessionOpen = 22;
    isKillZone = false; // Asian session is setup, not execution
  } else {
    session = "off_hours";
    sessionOpen = utcHour;
    isKillZone = false;
  }

  const minutesIntoSession = utcHour >= sessionOpen
    ? (utcHour - sessionOpen) * 60 + utcMinute
    : ((24 - sessionOpen) + utcHour) * 60 + utcMinute;

  // Previous day high/low from candle data
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const prevDayCandles = candles.filter(c => c.timestamp >= oneDayAgo);
  const previousDayHigh = prevDayCandles.length > 0 ? Math.max(...prevDayCandles.map(c => c.high)) : 0;
  const previousDayLow = prevDayCandles.length > 0 ? Math.min(...prevDayCandles.map(c => c.low)) : 0;

  return {
    current: session,
    isKillZone,
    minutesIntoSession,
    sessionOpen,
    previousDayHigh,
    previousDayLow,
  };
}

// ─── Liquidity Levels ───────────────────────────────────────────

export interface LiquidityLevel {
  price: number;
  type: "equal_highs" | "equal_lows" | "previous_day_high" | "previous_day_low" | "session_high" | "session_low";
  swept: boolean;  // whether price has swept this level
}

/**
 * Detect liquidity levels (where stop losses accumulate).
 * Equal highs/lows = areas where multiple swing points cluster.
 */
export function detectLiquidityLevels(
  swingPoints: SwingPoint[],
  candles: Candle[],
  tolerance: number = 1.0
): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;

  // Find equal highs (2+ swing highs within tolerance)
  const highs = swingPoints.filter(p => p.type === "high");
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].price - highs[j].price) <= tolerance) {
        const avgPrice = (highs[i].price + highs[j].price) / 2;
        const swept = currentPrice > avgPrice;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < tolerance)) {
          levels.push({ price: avgPrice, type: "equal_highs", swept });
        }
      }
    }
  }

  // Find equal lows
  const lows = swingPoints.filter(p => p.type === "low");
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].price - lows[j].price) <= tolerance) {
        const avgPrice = (lows[i].price + lows[j].price) / 2;
        const swept = currentPrice < avgPrice;
        if (!levels.some(l => Math.abs(l.price - avgPrice) < tolerance)) {
          levels.push({ price: avgPrice, type: "equal_lows", swept });
        }
      }
    }
  }

  return levels;
}
