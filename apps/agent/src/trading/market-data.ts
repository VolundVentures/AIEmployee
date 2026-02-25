/**
 * Market data fetcher for XAUUSD (Gold/USD).
 *
 * Data sources (in priority order):
 *   1. Twelve Data API (free tier: 800 req/day) — XAU/USD spot
 *   2. Yahoo Finance GC=F (Gold Futures) — reliable fallback, ~$20-30 above spot
 *
 * NOTE: Yahoo's v8 chart API does NOT support XAUUSD=X (returns empty data).
 * The only working gold ticker is GC=F (COMEX futures), used as last resort.
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
  source: string;   // "twelvedata" | "yahoo-futures"
}

export interface CandleData {
  candles: Candle[];
  timeframe: string;
  symbol: string;
  source: string;
}

// --------------- Candle validation ---------------

/**
 * Filter out bad candles (NaN, zero, null OHLC values).
 * Gold has a daily maintenance break (~5-6pm ET) where Twelve Data
 * can return candles with null/zero values. A single bad candle
 * corrupts ALL indicators (EMA, RSI, ATR, BB — everything).
 */
function filterValidCandles(candles: Candle[], source: string): Candle[] {
  const valid = candles.filter((c) =>
    c.close > 0 && c.open > 0 && c.high > 0 && c.low > 0 &&
    isFinite(c.close) && isFinite(c.open) && isFinite(c.high) && isFinite(c.low) &&
    isFinite(c.timestamp)
  );

  const dropped = candles.length - valid.length;
  if (dropped > 0) {
    console.warn(`[MarketData] Dropped ${dropped}/${candles.length} bad candles from ${source} (NaN/zero/null OHLC)`);
  }

  return valid;
}

// --------------- Twelve Data (primary — spot XAU/USD) ---------------

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

  if (!data.values || !Array.isArray(data.values) || data.values.length === 0) {
    throw new Error("Twelve Data: no candle values returned");
  }

  const raw = (data.values as any[]).map((v: any) => ({
    // Twelve Data returns "YYYY-MM-DD HH:mm:ss" — append Z for UTC
    timestamp: new Date(v.datetime + "Z").getTime(),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || "0"),
  })).reverse(); // oldest first

  const candles = filterValidCandles(raw, `TwelveData ${interval}`);

  if (candles.length < 20) {
    throw new Error(`Twelve Data: only ${candles.length} valid candles after filtering (need >= 20)`);
  }

  return candles;
}

async function fetchTwelveDataQuote(apiKey: string): Promise<MarketSnapshot> {
  const url = `https://api.twelvedata.com/quote?symbol=XAU/USD&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;

  if (data.status === "error") {
    throw new Error(`Twelve Data quote error: ${data.message}`);
  }

  const price = parseFloat(data.close);
  if (!price || !isFinite(price) || price <= 0) {
    throw new Error(`Twelve Data: invalid price (raw close=${data.close})`);
  }

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

// --------------- Yahoo Finance (fallback — GC=F Gold Futures) ---------------

const YAHOO_SYMBOL = "GC=F";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

async function fetchYahooCandles(
  interval: string = "5m",
  range: string = "1d"
): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  const data = (await res.json()) as any;

  if (data.chart?.error) {
    throw new Error(`Yahoo Finance error: ${JSON.stringify(data.chart.error)}`);
  }

  const result = data.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance: no data returned");

  const timestamps = result.timestamp as number[];
  if (!timestamps || timestamps.length === 0) throw new Error("Yahoo Finance: empty timestamps");

  const quotes = result.indicators.quote[0];

  const raw = timestamps.map((ts: number, i: number) => ({
    timestamp: ts * 1000,
    open: quotes.open[i] ?? 0,
    high: quotes.high[i] ?? 0,
    low: quotes.low[i] ?? 0,
    close: quotes.close[i] ?? 0,
    volume: quotes.volume[i] ?? 0,
  }));

  const candles = filterValidCandles(raw, `Yahoo ${interval}`);

  if (candles.length < 10) {
    throw new Error(`Yahoo Finance: only ${candles.length} valid candles after filtering`);
  }

  return candles;
}

async function fetchYahooQuote(): Promise<MarketSnapshot> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YAHOO_SYMBOL}?interval=1m&range=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  const data = (await res.json()) as any;

  if (data.chart?.error) {
    throw new Error(`Yahoo Finance error: ${JSON.stringify(data.chart.error)}`);
  }

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
    source: "yahoo-futures",
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
  private warnedNoKey = false;

  // Read lazily — NOT in constructor. In ESM, module-level code in tools.ts
  // runs before dotenv.config() in trading-bot.ts, so process.env is empty
  // at construction time. Reading it per-call ensures dotenv has loaded.
  private getApiKey(): string | undefined {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key && !this.warnedNoKey) {
      this.warnedNoKey = true;
      console.warn(
        "[MarketData] No TWELVE_DATA_API_KEY set.\n" +
        "[MarketData] Falling back to Yahoo Finance GC=F (Gold FUTURES — prices may differ from spot).\n" +
        "[MarketData] For accurate spot XAUUSD, get a free key at https://twelvedata.com"
      );
    }
    return key;
  }

  async getQuote(): Promise<MarketSnapshot> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const quote = await fetchTwelveDataQuote(apiKey);
        console.log(`[MarketData] Quote from Twelve Data (spot): $${quote.price.toFixed(2)}`);
        return quote;
      } catch (err) {
        console.warn("[MarketData] Twelve Data quote failed, falling back to Yahoo:", err);
      }
    }

    try {
      const quote = await fetchYahooQuote();
      console.log(`[MarketData] Quote from Yahoo GC=F (futures): $${quote.price.toFixed(2)}`);
      return quote;
    } catch (err) {
      console.error("[MarketData] All quote sources failed:", err);
      throw new Error("Unable to fetch XAUUSD quote from any data source");
    }
  }

  async getCandles(timeframe: string = "5min", count: number = 100): Promise<CandleData> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const candles = await fetchTwelveDataCandles(apiKey, timeframe, count);
        console.log(`[MarketData] ${timeframe} candles from Twelve Data (spot): ${candles.length} valid bars`);
        return { candles, timeframe, symbol: "XAUUSD", source: "twelvedata" };
      } catch (err) {
        console.warn(`[MarketData] Twelve Data ${timeframe} candles failed, falling back:`, err);
      }
    }

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

      if (timeframe === "4h") {
        candles = aggregateTo4h(candles);
      }

      candles = candles.slice(-count);
      console.log(`[MarketData] ${timeframe} candles from Yahoo GC=F (futures): ${candles.length} valid bars`);
      return { candles, timeframe, symbol: "XAUUSD", source: "yahoo-futures" };
    } catch (err) {
      console.error(`[MarketData] All ${timeframe} candle sources failed:`, err);
      throw new Error(`Unable to fetch XAUUSD ${timeframe} candles from any data source`);
    }
  }

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
