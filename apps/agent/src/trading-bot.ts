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
 *   - Fetches multi-TF signal + market overview (raw data, no AI cost)
 *   - Passes the data through the AI agent (Sonnet) with full memory context
 *   - AI compares with previous heartbeats, spots trend shifts, gives clear trade action
 *   - Saves important observations to persistent memory for continuity
 *   - Sends the analysis via WhatsApp
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
import { executeTradingTool } from "./trading/tools.js";

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
  const agent = new AgentEngine(process.env.ANTHROPIC_API_KEY, XAUUSD_TRADER, "goldie-001");
  const whatsapp = new WhatsAppClient("./baileys_auth_goldie");

  console.log(`[Goldie] Heartbeat interval: ${HEARTBEAT_INTERVAL / 60000} minutes`);
  console.log(`[Goldie] Alert phone: ${ALERT_PHONE || "(none -- console only)"}`);

  // ─── Handle incoming WhatsApp messages ─────────────────

  let heartbeatCount = 0;
  let lastHeartbeatTime = 0;

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

  // ─── Heartbeat: full AI-powered analysis ───────────────

  async function runHeartbeat() {
    try {
      heartbeatCount++;
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const elapsedSinceLast = lastHeartbeatTime
        ? `${Math.round((now.getTime() - lastHeartbeatTime) / 60000)}min since last`
        : "first scan";

      console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} at ${timeStr} GST (${elapsedSinceLast})...`);

      // 1. Fetch market data directly — no AI cost for data gathering
      const [signalResult, overviewResult] = await Promise.all([
        executeTradingTool("generate_signal", {}),
        executeTradingTool("get_market_overview", {}),
      ]);

      // 2. Build prompt with raw data — AI analyzes with memory context
      const prompt = [
        `[HEARTBEAT #${heartbeatCount} — ${timeStr} GST — ${elapsedSinceLast}]`,
        ``,
        `Here is the latest market scan. Analyze it using your memory of previous heartbeats.`,
        ``,
        `=== SIGNAL ANALYSIS ===`,
        signalResult,
        ``,
        `=== MULTI-TF OVERVIEW ===`,
        overviewResult,
        ``,
        `Your analysis should include:`,
        `1. What changed since your last heartbeat? Any trend shifts, momentum changes, or key level breaks?`,
        `2. Clear TRADE ACTION: BUY / SELL / WAIT — include entry, SL, TP if actionable`,
        `3. Key levels to watch until next heartbeat`,
        `4. If you spot an important pattern shift or trend change compared to previous scans, save it to memory using save_memory`,
        ``,
        `Do NOT call generate_signal or get_market_overview — the data is already above.`,
        `You may call save_memory if you spot something worth remembering.`,
        `Format for WhatsApp. Be concise but thorough.`,
      ].join("\n");

      // 3. Process through AI agent with full memory context (force Sonnet)
      const result = await agent.processMessage("heartbeat", prompt, "sonnet");

      // 4. Send via WhatsApp
      const message = `♥ *HEARTBEAT #${heartbeatCount}* — ${timeStr} GST\n\n${result.response}`;

      if (ALERT_PHONE && whatsapp.isConnected()) {
        await whatsapp.sendMessage(ALERT_PHONE, message);
        console.log(
          `[Goldie] ♥ Heartbeat #${heartbeatCount} sent | ` +
          `${result.tokensIn}+${result.tokensOut} tokens | $${result.cost.toFixed(4)}`
        );
      } else {
        console.log(`[Goldie] ♥ Heartbeat #${heartbeatCount} (not sent — no phone or disconnected)`);
        console.log(message);
      }

      // 5. Save concise summary to memory for next heartbeat's context
      try {
        const signalFirstLine = signalResult.split("\n")[0];
        await agent.getMemory().saveMemory(
          `Heartbeat #${heartbeatCount} (${timeStr} GST): ${signalFirstLine} | AI action: ${result.response.slice(0, 150)}`,
          "task_outcome",
          { heartbeat: heartbeatCount, time: now.toISOString() }
        );
      } catch {
        // Memory not enabled or save failed — non-fatal
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
