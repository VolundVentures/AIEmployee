import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { rmSync } from "fs";

const logger = pino({ level: "silent" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MessageHandler {
  (jid: string, text: string, message: proto.IWebMessageInfo): Promise<void>;
}

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private authDir: string;
  private authCleared = false; // Only clear auth once per run to avoid loops

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

        console.log(
          `[WhatsApp] Connection closed. Reason: ${DisconnectReason[reason] || reason}.`
        );

        // 405 = stale session, 401 = unauthorized
        if (reason === 405 || reason === 401) {
          if (!this.authCleared) {
            this.authCleared = true;
            console.log("[WhatsApp] Session expired. Clearing auth state...");
            try { rmSync(this.authDir, { recursive: true, force: true }); } catch {}
            console.log("[WhatsApp] Reconnecting in 3 seconds (you'll need to scan a new QR)...");
            await sleep(3000);
            this.connect();
          } else {
            console.log("[WhatsApp] Auth already cleared but still failing.");
            console.log("[WhatsApp] Please restart the bot and scan the QR code when it appears.");
          }
          return;
        }

        if (reason === DisconnectReason.loggedOut) {
          console.log("[WhatsApp] Logged out. Restart the bot to re-scan QR.");
          return;
        }

        // For other transient errors, reconnect with a delay
        console.log("[WhatsApp] Reconnecting in 3 seconds...");
        await sleep(3000);
        this.connect();
      }

      if (connection === "open") {
        this.authCleared = false; // Reset on successful connection
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
