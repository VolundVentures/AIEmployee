import "dotenv/config";
import { WhatsAppClient } from "./whatsapp/client.js";
import { AgentEngine } from "./agent/engine.js";

async function main() {
  console.log(`
     ╦╔═╗╦ ╦╦═╗╔╗╔╔═╗╦ ╦╔╦╗╔═╗╔╗╔
     ║║ ║║ ║╠╦╝║║║║╣ ╚╦╝║║║╠═╣║║║
    ╚╝╚═╝╚═╝╩╚═╝╚╝╚═╝ ╩ ╩ ╩╩ ╩╝╚╝
    AI Employee Platform by Volund Ventures
  `);

  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[Journeyman] Missing ANTHROPIC_API_KEY. Set it in your .env file.");
    process.exit(1);
  }

  // Initialize agent engine with smart model routing
  const agent = new AgentEngine(process.env.ANTHROPIC_API_KEY);
  console.log("[Journeyman] Agent engine initialized (Haiku/Sonnet/Opus routing active)");

  // Initialize WhatsApp client
  const whatsapp = new WhatsAppClient();

  whatsapp.onMessage(async (jid, text) => {
    try {
      const result = await agent.processMessage(jid, text);
      await whatsapp.sendMessage(jid, result.response);
      console.log(`[Journeyman] Replied via ${result.tier} model`);
    } catch (err) {
      console.error("[Journeyman] Failed to process message:", err);
      await whatsapp.sendMessage(jid, "Sorry, I encountered an error processing your message. Please try again.");
    }
  });

  // Connect to WhatsApp
  console.log("[Journeyman] Connecting to WhatsApp...");
  await whatsapp.connect();
}

main().catch((err) => {
  console.error("[Journeyman] Fatal error:", err);
  process.exit(1);
});
