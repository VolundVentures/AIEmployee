import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { rmSync, existsSync } from "fs";

const logger = pino({ level: "silent" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MessageHandler {
  (jid: string, text: string, message: proto.IWebMessageInfo): Promise<void>;
}

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private authDir: string;
  private retryCount = 0;
  private maxRetries = 5;

  constructor(authDir = "./baileys_auth") {
    this.authDir = authDir;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.socket = makeWASocket({
      auth: state,
      logger,
      browser: ["Journeyman", "Chrome", "1.0.0"],
    });

    this.socket.ev.on("creds.update", saveCreds);

    this.socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n[WhatsApp] Scan this QR code with your WhatsApp app:");
        console.log("[WhatsApp] Open WhatsApp > Settings > Linked Devices > Link a Device\n");
        console.log(qr);
        console.log();
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reasonName = DisconnectReason[reason] || String(reason);

        console.log(`[WhatsApp] Connection closed. Reason: ${reasonName} (${reason}).`);

        // loggedOut = user explicitly unpaired. Clear auth and stop.
        if (reason === DisconnectReason.loggedOut) {
          console.log("[WhatsApp] Logged out by user. Clearing session...");
          try { rmSync(this.authDir, { recursive: true, force: true }); } catch {}
          console.log("[WhatsApp] Restart the bot to get a fresh QR code.");
          return;
        }

        // Everything else (405, 408, 428, 440, 500, 515, etc.) = transient.
        // Reconnect with exponential backoff.
        this.retryCount++;

        if (this.retryCount > this.maxRetries) {
          console.log(`[WhatsApp] Failed after ${this.maxRetries} retries. Giving up.`);
          console.log("[WhatsApp] Try these steps:");
          console.log("  1. Stop the bot");
          if (existsSync(this.authDir)) {
            console.log(`  2. Delete the auth folder: rm -rf ${this.authDir}`);
            console.log("  3. Restart the bot and scan the new QR code");
          } else {
            console.log("  2. Restart the bot and scan the QR code");
          }
          return;
        }

        const delay = Math.min(2000 * Math.pow(2, this.retryCount - 1), 60000);
        console.log(`[WhatsApp] Retry ${this.retryCount}/${this.maxRetries} in ${delay / 1000}s...`);
        await sleep(delay);
        this.connect();
      }

      if (connection === "open") {
        this.retryCount = 0; // Reset on successful connection
        console.log("[WhatsApp] Connected successfully!");
      }
    });

    this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text;

        if (!text) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        console.log(`[WhatsApp] Message from ${jid}: ${text}`);

        if (this.messageHandler) {
          try {
            await this.messageHandler(jid, text, msg);
          } catch (err) {
            console.error("[WhatsApp] Error handling message:", err);
          }
        }
      }
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.socket) {
      throw new Error("WhatsApp client not connected");
    }
    await this.socket.sendMessage(jid, { text });
  }

  getSocket(): WASocket | null {
    return this.socket;
  }
}
