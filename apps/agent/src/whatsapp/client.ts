import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  proto,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { rmSync, existsSync } from "fs";
import { EventEmitter } from "events";

const logger = pino({ level: "silent" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MessageHandler {
  (jid: string, text: string, message: proto.IWebMessageInfo): Promise<void>;
}

/**
 * Robust WhatsApp client built on Baileys.
 *
 * Key design decisions:
 *   - Uses Browsers.windows('Chrome') so WhatsApp sees a real platform
 *     (custom strings like "Journeyman" cause 405 rejections).
 *   - Renders QR codes visually in the terminal via qrcode-terminal.
 *   - Tracks actual connection state; sendMessage gracefully skips when
 *     disconnected instead of crashing.
 *   - On persistent 405 (bad routingInfo / stale creds), clears auth
 *     automatically so a fresh QR appears.
 *   - Each reconnect tears down old socket + listeners first (no leak).
 *   - Emits "ready" event so callers can await actual connection.
 */
export class WhatsAppClient extends EventEmitter {
  private socket: WASocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private authDir: string;
  private connected = false;
  private retryCount = 0;
  private maxRetries = 8;
  private stopped = false;
  private everConnected = false; // tracks if we EVER opened successfully with current auth

  constructor(authDir = "./baileys_auth") {
    super();
    this.authDir = authDir;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  /** Whether the connection is open and ready to send. */
  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  /**
   * Connect to WhatsApp.
   * Resolves when the connection is open, or after the first QR is shown
   * (so the caller isn't blocked forever waiting for a scan).
   */
  async connect(): Promise<void> {
    this.stopped = false;
    this.retryCount = 0;

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      // Resolve on first "open" or first "qr" (so main() doesn't hang)
      this.once("ready", done);
      this.once("qr", done);

      this.startSocket();
    });
  }

  /**
   * Create a fresh socket, tearing down any previous one.
   * This is the core reconnection loop — never call connect() recursively.
   */
  private async startSocket(): Promise<void> {
    if (this.stopped) return;

    // Clean up previous socket
    if (this.socket) {
      this.socket.ev.removeAllListeners("connection.update");
      this.socket.ev.removeAllListeners("creds.update");
      this.socket.ev.removeAllListeners("messages.upsert");
      try { this.socket.end(undefined); } catch {}
      this.socket = null;
    }

    this.connected = false;

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

    this.socket = makeWASocket({
      auth: state,
      logger,
      // Use a real browser fingerprint. Custom strings get 405'd.
      browser: Browsers.windows("Chrome"),
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 25_000,
    });

    this.socket.ev.on("creds.update", saveCreds);

    this.socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR code ──────────────────────────────────────────
      if (qr) {
        console.log("\n[WhatsApp] Scan this QR code with WhatsApp:");
        console.log("[WhatsApp] Open WhatsApp > Settings > Linked Devices > Link a Device\n");
        qrcode.generate(qr, { small: true });
        this.emit("qr", qr);
      }

      // ── Connected ────────────────────────────────────────
      if (connection === "open") {
        this.connected = true;
        this.retryCount = 0;
        this.everConnected = true;
        console.log("[WhatsApp] Connected successfully!");
        this.emit("ready");
      }

      // ── Disconnected ─────────────────────────────────────
      if (connection === "close") {
        this.connected = false;
        const statusCode =
          (lastDisconnect?.error as Boom)?.output?.statusCode ?? 0;
        const reasonName = DisconnectReason[statusCode] || String(statusCode);

        console.log(
          `[WhatsApp] Disconnected: ${reasonName} (${statusCode})`
        );

        // ── loggedOut (401): user explicitly unpaired ──
        if (statusCode === DisconnectReason.loggedOut) {
          console.log("[WhatsApp] Logged out by user. Clearing session...");
          this.clearAuth();
          console.log("[WhatsApp] Restart the bot to scan a new QR code.");
          this.stopped = true;
          return;
        }

        // ── 405 / 500: bad session / stale routingInfo ──
        // If we've never connected with this auth, the creds are bad.
        // Clear immediately instead of wasting retries on dead auth.
        if (
          (statusCode === 405 || statusCode === 500) &&
          !this.everConnected
        ) {
          if (existsSync(this.authDir)) {
            console.log(
              "[WhatsApp] Session rejected (stale auth). Clearing for fresh QR..."
            );
            this.clearAuth();
            // Reset retry count — we're starting fresh
            this.retryCount = 0;
            await sleep(2000);
            this.startSocket();
            return;
          }
        }

        // ── Generic retry with exponential backoff ──
        this.retryCount++;

        if (this.retryCount > this.maxRetries) {
          console.log(
            `[WhatsApp] Failed after ${this.maxRetries} attempts. Stopping.`
          );
          console.log("[WhatsApp] Restart the bot to try again.");
          this.stopped = true;
          return;
        }

        // 2s → 4s → 8s → 16s → 30s → 30s → ...
        const delay = Math.min(
          2000 * Math.pow(2, this.retryCount - 1),
          30_000
        );
        console.log(
          `[WhatsApp] Reconnecting ${this.retryCount}/${this.maxRetries} in ${(delay / 1000).toFixed(0)}s...`
        );
        await sleep(delay);
        this.startSocket();
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
        console.log(`[WhatsApp] Auth cleared: ${this.authDir}`);
      }
    } catch (err) {
      console.error("[WhatsApp] Failed to clear auth:", err);
    }
    this.everConnected = false;
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.isConnected()) {
      console.warn("[WhatsApp] Cannot send — not connected. Skipping.");
      return;
    }
    await this.socket!.sendMessage(jid, { text });
  }

  getSocket(): WASocket | null {
    return this.socket;
  }
}
