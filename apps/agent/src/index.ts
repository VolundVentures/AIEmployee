import "dotenv/config";
import { WhatsAppClient } from "./whatsapp/client.js";
import { AgentEngine } from "./agent/engine.js";
import { OnboardingFlow } from "./onboarding/flow.js";

/** Track which chats have completed onboarding */
const onboardedChats = new Set<string>();

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
  const onboarding = new OnboardingFlow(agent.getMemory());
  console.log("[Journeyman] Agent engine initialized (Haiku/Sonnet/Opus routing active)");
  console.log("[Journeyman] Tools available: search_web, save_memory, recall_memory, create_task, update_task, list_tasks, request_approval");

  // Check if we have existing memory (skip onboarding if already set up)
  const existingMemory = await agent.getMemory().getRecentMemory("fact", 1);
  if (existingMemory.length > 0) {
    console.log("[Journeyman] Found existing memory -- skipping onboarding for returning chats");
  }

  // Initialize WhatsApp client
  const whatsapp = new WhatsAppClient();

  whatsapp.onMessage(async (jid, text) => {
    try {
      // Check if this chat needs onboarding
      const needsOnboarding = !onboardedChats.has(jid) && existingMemory.length === 0;

      if (needsOnboarding || onboarding.isOnboarding(jid)) {
        // Handle onboarding flow
        if (!onboarding.isOnboarding(jid)) {
          const welcome = onboarding.startOnboarding(jid);
          await whatsapp.sendMessage(jid, welcome);
          return;
        }

        const step = await onboarding.processStep(jid, text);
        await whatsapp.sendMessage(jid, step.response);

        if (step.complete) {
          onboardedChats.add(jid);
        }
        return;
      }

      // Mark as onboarded if we have existing memory
      onboardedChats.add(jid);

      // Process message through the agent engine (with tool use)
      const result = await agent.processMessage(jid, text);
      await whatsapp.sendMessage(jid, result.response);

      console.log(
        `[Journeyman] Replied via ${result.tier} | ${result.tokensIn}+${result.tokensOut} tokens | $${result.cost.toFixed(4)}`
      );
    } catch (err) {
      console.error("[Journeyman] Failed to process message:", err);
      await whatsapp.sendMessage(
        jid,
        "Sorry, I encountered an error. Please try again in a moment."
      );
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
