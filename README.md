# Goldie

**AI-powered XAUUSD (Gold) trading signals via WhatsApp.**

By [Volund Ventures](https://volund.ventures).

## What It Does

Goldie runs a heartbeat every 15 minutes during market hours:

1. Fetches multi-timeframe market data (4H, 1H, 15M)
2. Computes 15+ technical indicators (EMA, RSI, MACD, ATR, pivots, VWAP, ADX, etc.)
3. Detects price structure: swing points, Fair Value Gaps, Order Blocks, liquidity levels
4. Feeds everything to Claude Sonnet for Smart Money analysis
5. Sends a trade signal (BUY/SELL with entry, stop, targets) via WhatsApp
6. Saves context to memory for continuity across heartbeats

Automatically pauses when the market is closed (weekends + daily maintenance).

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, Twilio creds, ALERT_PHONE

# Run
npm run dev
```

## WhatsApp Commands

| Command | Shortcut | What it does |
|---------|----------|-------------|
| `signal` | `s` | Full trading signal |
| `price` | `p` | Current gold price |
| `overview` | `o` | Multi-timeframe snapshot |
| `heartbeat` | `hb` | Run analysis now |
| `help` | `h` | Show commands |

Or just chat naturally — Goldie answers gold-related questions.

## Architecture

```
goldie/
└── apps/agent/src/
    ├── trading-bot.ts       # Entry point + heartbeat loop
    ├── trading/
    │   ├── strategy-engine  # Sonnet-powered trade decisions
    │   ├── signal-engine    # Multi-TF indicator analysis
    │   ├── indicators       # 15+ technical indicators (pure TS)
    │   ├── market-data      # Yahoo Finance + Twelve Data
    │   ├── tools            # WhatsApp tool definitions
    │   └── persona          # Goldie's personality
    ├── agent/engine          # Claude API client + tool loop
    ├── memory/store          # Local JSON persistence
    └── whatsapp/client       # Twilio WhatsApp integration
```

## Environment Variables

See `.env.example` for the full list. Key ones:

- `ANTHROPIC_API_KEY` — Claude API key (required)
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` — WhatsApp via Twilio
- `ALERT_PHONE` — Your WhatsApp number to receive signals
- `TWELVE_DATA_API_KEY` — Better market data (optional, falls back to Yahoo Finance)
- `ACCOUNT_SIZE` / `LOT_SIZE` / `RISK_PERCENT` — Trading account config

## License

Proprietary. Copyright Volund Ventures.
