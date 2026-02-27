/**
 * XAUUSD Trading Signal Bot -- Entry Point
 *
 * Intelligence layers:
 *   1. TradeTracker — records every signal, checks outcomes (win/loss/expired),
 *      computes stats (win rate, best setup, streak), feeds history to Sonnet
 *   2. Signal History — Sonnet sees its own recent decisions + outcomes,
 *      naturally stays consistent and learns what works
 *   3. Enriched Prompt — all computed data (PDH/PDL, liquidity, patterns,
 *      kill zone, volume) fed to Sonnet alongside signal history
 *   4. Adaptive Stats — win rates by direction/setup fed back so Sonnet
 *      favors strategies that are actually working
 *   5. Trade Monitoring — open positions checked against live price every heartbeat
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... ALERT_PHONE=... npm run trading-bot
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });
dotenv.config({ path: resolve(__dirname, "../.env") });
dotenv.config();

import { WhatsAppClient } from "./whatsapp/client.js";
import { AgentEngine } from "./agent/engine.js";
import { XAUUSD_TRADER } from "./trading/persona.js";
import { executeTradingTool, fetchHeartbeatData, runHeartbeatAnalysis, initStrategyEngine, generateSignalWithMemory } from "./trading/tools.js";
import { StrategyEngine } from "./trading/strategy-engine.js";
import { isMarketOpen } from "./trading/indicators.js";
import { TradeTracker } from "./trading/trade-tracker.js";

// ─── Config ──────────────────────────────────────────────────────

const ALERT_PHONE = process.env.ALERT_PHONE || "";
const HEARTBEAT_INTERVAL = (parseInt(process.env.HEARTBEAT_INTERVAL_MINS || "15", 10)) * 60 * 1000;
const LOT_SIZE = parseFloat(process.env.LOT_SIZE || "0.02");

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`
    ╔═══════════════════════════════════════════╗
    ║    🥇 GOLDIE -- XAUUSD TRADING BOT 🥇     ║
    ║    Volund Ventures                         ║
    ║    ♥ Heartbeat + AI Intelligence           ║
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
    console.warn("[Goldie] No ALERT_PHONE set. Heartbeats will only be printed to console.");
    console.warn("[Goldie] Set ALERT_PHONE=<your-number>@s.whatsapp.net to receive WhatsApp alerts.");
  }

  // ─── Initialize ─────────────────────────────────────────

  const employeeId = process.env.EMPLOYEE_ID || "";
  const agent = new AgentEngine(process.env.ANTHROPIC_API_KEY, XAUUSD_TRADER, employeeId);
  const whatsapp = new WhatsAppClient("./baileys_auth_goldie");
  const tracker = new TradeTracker(employeeId, LOT_SIZE);

  const strategyEngineInstance = new StrategyEngine(process.env.ANTHROPIC_API_KEY!, {
    accountSize: parseInt(process.env.ACCOUNT_SIZE || "1000"),
    lotSize: LOT_SIZE,
    riskPercent: parseFloat(process.env.RISK_PERCENT || "1"),
  });
  initStrategyEngine(strategyEngineInstance);

  console.log(`[Goldie] Strategy engine: Sonnet 4.6 | Account: $${process.env.ACCOUNT_SIZE || "1000"} | Lot: ${LOT_SIZE} | Risk: ${process.env.RISK_PERCENT || "1"}%`);
  console.log(`[Goldie] Heartbeat interval: ${HEARTBEAT_INTERVAL / 60000} minutes`);
  console.log(`[Goldie] Alert phone: ${ALERT_PHONE || "(none -- console only)"}`);

  const stats = tracker.getStats();
  if (stats.totalSignals > 0) {
    console.log(`[Goldie] Trade history: ${stats.totalSignals} signals, ${stats.wins}W/${stats.losses}L (${stats.winRate.toFixed(0)}% win rate)`);
  }

  // ─── Handle incoming WhatsApp messages ─────────────────

  let heartbeatCount = 0;
  let lastHeartbeatTime = 0;
  let marketWasOpen = true;
  let consecutiveFailures = 0;

  whatsapp.onMessage(async (jid, text) => {
    try {
      console.log(`[Goldie] Message from ${jid}: ${text}`);
      const lower = text.toLowerCase().trim();

      // Quick commands — bypass AI to save tokens
      if (lower === "price" || lower === "p") {
        const result = await executeTradingTool("get_xauusd_price", {});
        await whatsapp.sendMessage(jid, result);
        return;
      }

      if (lower === "signal" || lower === "s" || lower === "analyze") {
        // Fresh analysis with BOTH memory + signal history for consistency
        let memCtx = "";
        if (agent.isMemoryEnabled()) {
          try { memCtx = await agent.getMemory().getContextString() || ""; } catch { /* */ }
        }
        const signalHistory = tracker.formatForSonnet();
        const result = await generateSignalWithMemory(memCtx, signalHistory);
        await whatsapp.sendMessage(jid, result);
        return;
      }

      if (lower === "overview" || lower === "o" || lower === "mtf") {
        const result = await executeTradingTool("get_market_overview", {});
        await whatsapp.sendMessage(jid, result);
        return;
      }

      // Manual heartbeat trigger
      if (lower === "heartbeat" || lower === "hb") {
        await whatsapp.sendMessage(jid, "♥ Running heartbeat now...");
        await runHeartbeat();
        return;
      }

      // Stats command — show trade performance
      if (lower === "stats" || lower === "performance" || lower === "record") {
        const s = tracker.getStats();
        const resolved = s.wins + s.losses;
        if (resolved === 0) {
          await whatsapp.sendMessage(jid, "No completed trades yet. Keep running and I'll track my signals!");
          return;
        }
        const msg = [
          `📊 *Goldie Performance*`,
          ``,
          `*Record:* ${s.wins}W / ${s.losses}L (${s.winRate.toFixed(0)}% win rate)`,
          `*Open:* ${s.open} | *Expired:* ${s.expired}`,
          ``,
          `*Buy win rate:* ${s.buyWinRate.toFixed(0)}%`,
          `*Sell win rate:* ${s.sellWinRate.toFixed(0)}%`,
          s.bestSetup !== "none" ? `*Best setup:* ${s.bestSetup}` : "",
          s.streakCount >= 2 ? `*Streak:* ${s.streakCount} ${s.streakType}s in a row` : "",
        ].filter(Boolean).join("\n");
        await whatsapp.sendMessage(jid, msg);
        return;
      }

      if (lower === "help" || lower === "h") {
        await whatsapp.sendMessage(jid, [
          `🥇 *Goldie — XAUUSD Bot*`,
          ``,
          `*signal* (s) — Trading signal`,
          `*price* (p) — Current price`,
          `*overview* (o) — Multi-TF snapshot`,
          `*heartbeat* (hb) — Run analysis now`,
          `*stats* — Win/loss record`,
          `*help* (h) — This message`,
          ``,
          `♥ Auto-heartbeat every ${HEARTBEAT_INTERVAL / 60000} min`,
          `Or ask me anything about gold!`,
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

  // ─── Heartbeat: AI-Powered Analysis Loop ────────────────
  //
  // Each heartbeat:
  //   1. Check outcomes of open signals (did price hit SL/TP?)
  //   2. Fetch market data (5 API calls)
  //   3. Build signal history + stats for Sonnet
  //   4. Sonnet analyzes with full context (data + history + memory)
  //   5. Record new signal in TradeTracker
  //   6. Send via WhatsApp
  //   7. Save to memory

  async function runHeartbeat() {
    try {
      const market = isMarketOpen();
      if (!market.open) {
        if (marketWasOpen) {
          console.log(`[Goldie] Market closed (${market.reason}) — pausing heartbeats`);
          if (ALERT_PHONE && whatsapp.isConnected()) {
            await whatsapp.sendMessage(ALERT_PHONE, `💤 Market closed (${market.reason}) — Goldie is pausing. Will resume when market reopens.`);
          }
          marketWasOpen = false;
        } else {
          console.log(`[Goldie] Market still closed (${market.reason}) — skipping`);
        }
        return;
      }

      if (!marketWasOpen) {
        marketWasOpen = true;
        console.log("[Goldie] Market reopened — resuming heartbeats");
        if (ALERT_PHONE && whatsapp.isConnected()) {
          await whatsapp.sendMessage(ALERT_PHONE, "☀️ Market open — Goldie is back!");
        }
      }

      heartbeatCount++;
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} at ${timeStr} GST...`);

      // 1. Fetch all market data ONCE (5 API calls)
      const hbData = await fetchHeartbeatData();

      // 2. Check outcomes using FULL 5min candle history (not just recent)
      //    This covers the entire range since the signal was created
      const allCandles5m = hbData.candles5min.candles;
      let periodHigh = hbData.quote.price;
      let periodLow = hbData.quote.price;
      for (const c of allCandles5m) {
        if (c.high > periodHigh) periodHigh = c.high;
        if (c.low < periodLow) periodLow = c.low;
      }
      const resolved = tracker.checkOutcomes(hbData.quote.price, periodHigh, periodLow);

      // Send outcome notifications
      if (resolved.length > 0 && ALERT_PHONE && whatsapp.isConnected()) {
        const outcomeMsg = tracker.formatOutcomeMessage(resolved);
        if (outcomeMsg) {
          await whatsapp.sendMessage(ALERT_PHONE, outcomeMsg);
        }
      }

      // 3. Build context for Sonnet
      let memoryContext = "";
      if (agent.isMemoryEnabled()) {
        try {
          memoryContext = await agent.getMemory().getContextString() || "";
        } catch { /* */ }
      }
      const signalHistory = tracker.formatForSonnet();

      // 4. Run Sonnet strategy analysis with full context
      const { signalResult, strategyCost, decision } = await runHeartbeatAnalysis(hbData, memoryContext, signalHistory);

      const isTradeSignal = decision && (decision.action === "BUY" || decision.action === "SELL");

      // 5. Record signal ONLY if it's a real trade (not HOLD)
      if (isTradeSignal) {
        const utcHour = new Date().getUTCHours();
        const session = utcHour >= 12 && utcHour < 16 ? "london_ny_overlap"
          : utcHour >= 7 && utcHour < 16 ? "london"
          : utcHour >= 16 && utcHour < 21 ? "new_york"
          : "asian";

        // Close any existing open signal in the SAME direction (don't pile up duplicates)
        // If new signal is OPPOSITE direction, it means market flipped — keep both for tracking
        const dir = decision!.action as "BUY" | "SELL";
        tracker.closeStaleSignals(dir);

        tracker.recordSignal({
          direction: decision!.action as "BUY" | "SELL",
          confidence: decision!.confidence,
          setup: decision!.setup,
          entry: decision!.entry,
          stopLoss: decision!.stopLoss,
          takeProfit: decision!.takeProfit,
          priceAtSignal: hbData.quote.price,
          reasoning: decision!.reasoning,
          session,
          regime: decision!.regime,
        });
      }

      // 6. Build and send message
      const q = hbData.quote;
      const changeSign = q.change24h >= 0 ? "+" : "";

      if (strategyCost > 0) {
        console.log(`[Goldie] ♥ Strategy cost: $${strategyCost.toFixed(4)}`);
      }

      if (isTradeSignal) {
        // Only send to WhatsApp when we have a real trade signal
        const message = [
          `♥ *HEARTBEAT #${heartbeatCount}* — ${timeStr} GST`,
          `💰 *$${q.price.toFixed(2)}* | ${changeSign}$${q.change24h.toFixed(2)} (${changeSign}${q.changePct24h.toFixed(2)}%)`,
          `Range: $${q.low24h.toFixed(2)} – $${q.high24h.toFixed(2)}`,
          ``,
          signalResult,
        ].join("\n");

        if (ALERT_PHONE && whatsapp.isConnected()) {
          await whatsapp.sendMessage(ALERT_PHONE, message);
          console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} — SIGNAL SENT: ${decision!.action} ${decision!.confidence}%`);
        } else {
          console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} — SIGNAL (not sent — no phone)`);
          console.log(message);
        }
      } else {
        // HOLD — log but don't spam the user
        const holdReason = decision?.reasoning || signalResult.split("\n").slice(-1)[0] || "No clear setup";
        console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} — HOLD: ${holdReason}`);
        console.log(`[Goldie]   Price: $${q.price.toFixed(2)} | ${changeSign}${q.changePct24h.toFixed(2)}%`);
      }

      // 7. Save to memory (with richer context for Sonnet's next analysis)
      if (agent.isMemoryEnabled()) {
        try {
          const action = decision ? decision.action : "HOLD";
          const conf = decision ? `${decision.confidence}%` : "";
          const reason = decision?.reasoning || "No clear setup";
          const memLine = `HB#${heartbeatCount} (${timeStr} GST): ${action} ${conf} @ $${q.price.toFixed(2)} — ${reason}`;
          await agent.getMemory().saveMemory(
            memLine,
            "task_outcome",
            { heartbeat: heartbeatCount, time: now.toISOString() }
          );
        } catch { /* */ }
      }

      lastHeartbeatTime = now.getTime();
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Goldie] ♥ Heartbeat error (failure #${consecutiveFailures}):`, errMsg);

      // Notify user after 3 consecutive failures
      if (consecutiveFailures === 3 && ALERT_PHONE && whatsapp.isConnected()) {
        await whatsapp.sendMessage(ALERT_PHONE,
          `⚠️ Goldie has failed to fetch market data ${consecutiveFailures} times in a row.\n\n` +
          `Error: ${errMsg}\n\n` +
          `_Will keep retrying. If this persists, check your TWELVE_DATA_API_KEY in .env._`
        );
      }
    }
  }

  // ─── Startup ───────────────────────────────────────────

  if (ALERT_PHONE && whatsapp.isConnected()) {
    const s = tracker.getStats();
    const record = s.wins + s.losses > 0 ? ` | Record: ${s.wins}W/${s.losses}L` : "";
    await whatsapp.sendMessage(
      ALERT_PHONE,
      [
        `🥇 *Goldie is online!*`,
        `♥ Heartbeat: every ${HEARTBEAT_INTERVAL / 60000} min${record}`,
        `Type *help* for commands`,
      ].join("\n")
    );
  }

  // Start heartbeat loop
  console.log(`[Goldie] Starting heartbeat (every ${HEARTBEAT_INTERVAL / 60000} min)...`);
  runHeartbeat();
  setInterval(runHeartbeat, HEARTBEAT_INTERVAL);
}

// ─── Start ───────────────────────────────────────────────────────

main().catch((err) => {
  console.error("[Goldie] Fatal error:", err);
  process.exit(1);
});
