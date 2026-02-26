/**
 * TradeTracker — Records signals, checks outcomes, computes stats.
 *
 * Every signal Goldie produces is recorded with entry/SL/TP.
 * On each heartbeat, the tracker checks live price against open signals
 * to determine wins (TP hit) and losses (SL hit). Stats are fed back
 * to Sonnet so it can learn what's working and stay consistent.
 *
 * Storage: local JSON file (data/<id>/trades.json)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────

export interface TrackedSignal {
  id: string;
  timestamp: string;           // ISO string
  direction: "BUY" | "SELL";
  confidence: number;
  setup: string;               // e.g. "liquidity_sweep", "trend_pullback"
  entry: number;
  stopLoss: number;
  takeProfit: number;          // TP2 (primary target)
  priceAtSignal: number;       // live price when signal was generated
  reasoning: string;
  session: string;             // "london", "new_york", "asian", etc.
  regime: string;              // "TRENDING", "RANGING", etc.
  outcome: "open" | "win" | "loss" | "expired";
  closedAt?: string;           // ISO string when resolved
  closedPrice?: number;
  pnlDollars?: number;
}

export interface TradeStats {
  totalSignals: number;
  wins: number;
  losses: number;
  expired: number;
  open: number;
  winRate: number;             // 0-100
  avgConfidence: number;
  buyWinRate: number;
  sellWinRate: number;
  bestSetup: string;
  worstSetup: string;
  recentSignals: TrackedSignal[];  // last 5 for Sonnet context
  streakType: "win" | "loss" | "none";
  streakCount: number;
}

// ─── TradeTracker ───────────────────────────────────────────────

export class TradeTracker {
  private dataDir: string;
  private tradesFile: string;
  private signals: TrackedSignal[] = [];
  private lotSize: number;

  constructor(employeeId: string, lotSize = 0.02) {
    const projectRoot = resolve(__dirname, "../../../../");
    this.dataDir = resolve(projectRoot, "data", employeeId || "default");
    this.tradesFile = resolve(this.dataDir, "trades.json");
    this.lotSize = lotSize;

    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    this.signals = this.load();
  }

  /**
   * Record a new signal from heartbeat or on-demand analysis.
   */
  recordSignal(params: {
    direction: "BUY" | "SELL";
    confidence: number;
    setup: string;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    priceAtSignal: number;
    reasoning: string;
    session?: string;
    regime?: string;
  }): TrackedSignal {
    const signal: TrackedSignal = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      direction: params.direction,
      confidence: params.confidence,
      setup: params.setup,
      entry: params.entry,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      priceAtSignal: params.priceAtSignal,
      reasoning: params.reasoning,
      session: params.session || "unknown",
      regime: params.regime || "unknown",
      outcome: "open",
    };

    this.signals.push(signal);
    this.save();

    console.log(`[TradeTracker] Recorded: ${signal.direction} @ $${signal.entry.toFixed(2)} (${signal.confidence}% ${signal.setup})`);
    return signal;
  }

  /**
   * Check all open signals against the current price.
   * Resolves wins (price hit TP) and losses (price hit SL).
   * Call this at the start of every heartbeat.
   */
  checkOutcomes(currentPrice: number, high: number, low: number): TrackedSignal[] {
    const resolved: TrackedSignal[] = [];
    const dollarPerPoint = this.lotSize * 100;

    for (const signal of this.signals) {
      if (signal.outcome !== "open") continue;

      // Expire signals older than 4 hours (price has moved too much)
      const ageMs = Date.now() - new Date(signal.timestamp).getTime();
      if (ageMs > 4 * 60 * 60 * 1000) {
        signal.outcome = "expired";
        signal.closedAt = new Date().toISOString();
        signal.closedPrice = currentPrice;
        signal.pnlDollars = 0;
        resolved.push(signal);
        console.log(`[TradeTracker] Expired: ${signal.direction} from ${signal.timestamp}`);
        continue;
      }

      if (signal.direction === "BUY") {
        // Win: high reached TP
        if (high >= signal.takeProfit) {
          signal.outcome = "win";
          signal.closedAt = new Date().toISOString();
          signal.closedPrice = signal.takeProfit;
          signal.pnlDollars = (signal.takeProfit - signal.entry) * dollarPerPoint;
          resolved.push(signal);
          console.log(`[TradeTracker] WIN: BUY $${signal.entry.toFixed(2)} → TP $${signal.takeProfit.toFixed(2)} (+$${signal.pnlDollars.toFixed(2)})`);
        }
        // Loss: low reached SL
        else if (low <= signal.stopLoss) {
          signal.outcome = "loss";
          signal.closedAt = new Date().toISOString();
          signal.closedPrice = signal.stopLoss;
          signal.pnlDollars = (signal.stopLoss - signal.entry) * dollarPerPoint;
          resolved.push(signal);
          console.log(`[TradeTracker] LOSS: BUY $${signal.entry.toFixed(2)} → SL $${signal.stopLoss.toFixed(2)} ($${signal.pnlDollars.toFixed(2)})`);
        }
      } else {
        // SELL: Win if low reached TP
        if (low <= signal.takeProfit) {
          signal.outcome = "win";
          signal.closedAt = new Date().toISOString();
          signal.closedPrice = signal.takeProfit;
          signal.pnlDollars = (signal.entry - signal.takeProfit) * dollarPerPoint;
          resolved.push(signal);
          console.log(`[TradeTracker] WIN: SELL $${signal.entry.toFixed(2)} → TP $${signal.takeProfit.toFixed(2)} (+$${signal.pnlDollars.toFixed(2)})`);
        }
        // SELL: Loss if high reached SL
        else if (high >= signal.stopLoss) {
          signal.outcome = "loss";
          signal.closedAt = new Date().toISOString();
          signal.closedPrice = signal.stopLoss;
          signal.pnlDollars = (signal.entry - signal.stopLoss) * dollarPerPoint;
          resolved.push(signal);
          console.log(`[TradeTracker] LOSS: SELL $${signal.entry.toFixed(2)} → SL $${signal.stopLoss.toFixed(2)} ($${signal.pnlDollars.toFixed(2)})`);
        }
      }
    }

    if (resolved.length > 0) this.save();
    return resolved;
  }

  /**
   * Get comprehensive stats for Sonnet context.
   */
  getStats(): TradeStats {
    const closed = this.signals.filter(s => s.outcome !== "open");
    const wins = closed.filter(s => s.outcome === "win");
    const losses = closed.filter(s => s.outcome === "loss");
    const expired = closed.filter(s => s.outcome === "expired");
    const open = this.signals.filter(s => s.outcome === "open");

    const buyClosed = closed.filter(s => s.direction === "BUY" && s.outcome !== "expired");
    const buyWins = buyClosed.filter(s => s.outcome === "win");
    const sellClosed = closed.filter(s => s.direction === "SELL" && s.outcome !== "expired");
    const sellWins = sellClosed.filter(s => s.outcome === "win");

    // Setup performance
    const setupStats: Record<string, { wins: number; total: number }> = {};
    for (const s of closed.filter(s => s.outcome !== "expired")) {
      if (!setupStats[s.setup]) setupStats[s.setup] = { wins: 0, total: 0 };
      setupStats[s.setup].total++;
      if (s.outcome === "win") setupStats[s.setup].wins++;
    }

    let bestSetup = "none";
    let worstSetup = "none";
    let bestRate = -1;
    let worstRate = 101;
    for (const [setup, stats] of Object.entries(setupStats)) {
      if (stats.total < 2) continue; // need at least 2 trades
      const rate = (stats.wins / stats.total) * 100;
      if (rate > bestRate) { bestRate = rate; bestSetup = `${setup} (${rate.toFixed(0)}% of ${stats.total})`; }
      if (rate < worstRate) { worstRate = rate; worstSetup = `${setup} (${rate.toFixed(0)}% of ${stats.total})`; }
    }

    // Win/loss streak
    let streakType: "win" | "loss" | "none" = "none";
    let streakCount = 0;
    const recentClosed = closed.filter(s => s.outcome !== "expired").slice(-20);
    for (let i = recentClosed.length - 1; i >= 0; i--) {
      const outcome = recentClosed[i].outcome as "win" | "loss";
      if (streakCount === 0) {
        streakType = outcome;
        streakCount = 1;
      } else if (outcome === streakType) {
        streakCount++;
      } else {
        break;
      }
    }

    // Recent signals (last 5 with outcomes)
    const recentSignals = this.signals.slice(-5);

    const totalResolved = wins.length + losses.length;

    return {
      totalSignals: this.signals.length,
      wins: wins.length,
      losses: losses.length,
      expired: expired.length,
      open: open.length,
      winRate: totalResolved > 0 ? (wins.length / totalResolved) * 100 : 0,
      avgConfidence: closed.length > 0
        ? closed.reduce((sum, s) => sum + s.confidence, 0) / closed.length
        : 0,
      buyWinRate: buyClosed.length > 0 ? (buyWins.length / buyClosed.length) * 100 : 0,
      sellWinRate: sellClosed.length > 0 ? (sellWins.length / sellClosed.length) * 100 : 0,
      bestSetup,
      worstSetup,
      recentSignals,
      streakType: streakCount > 0 ? streakType : "none",
      streakCount,
    };
  }

  /**
   * Format stats + recent signals as a context block for Sonnet.
   */
  formatForSonnet(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    if (stats.totalSignals === 0) {
      return "## Signal History\nNo previous signals recorded yet.";
    }

    lines.push("## Signal History & Performance");

    // Overall stats
    const resolved = stats.wins + stats.losses;
    if (resolved > 0) {
      lines.push(`Record: ${stats.wins}W / ${stats.losses}L (${stats.winRate.toFixed(0)}% win rate) | ${stats.expired} expired | ${stats.open} open`);
      lines.push(`BUY win rate: ${stats.buyWinRate.toFixed(0)}% | SELL win rate: ${stats.sellWinRate.toFixed(0)}%`);
      if (stats.bestSetup !== "none") lines.push(`Best setup: ${stats.bestSetup}`);
      if (stats.worstSetup !== "none" && stats.worstSetup !== stats.bestSetup) lines.push(`Worst setup: ${stats.worstSetup}`);
      if (stats.streakCount >= 2) lines.push(`Current streak: ${stats.streakCount} ${stats.streakType}s in a row`);
    }

    // Session performance
    const sessionStats: Record<string, { wins: number; total: number }> = {};
    for (const s of this.signals.filter(s => s.outcome === "win" || s.outcome === "loss")) {
      if (!sessionStats[s.session]) sessionStats[s.session] = { wins: 0, total: 0 };
      sessionStats[s.session].total++;
      if (s.outcome === "win") sessionStats[s.session].wins++;
    }
    const sessionEntries = Object.entries(sessionStats).filter(([, v]) => v.total >= 2);
    if (sessionEntries.length > 0) {
      lines.push(`Session performance: ${sessionEntries.map(([k, v]) => `${k.replace(/_/g, " ")} ${((v.wins / v.total) * 100).toFixed(0)}% (${v.total})`).join(" | ")}`);
    }

    // Recent signals (critical for consistency)
    lines.push("");
    lines.push("### Recent Signals (newest first)");
    const recent = [...stats.recentSignals].reverse();
    for (const s of recent) {
      const age = Math.round((Date.now() - new Date(s.timestamp).getTime()) / 60000);
      const ageStr = age < 60 ? `${age}m ago` : `${(age / 60).toFixed(1)}h ago`;
      const outcomeStr = s.outcome === "open" ? "OPEN"
        : s.outcome === "win" ? `WIN +$${s.pnlDollars?.toFixed(2)}`
        : s.outcome === "loss" ? `LOSS $${s.pnlDollars?.toFixed(2)}`
        : "EXPIRED";
      lines.push(`- ${ageStr}: ${s.direction} ${s.confidence}% (${s.setup}) entry $${s.entry.toFixed(2)} → ${outcomeStr} | "${s.reasoning}"`);
    }

    // Consistency note
    const lastSignal = stats.recentSignals[stats.recentSignals.length - 1];
    if (lastSignal && lastSignal.outcome === "open") {
      const lastAge = Math.round((Date.now() - new Date(lastSignal.timestamp).getTime()) / 60000);
      if (lastAge < 30) {
        lines.push("");
        lines.push(`⚡ CONSISTENCY: Your last signal was ${lastSignal.direction} ${lastSignal.confidence}% just ${lastAge}m ago. Only reverse direction if there is a CLEAR structural change (break of structure, major level sweep, or session transition). Do NOT flip-flop on minor indicator changes.`);
      }
    }

    // Adaptive guidance from performance data
    const guidance = this.getAdaptiveGuidance();
    if (guidance.length > 0) {
      lines.push("");
      lines.push("### Performance-Based Guidance");
      lines.push(...guidance);
    }

    return lines.join("\n");
  }

  /**
   * Generate adaptive guidance lines based on performance data.
   * Tells Sonnet what's working and what isn't, so it can self-correct.
   * Returns empty array if insufficient data.
   */
  getAdaptiveGuidance(): string[] {
    const stats = this.getStats();
    const resolved = stats.wins + stats.losses;
    if (resolved < 5) return []; // need enough data to draw conclusions

    const lines: string[] = [];

    // Direction bias from win rates
    const buyRate = stats.buyWinRate;
    const sellRate = stats.sellWinRate;
    if (Math.abs(buyRate - sellRate) >= 20) {
      if (buyRate > sellRate) {
        lines.push(`ADAPTIVE: BUY signals are ${buyRate.toFixed(0)}% accurate vs SELL at ${sellRate.toFixed(0)}%. Favor BUY setups when structure supports both directions.`);
      } else {
        lines.push(`ADAPTIVE: SELL signals are ${sellRate.toFixed(0)}% accurate vs BUY at ${buyRate.toFixed(0)}%. Favor SELL setups when structure supports both directions.`);
      }
    }

    // Best/worst setup guidance
    if (stats.bestSetup !== "none") {
      lines.push(`ADAPTIVE: Best performing setup: ${stats.bestSetup}. Favor this pattern when you see it.`);
    }
    if (stats.worstSetup !== "none" && stats.worstSetup !== stats.bestSetup) {
      lines.push(`ADAPTIVE: Weakest setup: ${stats.worstSetup}. Require higher confidence threshold for this pattern.`);
    }

    // Session performance guidance
    const sessionStats: Record<string, { wins: number; total: number }> = {};
    for (const s of this.signals.filter(s => s.outcome === "win" || s.outcome === "loss")) {
      if (!sessionStats[s.session]) sessionStats[s.session] = { wins: 0, total: 0 };
      sessionStats[s.session].total++;
      if (s.outcome === "win") sessionStats[s.session].wins++;
    }

    let bestSession = "";
    let bestSessionRate = 0;
    let worstSession = "";
    let worstSessionRate = 100;
    for (const [session, data] of Object.entries(sessionStats)) {
      if (data.total < 3) continue;
      const rate = (data.wins / data.total) * 100;
      if (rate > bestSessionRate) { bestSessionRate = rate; bestSession = session; }
      if (rate < worstSessionRate) { worstSessionRate = rate; worstSession = session; }
    }
    if (bestSession && bestSessionRate >= 60) {
      lines.push(`ADAPTIVE: Best session: ${bestSession.replace(/_/g, " ")} (${bestSessionRate.toFixed(0)}% win rate). Higher confidence trades here.`);
    }
    if (worstSession && worstSessionRate <= 40 && worstSession !== bestSession) {
      lines.push(`ADAPTIVE: Weak session: ${worstSession.replace(/_/g, " ")} (${worstSessionRate.toFixed(0)}% win rate). Be more selective here.`);
    }

    // Losing streak warning
    if (stats.streakType === "loss" && stats.streakCount >= 3) {
      lines.push(`⚠️ ADAPTIVE: ${stats.streakCount}-loss streak active. Require confidence ≥ 60% and strong multi-TF alignment before signaling.`);
    }

    // Confidence calibration — are high-confidence trades actually winning?
    const highConf = this.signals.filter(s => s.confidence >= 60 && (s.outcome === "win" || s.outcome === "loss"));
    const lowConf = this.signals.filter(s => s.confidence < 60 && s.confidence > 0 && (s.outcome === "win" || s.outcome === "loss"));
    if (highConf.length >= 5) {
      const highWinRate = (highConf.filter(s => s.outcome === "win").length / highConf.length) * 100;
      if (highWinRate < 50) {
        lines.push(`⚠️ ADAPTIVE: High-confidence (≥60%) signals are only winning ${highWinRate.toFixed(0)}% of the time. You may be over-confident — be more critical of your setups.`);
      }
    }
    if (lowConf.length >= 5) {
      const lowWinRate = (lowConf.filter(s => s.outcome === "win").length / lowConf.length) * 100;
      if (lowWinRate > 60) {
        lines.push(`ADAPTIVE: Low-confidence (<60%) signals are winning ${lowWinRate.toFixed(0)}%. You may be under-confident — trust your analysis more.`);
      }
    }

    return lines;
  }

  /**
   * Format a brief WhatsApp-friendly outcome summary.
   */
  formatOutcomeMessage(resolved: TrackedSignal[]): string {
    if (resolved.length === 0) return "";
    const lines: string[] = ["📊 *Trade Outcomes:*"];
    for (const s of resolved) {
      const emoji = s.outcome === "win" ? "✅" : s.outcome === "loss" ? "❌" : "⏰";
      const pnl = s.pnlDollars ? ` ($${s.pnlDollars > 0 ? "+" : ""}${s.pnlDollars.toFixed(2)})` : "";
      lines.push(`${emoji} ${s.direction} $${s.entry.toFixed(2)} → ${s.outcome.toUpperCase()}${pnl}`);
    }
    const stats = this.getStats();
    const resolved_count = stats.wins + stats.losses;
    if (resolved_count >= 3) {
      lines.push(`_Record: ${stats.wins}W/${stats.losses}L (${stats.winRate.toFixed(0)}%)_`);
    }
    return lines.join("\n");
  }

  // ─── Persistence ──────────────────────────────────────────────

  private load(): TrackedSignal[] {
    try {
      if (!existsSync(this.tradesFile)) return [];
      const raw = readFileSync(this.tradesFile, "utf-8");
      return JSON.parse(raw) as TrackedSignal[];
    } catch {
      return [];
    }
  }

  private save(): void {
    // Keep last 200 signals
    const trimmed = this.signals.slice(-200);
    this.signals = trimmed;
    writeFileSync(this.tradesFile, JSON.stringify(trimmed, null, 2));
  }
}
