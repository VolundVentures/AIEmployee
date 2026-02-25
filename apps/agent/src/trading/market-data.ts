/**
 * Market data fetcher for XAUUSD (Gold/USD) — SPOT prices only.
 *
 * Uses multiple free data sources with fallback:
 *   1. Twelve Data API (free tier: 800 req/day) — XAU/USD spot
 *   2. Yahoo Finance (unofficial, no key) — XAUUSD=X spot
 *
 * IMPORTANT: We use XAUUSD=X on Yahoo (spot gold), NOT GC=F (COMEX futures).
 * Futures trade at a premium to spot due to cost of carry. Using GC=F would
 * give prices ~$20-30 higher than what MT4/MT5 brokers show for XAUUSD spot.
 */

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
  source: string;   // which data provider ("twelvedata" | "yahoo")
}

export interface CandleData {
  candles: Candle[];
  timeframe: string;
  symbol: string;
  source: string;   // which data provider
}

// --------------- Twelve Data (primary) ---------------

async function fetchTwelveDataCandles(
  apiKey: string,
  interval: string = "5min",
  outputSize: number = 100
): Promise<Candle[]> {
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=${outputSize}&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;

  if (data.status === "error") {
    throw new Error(`Twelve Data error: ${data.message}`);
  }

  return (data.values as any[]).map((v: any) => ({
    timestamp: new Date(v.datetime).getTime(),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || "0"),
  })).reverse(); // oldest first
}

