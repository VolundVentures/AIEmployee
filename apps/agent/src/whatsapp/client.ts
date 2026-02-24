/**
 * WhatsApp client powered by the Twilio API.
 *
 * Replaces the previous Baileys (WhatsApp Web reverse-engineering) approach
 * which was blocked by WhatsApp's 405 IP-level rejections.
 *
 * Twilio is an official WhatsApp Business Solution Provider — no IP blocking,
 * no QR code scanning, and much more reliable.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID    -- Twilio account SID
 *   TWILIO_AUTH_TOKEN      -- Twilio auth token
 *   TWILIO_WHATSAPP_NUMBER -- Twilio WhatsApp sender (e.g. +14155238886 for sandbox)
 *   WEBHOOK_PORT           -- Port for incoming-message webhook (default: 3001)
 */

import twilio from "twilio";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { EventEmitter } from "events";

export interface MessageHandler {
  (jid: string, text: string): Promise<void>;
}

export class WhatsAppClient extends EventEmitter {
  private twilioClient: twilio.Twilio | null = null;
  private messageHandler: MessageHandler | null = null;
  private twilioNumber: string;
  private connected = false;
  private webhookPort: number;

  constructor(_authDir?: string) {
    super();
    // _authDir is ignored — Twilio handles auth via API keys, not local files.
    // Parameter kept for backward compatibility with existing instantiation.
    // Strip any "whatsapp:" prefix the user may have included — we add it when needed
    const rawNumber = process.env.TWILIO_WHATSAPP_NUMBER || "";
    this.twilioNumber = rawNumber.replace(/^whatsapp:/i, "");
    this.webhookPort = parseInt(process.env.WEBHOOK_PORT || "3001", 10);
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  /** Whether the Twilio client is configured and ready to send. */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Initialize the Twilio client and start the webhook server.
   * Resolves once the webhook server is listening and we're ready to
   * send/receive messages.
   */
  async connect(): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken || !this.twilioNumber) {
      console.error("[WhatsApp] Missing Twilio config. Required env vars:");
      console.error("  TWILIO_ACCOUNT_SID");
      console.error("  TWILIO_AUTH_TOKEN");
      console.error("  TWILIO_WHATSAPP_NUMBER");
      console.error("[WhatsApp] Running in console-only mode (no WhatsApp).");
      return;
    }

    this.twilioClient = twilio(accountSid, authToken);

    // Start webhook server for incoming messages
    await this.startWebhookServer();

    this.connected = true;
    console.log("[WhatsApp] Connected via Twilio!");
    console.log(`[WhatsApp] Webhook listening on port ${this.webhookPort}`);
    console.log(`[WhatsApp] Sender: whatsapp:${this.twilioNumber}`);
    console.log(
      `[WhatsApp] Set your Twilio webhook URL to: http://<your-host>:${this.webhookPort}/webhook/whatsapp`
    );
    this.emit("ready");
  }

  /**
   * Send a WhatsApp message via Twilio.
   * @param jid  Phone number in JID format (e.g. "971589115381@s.whatsapp.net")
   *             or plain number (e.g. "971589115381")
   * @param text Message body
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.connected || !this.twilioClient) {
      console.warn("[WhatsApp] Cannot send — not connected. Skipping.");
      return;
    }

    try {
      await this.twilioClient.messages.create({
        body: text,
        from: `whatsapp:${this.twilioNumber}`,
        to: this.jidToTwilio(jid),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[WhatsApp] Failed to send message: ${msg}`);
    }
  }

  getSocket(): null {
    return null;
  }

  // ─── Private helpers ─────────────────────────────────────

  private startWebhookServer(): Promise<void> {
    return new Promise((resolve) => {
      const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        // Health check
        if (req.method === "GET" && req.url === "/") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("WhatsApp webhook is running");
          return;
        }

        // Twilio sends incoming messages as POST to this path
        if (req.method === "POST" && req.url === "/webhook/whatsapp") {
          await this.handleIncomingMessage(req, res);
          return;
        }

        res.writeHead(404);
        res.end();
      });

      server.listen(this.webhookPort, () => resolve());
    });
  }

  private async handleIncomingMessage(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await this.parseFormBody(req);
      const from = body.get("From") || "";   // "whatsapp:+971589115381"
      const text = body.get("Body") || "";

      // Convert Twilio format → JID
      const jid = this.twilioToJid(from);

      if (jid && text && this.messageHandler) {
        console.log(`[WhatsApp] Message from ${jid}: ${text}`);
        try {
          await this.messageHandler(jid, text);
        } catch (err) {
          console.error("[WhatsApp] Error handling message:", err);
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Webhook parse error:", err);
    }

    // Respond with empty TwiML (Twilio expects this; no auto-reply)
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end("<Response></Response>");
  }

  private parseFormBody(req: IncomingMessage): Promise<URLSearchParams> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("error", reject);
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        resolve(new URLSearchParams(raw));
      });
    });
  }

  /**
   * Convert Twilio's "whatsapp:+971589115381" → "971589115381@s.whatsapp.net"
   */
  private twilioToJid(twilioFrom: string): string {
    const phone = twilioFrom.replace("whatsapp:", "").replace("+", "");
    return phone ? `${phone}@s.whatsapp.net` : "";
  }

  /**
   * Convert JID or plain phone to Twilio format.
   *   "971589115381@s.whatsapp.net" → "whatsapp:+971589115381"
   *   "971589115381"                → "whatsapp:+971589115381"
   */
  private jidToTwilio(jid: string): string {
    const phone = jid.replace("@s.whatsapp.net", "");
    return `whatsapp:+${phone}`;
  }
}
