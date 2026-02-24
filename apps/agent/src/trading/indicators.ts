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
  const k = 2 / (period + 1);
  const result: number[] = [closes[0]];
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
  // Use last completed candle for pivot calculation
  const last = candles[candles.length - 2] || candles[candles.length - 1];
  const pivot = (last.high + last.low + last.close) / 3;

  return {
    pivot,
    r1: 2 * pivot - last.low,
    r2: pivot + (last.high - last.low),
    r3: last.high + 2 * (pivot - last.low),
    s1: 2 * pivot - last.high,
    s2: pivot - (last.high - last.low),
    s3: last.low - 2 * (last.high - pivot),
  };
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
