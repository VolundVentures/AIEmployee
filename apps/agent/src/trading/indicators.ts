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
