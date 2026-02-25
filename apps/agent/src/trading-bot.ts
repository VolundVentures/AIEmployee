/**
 * XAUUSD Trading Signal Bot -- Entry Point
 *
 * This is a standalone bot that:
 *   1. Connects to WhatsApp via Twilio
 *   2. Runs a heartbeat every 15 minutes: full AI-powered analysis with memory
 *   3. Sends actionable trade signals + market context automatically
 *   4. Also responds to on-demand requests (ask for price, analysis, etc.)
 *
 * The heartbeat is the core loop:
 *   - Signal engine produces structured signal (no AI cost)
 *   - Haiku adds 2-3 sentences of context (cheap, fast — compares with memory)
 *   - Combined message sent via WhatsApp
 *   - Summary saved to memory for continuity across heartbeats
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... ALERT_PHONE=... npm run trading-bot
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY       -- Claude API key
 *   TWELVE_DATA_API_KEY     -- (optional) Twelve Data API key for better data
 *   ALERT_PHONE             -- Phone to receive signals (e.g. 971501234567@s.whatsapp.net)
 *   HEARTBEAT_INTERVAL_MINS -- How often to run full analysis (default: 15)
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
import { XAUUSD_TRADER } from "./trading/persona.js";
import { executeTradingTool, fetchHeartbeatData, runHeartbeatAnalysis, initStrategyEngine } from "./trading/tools.js";
import { StrategyEngine } from "./trading/strategy-engine.js";
import { isMarketOpen } from "./trading/indicators.js";

// ─── Config ──────────────────────────────────────────────────────

const ALERT_PHONE = process.env.ALERT_PHONE || "";
const HEARTBEAT_INTERVAL = (parseInt(process.env.HEARTBEAT_INTERVAL_MINS || "15", 10)) * 60 * 1000;

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`
    ╔═══════════════════════════════════════════╗
    ║    🥇 GOLDIE -- XAUUSD TRADING BOT 🥇     ║
    ║    AI Employee by Volund Ventures          ║
    ║    ♥ Heartbeat mode                        ║
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

  // Initialize
  // Use EMPLOYEE_ID from env (must be a valid UUID for memory persistence)
  const agent = new AgentEngine(process.env.ANTHROPIC_API_KEY, XAUUSD_TRADER, process.env.EMPLOYEE_ID);
  const whatsapp = new WhatsAppClient("./baileys_auth_goldie");

  // Initialize Sonnet strategy engine for AI-powered trade decisions
  const strategyEngineInstance = new StrategyEngine(process.env.ANTHROPIC_API_KEY!, {
    accountSize: parseInt(process.env.ACCOUNT_SIZE || "1000"),
    lotSize: parseFloat(process.env.LOT_SIZE || "0.02"),
    riskPercent: parseFloat(process.env.RISK_PERCENT || "1"),
  });
  initStrategyEngine(strategyEngineInstance);
  console.log(`[Goldie] Strategy engine: Sonnet 4.6 | Account: $${process.env.ACCOUNT_SIZE || "1000"} | Lot: ${process.env.LOT_SIZE || "0.02"} | Risk: ${process.env.RISK_PERCENT || "1"}%`);

  console.log(`[Goldie] Heartbeat interval: ${HEARTBEAT_INTERVAL / 60000} minutes`);
  console.log(`[Goldie] Alert phone: ${ALERT_PHONE || "(none -- console only)"}`);

  // ─── Handle incoming WhatsApp messages ─────────────────

  let heartbeatCount = 0;
  let lastHeartbeatTime = 0;
  let marketWasOpen = true;

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
        const result = await executeTradingTool("generate_signal", {});
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

      if (lower === "help" || lower === "h") {
        await whatsapp.sendMessage(jid, [
          `🥇 *Goldie — XAUUSD Bot*`,
          ``,
          `*signal* (s) — Deep trading signal`,
          `*price* (p) — Current price`,
          `*overview* (o) — Multi-TF snapshot`,
          `*heartbeat* (hb) — Run analysis now`,
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

  // ─── Heartbeat: Sonnet strategy analysis ────────────────
  //
  // 1. Fetch market data (5 API calls)
  // 2. Sonnet strategy engine analyzes indicators + decides trade
  //    (replaces both hardcoded scoring AND Haiku context steps)
  // 3. Formatted message sent via WhatsApp
  // 4. Summary saved to memory for continuity

  async function runHeartbeat() {
    try {
      // Skip when market is closed (weekends, daily maintenance break)
      const market = isMarketOpen();
      if (!market.open) {
        if (marketWasOpen) {
          // Market just closed — notify once
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

      // Market is open — check if it just reopened
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

      // 2. Get memory context for Sonnet (what happened in recent heartbeats)
      let memoryContext = "";
      if (agent.isMemoryEnabled()) {
        try {
          memoryContext = await agent.getMemory().getContextString() || "";
        } catch {
          // Non-fatal
        }
      }

      // 3. Run Sonnet strategy analysis (or fallback to signal engine)
      const { signalResult, strategyCost } = await runHeartbeatAnalysis(hbData, memoryContext);

      // 4. Build message
      const q = hbData.quote;
      const changeSign = q.change24h >= 0 ? "+" : "";
      const message = [
        `♥ *HEARTBEAT #${heartbeatCount}* — ${timeStr} GST`,
        `💰 *$${q.price.toFixed(2)}* | ${changeSign}$${q.change24h.toFixed(2)} (${changeSign}${q.changePct24h.toFixed(2)}%)`,
        `Range: $${q.low24h.toFixed(2)} – $${q.high24h.toFixed(2)}`,
        ``,
        signalResult,
      ].join("\n");

      if (strategyCost > 0) {
        console.log(`[Goldie] ♥ Strategy cost: $${strategyCost.toFixed(4)}`);
      }

      // 5. Send via WhatsApp
      if (ALERT_PHONE && whatsapp.isConnected()) {
        await whatsapp.sendMessage(ALERT_PHONE, message);
        console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} sent`);
      } else {
        console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} (not sent — no phone or disconnected)`);
        console.log(message);
      }

      // 6. Save summary to memory for continuity
      if (agent.isMemoryEnabled()) {
        try {
          const signalFirstLine = signalResult.split("\n")[0];
          await agent.getMemory().saveMemory(
            `HB#${heartbeatCount} (${timeStr} GST): ${signalFirstLine}`,
            "task_outcome",
            { heartbeat: heartbeatCount, time: now.toISOString() }
          );
        } catch {
          // Non-fatal
        }
      }

      lastHeartbeatTime = now.getTime();
    } catch (err) {
      console.error("[Goldie] ♥ Heartbeat error:", err);
    }
  }

  // ─── Startup ───────────────────────────────────────────

  if (ALERT_PHONE && whatsapp.isConnected()) {
    console.log("[Goldie] Sending startup message...");
    await whatsapp.sendMessage(
      ALERT_PHONE,
      [
        `🥇 *Goldie is online!*`,
        `♥ Heartbeat: every ${HEARTBEAT_INTERVAL / 60000} min`,
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
