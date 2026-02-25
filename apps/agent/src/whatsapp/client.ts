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

  /**
   * Track recently-processed Twilio MessageSids so we can deduplicate
   * retries.  Twilio re-sends the webhook if we don't reply within 15 s
   * (or if the first attempt hit a network blip).  Without dedup, each
   * retry triggers a full AI processing pass + an extra reply — which
   * confuses the sandbox and can cause it to disconnect.
   */
  private processedMessages = new Set<string>();
  private readonly DEDUP_TTL_MS = 5 * 60 * 1000; // keep SIDs for 5 min

  constructor(_authDir?: string) {
    super();
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
   * Send a WhatsApp message, automatically splitting into chunks if it
   * exceeds Twilio's 1600-character limit for sandbox numbers.
   */
  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.connected || !this.twilioClient) {
      console.warn("[WhatsApp] Cannot send — not connected. Skipping.");
      return;
    }

    const chunks = this.splitMessage(text, 1500);

    const from = `whatsapp:${this.twilioNumber}`;
    const to = this.jidToTwilio(jid);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const label = chunks.length > 1 ? ` [${i + 1}/${chunks.length}]` : "";
      console.log(`[WhatsApp] Sending${label}: from=${from} to=${to} body="${chunk.slice(0, 80)}..."`);

      try {
        const result = await this.twilioClient.messages.create({
          body: chunk,
          from,
          to,
        });
        console.log(`[WhatsApp] Sent OK${label} (SID: ${result.sid})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[WhatsApp] Failed to send message${label}: ${msg}`);

        // Detect sandbox session expiry (Twilio error 63016 / 63007)
        // and other "not opted in" errors so the user knows to rejoin.
        const errStr = String(msg).toLowerCase();
        if (
          errStr.includes("63016") ||
          errStr.includes("63007") ||
          errStr.includes("not opted") ||
          errStr.includes("freeform") ||
          errStr.includes("outside the allowed window")
        ) {
          console.error(
            "[WhatsApp] *** SANDBOX SESSION EXPIRED ***\n" +
            '  The user must re-send "join <keyword>" to the sandbox number\n' +
            "  to re-activate the 72-hour session window."
          );
        }
      }

      // Small delay between chunks to preserve ordering
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  /**
   * Split text into chunks of at most `maxLen` characters, breaking on
   * newline boundaries so messages stay readable.
   */
  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Find the last newline within the limit
      let breakAt = remaining.lastIndexOf("\n", maxLen);
      if (breakAt <= 0) {
        // No newline found — break at a space
        breakAt = remaining.lastIndexOf(" ", maxLen);
      }
      if (breakAt <= 0) {
        // No space either — hard break
        breakAt = maxLen;
      }

      chunks.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + 1); // +1 to skip the newline/space
    }

    return chunks;
  }

  getSocket(): null {
    return null;
  }

  // ─── Private helpers ─────────────────────────────────────

  private startWebhookServer(): Promise<void> {
    return new Promise((resolve) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // Wrap in a sync try-catch — the async work is handled inside
        // with its own error boundaries.  This prevents unhandled promise
        // rejections from crashing the process.
        try {
          // Health check
          if (req.method === "GET" && req.url === "/") {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("WhatsApp webhook is running");
            return;
          }

          // Twilio sends incoming messages as POST to this path
          if (req.method === "POST" && req.url === "/webhook/whatsapp") {
            this.handleIncomingMessage(req, res).catch((err) => {
              console.error("[WhatsApp] Unhandled webhook error:", err);
              // Make sure we always respond so Twilio doesn't retry
              if (!res.headersSent) {
                res.writeHead(200, { "Content-Type": "text/xml" });
                res.end("<Response></Response>");
              }
            });
            return;
          }

          res.writeHead(404);
          res.end();
        } catch (err) {
          console.error("[WhatsApp] Sync webhook error:", err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          }
        }
      });

      server.listen(this.webhookPort, () => resolve());
    });
  }

  private async handleIncomingMessage(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // ── Step 1: respond to Twilio IMMEDIATELY ──
    // Their webhook has a 15-second timeout.  If we don't reply fast,
    // Twilio marks the webhook as failed and retries, causing duplicates
    // and eventually disconnecting the sandbox session.
    let jid = "";
    let text = "";
    let messageSid = "";

    try {
      const body = await this.parseFormBody(req);
      const from = body.get("From") || "";   // "whatsapp:+971589115381"
      text = body.get("Body") || "";
      messageSid = body.get("MessageSid") || body.get("SmsSid") || "";
      jid = this.twilioToJid(from);

      console.log(`[WhatsApp] Webhook received -- SID: ${messageSid}, From: ${from}, Body: "${text}"`);
    } catch (err) {
      console.error("[WhatsApp] Webhook parse error:", err);
    }

    // Always reply 200 with empty TwiML so Twilio knows we got it
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end("<Response></Response>");

    // ── Step 2: deduplicate Twilio retries ──
    // Twilio resends the same MessageSid on retry.  If we've already
    // started processing this message, skip the duplicate.
    if (messageSid) {
      if (this.processedMessages.has(messageSid)) {
        console.log(`[WhatsApp] Duplicate webhook (SID: ${messageSid}) -- ignoring`);
        return;
      }
      this.processedMessages.add(messageSid);
      // Auto-clean after TTL to prevent unbounded memory growth
      setTimeout(() => this.processedMessages.delete(messageSid), this.DEDUP_TTL_MS);
    }

    // ── Step 3: process message in the background ──
    if (!jid) {
      console.warn("[WhatsApp] Could not parse sender JID, skipping.");
    } else if (!text) {
      console.warn("[WhatsApp] Empty message body, ignoring.");
    } else if (!this.messageHandler) {
      console.warn("[WhatsApp] No message handler registered!");
    } else {
      console.log(`[WhatsApp] Processing message from ${jid}: ${text}`);
      this.messageHandler(jid, text).catch((err) => {
        console.error("[WhatsApp] Error handling message:", err);
      });
    }
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
