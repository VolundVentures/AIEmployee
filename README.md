# Journeyman

**AI employees that learn your business, acquire skills on the fly, and get work done -- delivered through WhatsApp.**

By [Volund Ventures](https://volund.ventures).

## Quick Start

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- A [Supabase](https://supabase.com/) project (free tier works)
- A phone number for WhatsApp (the bot will use this number)

### Setup

```bash
# Clone and install
git clone <repo-url> journeyman
cd journeyman
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Set up the database
# Copy the contents of packages/db/schema.sql into your Supabase SQL editor and run it

# Start the web app
npm run dev:web

# Start the WhatsApp agent (in another terminal)
npm run dev:agent
# Scan the QR code with your WhatsApp app
```

### First Run

1. Start the agent -- it will show a QR code in terminal
2. Scan the QR code with WhatsApp on your phone
3. Send a message to the connected number from any WhatsApp account
4. Atlas (your AI Chief of Staff) will respond

## Architecture

```
journeyman/
├── apps/
│   ├── web/        # Next.js 15 web platform (landing, onboarding, dashboard)
│   └── agent/      # WhatsApp agent backend (Baileys + Claude Agent SDK)
└── packages/
    ├── db/         # Supabase client + schema
    └── shared/     # Types + constants shared across apps
```

### Smart Model Routing

Messages are routed to the optimal model tier for cost efficiency:

| Complexity | Model | Speed | Use Case |
|-----------|-------|-------|----------|
| Simple | Haiku 4.5 | <1s | Greetings, status, lookups |
| Moderate | Sonnet 4.6 | 2-5s | Drafting, analysis, summaries |
| Complex | Opus 4.6 | 10-20s | Research, strategy, code |

## Development

```bash
npm run dev         # Run all apps
npm run dev:web     # Web app only (localhost:3000)
npm run dev:agent   # WhatsApp agent only
npm run build       # Build all
```

## License

Proprietary. Copyright Volund Ventures.
