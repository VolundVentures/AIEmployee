/**
 * XAUUSD Trading Signal Bot -- Entry Point
 *
 * This is a standalone bot that:
 *   1. Connects to WhatsApp (QR code scan on first run)
 *   2. Scans XAUUSD every N minutes using technical analysis
 *   3. Sends BUY/SELL signals to your WhatsApp when confluence triggers
 *   4. Also responds to on-demand requests (ask for price, analysis, etc.)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... ALERT_PHONE=... npm run trading-bot
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY   -- Claude API key (for AI-enhanced commentary)
 *   TWELVE_DATA_API_KEY -- (optional) Twelve Data API key for better data
 *   ALERT_PHONE         -- Your phone number to receive signals (e.g. 971501234567@s.whatsapp.net)
 *   SCAN_INTERVAL_MINS  -- How often to scan (default: 5)
 *   MIN_CONFIDENCE       -- Minimum confidence % to send alert (default: 40)
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env from multiple locations (monorepo root, apps/agent, or script dir)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });   // monorepo root
dotenv.config({ path: resolve(__dirname, "../.env") });          // apps/agent/
dotenv.config();                                                  // cwd fallback

import { WhatsAppClient } from "./whatsapp/client.js";
import { AgentEngine } from "./agent/engine.js";
import { MarketDataProvider } from "./trading/market-data.js";
import { SignalEngine } from "./trading/signal-engine.js";
import { XAUUSD_TRADER } from "./trading/persona.js";
import { TRADING_TOOLS, executeTradingTool, isTradingTool } from "./trading/tools.js";
import type { TradingSignal } from "./trading/signal-engine.js";

// ─── Config ──────────────────────────────────────────────────────

const ALERT_PHONE = process.env.ALERT_PHONE || "";
const SCAN_INTERVAL = (parseInt(process.env.SCAN_INTERVAL_MINS || "5", 10)) * 60 * 1000;
const MIN_CONFIDENCE = parseInt(process.env.MIN_CONFIDENCE || "40", 10);

// ─── State ───────────────────────────────────────────────────────

let lastSignalDirection: string | null = null;
let lastSignalTime = 0;
const SIGNAL_COOLDOWN = 15 * 60 * 1000; // Don't repeat same signal within 15 min

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`
    ╔═══════════════════════════════════════════╗
    ║    🥇 GOLDIE -- XAUUSD TRADING BOT 🥇     ║
    ║    AI Employee by Volund Ventures          ║
    ╚═══════════════════════════════════════════╝
  `);

  // Validate
  if (!process.env.ANTHROPIC_API_KEY) {
    const root = resolve(__dirname, "../../../.env");
    const agent = resolve(__dirname, "../.env");
    console.error("[Goldie] Missing ANTHROPIC_API_KEY. Checked these .env locations:");
    console.error(`  - ${root}`);
    console.error(`  - ${agent}`);
    console.error(`  - ${resolve(process.cwd(), ".env")} (cwd)`);
    console.error("[Goldie] Copy .env.example to .env and fill in your keys.");
    process.exit(1);
  }
  if (!ALERT_PHONE) {
    console.warn("[Goldie] No ALERT_PHONE set. Signals will only be printed to console.");
    console.warn("[Goldie] Set ALERT_PHONE=<your-number>@s.whatsapp.net to receive WhatsApp alerts.");
  }

  // Initialize
  const marketData = new MarketDataProvider();
  const signalEngine = new SignalEngine();
  const agent = new AgentEngine(process.env.ANTHROPIC_API_KEY, XAUUSD_TRADER, "goldie-001");
  const whatsapp = new WhatsAppClient("./baileys_auth_goldie");

  console.log(`[Goldie] Scan interval: ${SCAN_INTERVAL / 60000} minutes`);
  console.log(`[Goldie] Min confidence: ${MIN_CONFIDENCE}%`);
  console.log(`[Goldie] Alert phone: ${ALERT_PHONE || "(none -- console only)"}`);

  // ─── Handle incoming WhatsApp messages ─────────────────

  whatsapp.onMessage(async (jid, text) => {
    try {
      console.log(`[Goldie] Message from ${jid}: ${text}`);
      const lower = text.toLowerCase().trim();

      // Quick commands
      if (lower === "price" || lower === "p") {
        const result = await executeTradingTool("get_xauusd_price", {});
        await whatsapp.sendMessage(jid, result);
        return;
      }

      if (lower === "signal" || lower === "s" || lower === "analyze") {
        const result = await executeTradingTool("analyze_xauusd", { timeframe: "15min" });
        await whatsapp.sendMessage(jid, result);
        return;
      }

      if (lower.startsWith("analyze ")) {
        const tf = lower.replace("analyze ", "").trim();
        const result = await executeTradingTool("analyze_xauusd", { timeframe: tf });
        await whatsapp.sendMessage(jid, result);
        return;
      }

      if (lower === "overview" || lower === "o" || lower === "mtf") {
        const result = await executeTradingTool("get_market_overview", {});
        await whatsapp.sendMessage(jid, result);
        return;
      }

      if (lower === "help" || lower === "h") {
        await whatsapp.sendMessage(jid, [
          `🥇 *Goldie -- XAUUSD Trading Bot*`,
          ``,
          `Quick commands:`,
          `  *price* (p) -- Current XAUUSD price`,
          `  *signal* (s) -- Generate trading signal (15min)`,
          `  *analyze 5min* -- Signal for specific timeframe`,
          `  *overview* (o) -- Multi-timeframe overview`,
          `  *help* (h) -- This help message`,
          ``,
          `Or just ask me anything about gold trading!`,
          ``,
          `⚙️ Auto-scanning every ${SCAN_INTERVAL / 60000} min.`,
          `📱 Alerts sent when confidence >= ${MIN_CONFIDENCE}%`,
        ].join("\n"));
        return;
      }

      // For anything else, use the AI agent for natural language
      const result = await agent.processMessage(jid, text);
      await whatsapp.sendMessage(jid, result.response);
    } catch (err) {
      console.error("[Goldie] Message handling error:", err);
      await whatsapp.sendMessage(jid, "Sorry, I hit an error processing that. Try again.");
    }
  });

  // ─── Connect WhatsApp ──────────────────────────────────

  console.log("[Goldie] Connecting to WhatsApp...");
  await whatsapp.connect();

  // ─── Scheduled market scanner ──────────────────────────

  async function scanMarket() {
    try {
      console.log(`[Goldie] Scanning XAUUSD...`);

      // Analyze 15min chart (good balance for intraday signals)
      const [candleData15, candleData1h, quote] = await Promise.all([
        marketData.getCandles("15min", 100),
        marketData.getCandles("1h", 100),
        marketData.getQuote(),
      ]);

      const signal15 = signalEngine.analyze(candleData15, quote);
      const signal1h = signalEngine.analyze(candleData1h, quote);

      console.log(
        `[Goldie] 15min: ${signal15.direction} (${signal15.strength}, conf: ${signal15.confidence}%) | ` +
        `1h: ${signal1h.direction} (${signal1h.strength}, conf: ${signal1h.confidence}%)`
      );

      // Determine if we should alert
      const shouldAlert = shouldSendAlert(signal15, signal1h);

      if (shouldAlert) {
        const message = signalEngine.formatSignalMessage(signal15);
        console.log(`[Goldie] ALERT triggered:\n${message}`);

        if (ALERT_PHONE && whatsapp.isConnected()) {
          try {
            await whatsapp.sendMessage(ALERT_PHONE, message);
            console.log(`[Goldie] Alert sent to ${ALERT_PHONE}`);
          } catch (err) {
            console.error("[Goldie] Failed to send WhatsApp alert:", err);
          }
        } else if (ALERT_PHONE) {
          console.warn("[Goldie] WhatsApp not connected -- alert printed to console only.");
        }

        lastSignalDirection = signal15.direction;
        lastSignalTime = Date.now();
      }
    } catch (err) {
      console.error("[Goldie] Scan error:", err);
    }
  }

  // Start scanning immediately — scanner checks isConnected() before sending
  console.log("[Goldie] Starting market scanner...");
  scanMarket();
  setInterval(scanMarket, SCAN_INTERVAL);
}

/**
 * Decide whether a signal should trigger a WhatsApp alert.
 * Requires:
 *   - Signal is BUY or SELL (not HOLD)
 *   - Confidence >= MIN_CONFIDENCE
 *   - Not a repeat of the same signal within cooldown
 *   - Higher timeframe (1h) agrees with the direction
 */
function shouldSendAlert(signal15: TradingSignal, signal1h: TradingSignal): boolean {
  // Must be actionable
  if (signal15.direction === "HOLD") return false;

  // Must meet confidence threshold
  if (signal15.confidence < MIN_CONFIDENCE) return false;

  // Cooldown: don't repeat same direction within 15 minutes
  if (
    signal15.direction === lastSignalDirection &&
    Date.now() - lastSignalTime < SIGNAL_COOLDOWN
  ) {
    return false;
  }

  // Higher timeframe confirmation: 1h should agree or be neutral
  if (signal1h.direction !== "HOLD" && signal1h.direction !== signal15.direction) {
    console.log(`[Goldie] 15min says ${signal15.direction} but 1h says ${signal1h.direction} -- skipping`);
    return false;
  }

  return true;
}

// ─── Start ───────────────────────────────────────────────────────

main().catch((err) => {
  console.error("[Goldie] Fatal error:", err);
  process.exit(1);
});