async function fetchTwelveDataQuote(apiKey: string): Promise<MarketSnapshot> {
  const url = `https://api.twelvedata.com/quote?symbol=XAU/USD&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;

  if (data.status === "error") {
    throw new Error(`Twelve Data quote error: ${data.message}`);
  }

  const price = parseFloat(data.close);
  return {
    symbol: "XAUUSD",
    price,
    bid: price - 0.15,
    ask: price + 0.15,
    spread: 0.30,
    change24h: parseFloat(data.change || "0"),
    changePct24h: parseFloat(data.percent_change || "0"),
    high24h: parseFloat(data.high || String(price)),
    low24h: parseFloat(data.low || String(price)),
    timestamp: Date.now(),
    source: "twelvedata",
  };
}

// --------------- Yahoo Finance (fallback) ---------------
// Uses XAUUSD=X (spot gold/USD), NOT GC=F (futures).

const YAHOO_SYMBOL = "XAUUSD=X";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

async function fetchYahooCandles(
  interval: string = "5m",
  range: string = "1d"
): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  const data = (await res.json()) as any;

  const result = data.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance: no data returned");

  const timestamps = result.timestamp as number[];
  if (!timestamps || timestamps.length === 0) throw new Error("Yahoo Finance: empty timestamps");

  const quotes = result.indicators.quote[0];

  return timestamps.map((ts: number, i: number) => ({
    timestamp: ts * 1000,
    open: quotes.open[i] ?? 0,
    high: quotes.high[i] ?? 0,
    low: quotes.low[i] ?? 0,
    close: quotes.close[i] ?? 0,
    volume: quotes.volume[i] ?? 0,
  })).filter((c: Candle) => c.close > 0);
}

async function fetchYahooQuote(): Promise<MarketSnapshot> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL}?interval=1m&range=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  const data = (await res.json()) as any;

  const result = data.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance: no quote data");

  const meta = result.meta;
  const price = meta.regularMarketPrice;

  if (!price || price <= 0) throw new Error("Yahoo Finance: invalid price");

  return {
    symbol: "XAUUSD",
    price,
    bid: price - 0.20,
    ask: price + 0.20,
    spread: 0.40,
    change24h: price - (meta.previousClose || price),
    changePct24h: meta.previousClose ? ((price - meta.previousClose) / meta.previousClose) * 100 : 0,
    high24h: meta.regularMarketDayHigh || price,
    low24h: meta.regularMarketDayLow || price,
    timestamp: Date.now(),
    source: "yahoo",
  };
}

// --------------- Helper: aggregate 1h candles into 4h ---------------

function aggregateTo4h(candles1h: Candle[]): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i < candles1h.length; i += 4) {
    const chunk = candles1h.slice(i, i + 4);
    if (chunk.length === 0) continue;
    result.push({
      timestamp: chunk[0].timestamp,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return result;
}

// --------------- Public API (MarketDataProvider) ---------------

export class MarketDataProvider {
  private twelveDataKey: string | undefined;

  constructor() {
    this.twelveDataKey = process.env.TWELVE_DATA_API_KEY;
    if (!this.twelveDataKey) {
      console.warn("[MarketData] No TWELVE_DATA_API_KEY — using Yahoo Finance (XAUUSD=X spot) as primary source.");
    }
  }

  /**
   * Get current XAUUSD spot quote (price, spread, 24h change).
   */
  async getQuote(): Promise<MarketSnapshot> {
    // Try Twelve Data first
    if (this.twelveDataKey) {
      try {
        const quote = await fetchTwelveDataQuote(this.twelveDataKey);
        console.log(`[MarketData] Quote from Twelve Data: $${quote.price.toFixed(2)}`);
        return quote;
      } catch (err) {
        console.warn("[MarketData] Twelve Data quote failed, falling back to Yahoo:", err);
      }
    }

    // Fallback to Yahoo (XAUUSD=X spot)
    try {
      const quote = await fetchYahooQuote();
      console.log(`[MarketData] Quote from Yahoo (${YAHOO_SYMBOL}): $${quote.price.toFixed(2)}`);
      return quote;
    } catch (err) {
      console.error("[MarketData] All quote sources failed:", err);
      throw new Error("Unable to fetch XAUUSD quote from any data source");
    }
  }

  /**
   * Get OHLCV candles for technical analysis.
   * @param timeframe  "1min" | "5min" | "15min" | "1h" | "4h" | "1day"
   * @param count Number of candles
   */
  async getCandles(timeframe: string = "5min", count: number = 100): Promise<CandleData> {
    // Try Twelve Data first (supports all timeframes natively)
    if (this.twelveDataKey) {
      try {
        const candles = await fetchTwelveDataCandles(this.twelveDataKey, timeframe, count);
        console.log(`[MarketData] ${timeframe} candles from Twelve Data: ${candles.length} bars`);
        return { candles, timeframe, symbol: "XAUUSD", source: "twelvedata" };
      } catch (err) {
        console.warn(`[MarketData] Twelve Data ${timeframe} candles failed, falling back:`, err);
      }
    }

    // Yahoo fallback — map timeframes (Yahoo has no 4h interval)
    const yahooIntervalMap: Record<string, string> = {
      "1min": "1m", "5min": "5m", "15min": "15m",
      "1h": "1h", "4h": "1h", "1day": "1d",
    };
    const yahooRangeMap: Record<string, string> = {
      "1min": "1d", "5min": "5d", "15min": "5d",
      "1h": "1mo", "4h": "3mo", "1day": "6mo",
    };

    try {
      const interval = yahooIntervalMap[timeframe] || "5m";
      const range = yahooRangeMap[timeframe] || "5d";
      let candles = await fetchYahooCandles(interval, range);

      // Yahoo has no native 4h candles — aggregate from 1h
      if (timeframe === "4h") {
        candles = aggregateTo4h(candles);
      }

      candles = candles.slice(-count);
      console.log(`[MarketData] ${timeframe} candles from Yahoo (${YAHOO_SYMBOL}): ${candles.length} bars`);
      return { candles, timeframe, symbol: "XAUUSD", source: "yahoo" };
    } catch (err) {
      console.error(`[MarketData] All ${timeframe} candle sources failed:`, err);
      throw new Error(`Unable to fetch XAUUSD ${timeframe} candles from any data source`);
    }
  }

  /**
   * Get candles for multiple timeframes at once (multi-timeframe analysis).
   */
  async getMultiTimeframeCandles(): Promise<Record<string, CandleData>> {
    const timeframes = ["5min", "15min", "1h", "4h"];
    const results: Record<string, CandleData> = {};

    for (const tf of timeframes) {
      try {
        results[tf] = await this.getCandles(tf, 100);
      } catch (err) {
        console.warn(`[MarketData] Failed to fetch ${tf} candles:`, err);
      }
    }

    return results;
  }
}
