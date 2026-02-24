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

export interface MessageHandler {
  (jid: string, text: string, message: proto.IWebMessageInfo): Promise<void>;
}

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private authDir: string;

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

    this.socket.ev.on("connection.update", (update) => {
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

        // 405 = stale session, 401 = unauthorized -- clear auth and reconnect
        if (reason === 405 || reason === 401) {
          console.log("[WhatsApp] Session expired. Clearing auth state and reconnecting...");
          try { rmSync(this.authDir, { recursive: true, force: true }); } catch {}
          this.connect();
          return;
        }

        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log("[WhatsApp] Reconnecting...");
          this.connect();
        } else {
          console.log("[WhatsApp] Logged out. Delete the auth folder and restart to re-scan QR.");
        }
      }

      if (connection === "open") {
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
