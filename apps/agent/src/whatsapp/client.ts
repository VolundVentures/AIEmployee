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
  private connected = false;
  private retryCount = 0;
  private maxRetries = 6;
  private connecting = false;

  constructor(authDir = "./baileys_auth") {
    this.authDir = authDir;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  /** Whether the WhatsApp connection is open and ready to send messages. */
  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  /**
   * Connect to WhatsApp. This is the only public entry point.
   * Internally handles reconnection without stacking event listeners.
   */
  async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;

    try {
      await this.createSocket();
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Creates a new socket, tearing down any previous one.
   * All event listeners are attached fresh each time.
   */
  private async createSocket(): Promise<void> {
    // Tear down previous socket to prevent listener leaks
    if (this.socket) {
      this.socket.ev.removeAllListeners("connection.update");
      this.socket.ev.removeAllListeners("creds.update");
      this.socket.ev.removeAllListeners("messages.upsert");
      this.socket.end(undefined);
      this.socket = null;
    }

    this.connected = false;

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

      if (connection === "open") {
        this.connected = true;
        this.retryCount = 0;
        console.log("[WhatsApp] Connected successfully!");
      }

      if (connection === "close") {
        this.connected = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reasonName = DisconnectReason[statusCode] || String(statusCode);

        console.log(`[WhatsApp] Connection closed. Reason: ${reasonName} (${statusCode}).`);

        // ── loggedOut (401): user explicitly unpaired. Clear auth and stop. ──
        if (statusCode === DisconnectReason.loggedOut) {
          console.log("[WhatsApp] Logged out by user. Clearing session...");
          this.clearAuth();
          console.log("[WhatsApp] Restart the bot to get a fresh QR code.");
          return;
        }

        // ── All other errors: reconnect with backoff. ──
        // 405 = server rejected connection (usually stale session)
        // 408 = timed out
        // 428 = connection replaced (opened on another device)
        // 440 = multidevice mismatch
        // 500 = bad session
        // 515 = restart required
        this.retryCount++;

        // After 3 consecutive failures with 405/500, the session is likely
        // corrupted. Clear auth so we get a fresh QR on the next attempt.
        if (
          this.retryCount === 3 &&
          (statusCode === 405 || statusCode === 500)
        ) {
          console.log("[WhatsApp] Persistent 405/500 -- session appears corrupted.");
          console.log("[WhatsApp] Clearing auth to force fresh QR code...");
          this.clearAuth();
          // Don't return -- fall through to retry, which will show a QR code
        }

        if (this.retryCount > this.maxRetries) {
          console.log(`[WhatsApp] Failed after ${this.maxRetries} attempts. Stopping.`);
          console.log("[WhatsApp] Restart the bot to try again.");
          return;
        }

        const delay = Math.min(2000 * Math.pow(2, this.retryCount - 1), 60000);
        console.log(`[WhatsApp] Retry ${this.retryCount}/${this.maxRetries} in ${delay / 1000}s...`);
        await sleep(delay);

        // Create a fresh socket (tears down old listeners first)
        await this.createSocket();
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

  private clearAuth(): void {
    try {
      if (existsSync(this.authDir)) {
        rmSync(this.authDir, { recursive: true, force: true });
        console.log(`[WhatsApp] Auth folder deleted: ${this.authDir}`);
      }
    } catch (err) {
      console.error("[WhatsApp] Failed to clear auth:", err);
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.isConnected()) {
      console.warn("[WhatsApp] Cannot send message -- not connected. Skipping.");
      return;
    }
    await this.socket!.sendMessage(jid, { text });
  }

  getSocket(): WASocket | null {
    return this.socket;
  }
}
