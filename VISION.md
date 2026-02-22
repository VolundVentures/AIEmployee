# Journeyman - Product Vision

> AI employees that learn, adapt, and get work done -- delivered through WhatsApp.

**By Volund Ventures**

---

## The Core Insight

AI has reached a capability threshold where it can genuinely own outcomes, not just assist with tasks. Today's AI tools (ChatGPT, Copilot, etc.) are task assistants -- you ask, they answer, you do the work. Journeyman is different: **you assign work, it delivers results.** Like a real employee.

## What Is Journeyman?

Journeyman is a platform where businesses can hire AI employees on WhatsApp. Each AI employee:

1. **Gets onboarded** like a real team member -- learns your company, your data, your preferences
2. **Has a name, persona, and role** -- "Sara handles customer support, Ahmed manages operations"
3. **Self-equips** -- dynamically acquires skills and tools as needed, like a journeyman traveling between masters to learn new crafts
4. **Works autonomously** -- executes tasks, asks questions when stuck, and reports back with results
5. **Collaborates** -- AI employees can work with each other and with human team members

## Why WhatsApp?

We're starting from the UAE, where WhatsApp is THE business communication tool. Benefits:

- **Zero adoption friction** -- businesses already run on WhatsApp
- **Natural interface** -- assigning work feels like messaging a team member
- **No new app to learn** -- the AI employee lives where your team already communicates
- **Mobile-first** -- business owners in MENA manage everything from their phones

## The Three Differentiators

### 1. Deep Company Context & Memory
The AI employee doesn't start from zero every conversation. It accumulates knowledge about your business over time -- your customers, your processes, your preferences, your tone. The longer it works for you, the better it gets. Like a real employee building institutional knowledge.

### 2. Self-Equipping (Dynamic Skills)
When a task requires a capability the AI employee doesn't have, it acquires it on the fly. Need to generate invoices? It finds and installs that skill. Need to analyze a spreadsheet? It equips itself. Like a journeyman craftsman who travels to learn new trades as needed.

### 3. Multi-Agent Teamwork
AI employees can collaborate with each other and with humans. Your AI customer support agent can escalate to your AI operations manager, who can loop in a human when needed. A team of AI employees working together, coordinated through the same WhatsApp groups your human team uses.

## Target Customer

**To be validated.** Initial hypotheses to test:

- Solo founders and freelancers in UAE/MENA who need to multiply their output
- Small businesses (2-20 people) that can't afford to hire for every role
- Service businesses (agencies, consultancies) that need to scale operations
- E-commerce businesses managing customer inquiries and operations on WhatsApp

The dogfooding approach will help us discover the ideal customer: **Journeyman's first AI employee runs the Journeyman startup itself.** The product is its own first customer. If it can run its own operations, that's the ultimate proof of concept.

## Business Model

**Subscription per AI employee** -- framed as a "salary."

You hire an AI employee and pay it a monthly salary. Pricing tiers based on capability:

| Tier | Monthly Salary | Description |
|------|---------------|-------------|
| Intern | Free | Limited tasks/month, basic skills, supervised mode only |
| Junior | $49/mo | Core skills, moderate autonomy, single-role focus |
| Senior | $149/mo | Advanced skills, full autonomy, multi-role capable |
| Lead | $299/mo | Premium skills, team coordination, priority execution |

This "salary" framing is powerful because:
- It's intuitive -- people understand paying employees
- It creates an emotional connection -- "my AI employee"
- It scales naturally -- hire more AI employees as you grow
- It sets the right expectations -- employees need onboarding, get better over time

## Autonomy Model

**Configurable per task.** The user sets the autonomy level when assigning work:

- **Supervised** -- AI checks in before every major action ("I'm about to send this email, OK?")
- **Semi-autonomous** -- AI works independently, posts updates, asks for help when stuck
- **Fully autonomous** -- AI executes end-to-end and delivers results

Over time, as trust builds, users naturally increase autonomy -- just like with a real employee.

## Technical Architecture

### The Full Platform

Journeyman is a **two-surface platform**:

1. **Web App** (Next.js) -- Where customers sign up, onboard their company, create AI employees, manage tasks, monitor activity, and handle billing. This is the control plane.
2. **WhatsApp** (Baileys → Cloud API) -- Where AI employees actually work. The primary interaction surface. Assigning tasks, getting results, approving actions -- all happens in chat.

### Smart Agent Orchestration

Running every task through the most powerful model (Claude Opus 4.6) would cost ~$2,000/month at scale. That makes a $49/employee product unsustainable. Instead, we use **tiered model routing**:

| Task Complexity | Model | Cost | Speed | Examples |
|----------------|-------|------|-------|----------|
| Simple | Haiku 4.5 | $1/$5 per M tokens | <1s | FAQ, status checks, simple lookups |
| Moderate | Sonnet 4.6 | $3/$15 per M tokens | 2-5s | Drafting, summarization, structured analysis |
| Complex | Opus 4.6 | $5/$25 per M tokens | 10-20s | Research, strategy, multi-step reasoning, code |

**How it works:**
1. Message arrives → regex pre-filter catches simple commands (no LLM needed, ~20% of messages)
2. Haiku 4.5 classifies remaining messages as SIMPLE / MODERATE / COMPLEX (~$0.001 per classification)
3. Routes to the appropriate model tier
4. If the chosen model's confidence is low, automatically escalates to the next tier

**Result:** ~$260/month for 30K messages (vs. $2,000+ with Opus for everything). Strong unit economics even at the $49 Junior tier.

### Agent Backend: Claude Agent SDK
Built on the Claude Agent SDK, leveraging:
- Native tool use for interacting with external systems
- Structured outputs for reliable task execution
- Long context for maintaining company knowledge
- The skills ecosystem for dynamic capability acquisition
- MCP (Model Context Protocol) for standardized tool connections

### Key Technical Components
- **Web Platform** -- Next.js 15 + Supabase: signup, onboarding wizard, employee dashboard, task board, billing
- **Model Router** -- Tiered routing: Haiku for simple, Sonnet for moderate, Opus for complex tasks
- **Onboarding Engine** -- Web wizard + WhatsApp flow to capture company context, data, and preferences
- **Memory System** -- Supabase PostgreSQL + pgvector: persistent, evolving knowledge base per AI employee
- **Skill Registry** -- Dynamic skill discovery via skills.sh ecosystem + custom MCP tools
- **Orchestration Layer** -- Multi-agent coordination and task routing
- **WhatsApp Integration** -- Baileys (MVP) → WhatsApp Cloud API (production)
- **Autonomy Controller** -- Per-task autonomy settings and approval workflows

## MVP Strategy: Dogfooding

Build Journeyman and use it to run itself. The Journeyman startup is Journeyman's first customer.

### Phase 1: Build for Ourselves (Week 1)
- Ship the full platform: web app (onboarding, dashboard) + WhatsApp agent backend
- Create the first AI employee that runs the Journeyman startup operations
- It handles: customer/beta user communications, market research, content drafting, task tracking
- All operate through WhatsApp, managed via the web dashboard

### Phase 2: Learn and Iterate
- What works? What breaks? Where does it need human intervention?
- Which skills does it need to acquire most often?
- How does the memory system perform over weeks/months?
- What autonomy level feels right for different task types?

### Phase 3: Productize
- Package what works into a product others can use
- Open up onboarding flow for external users
- Launch in UAE market with WhatsApp-first experience
- Build the skill marketplace

### First Milestone
A single AI employee on WhatsApp that can:
- Be onboarded with company context (name, role, knowledge base)
- Receive and understand task assignments via WhatsApp messages
- Execute basic tasks (draft messages, summarize information, answer questions from knowledge base)
- Acquire new skills when encountering unfamiliar task types
- Ask clarifying questions when autonomy settings require it
- Report task completion with results

## Market Expansion Path

### Starting Point: UAE / MENA
- WhatsApp is the dominant business communication platform
- High cost of hiring relative to startup budgets
- Fast-growing startup ecosystem (Dubai, Abu Dhabi, Riyadh, Cairo)
- English + Arabic bilingual market

### Next: WhatsApp-Dominant Emerging Markets
- Southeast Asia (Indonesia, India, Philippines)
- Latin America (Brazil, Mexico, Colombia)

### Eventually: Global, Multi-Platform
- Add Slack, Teams, Telegram as additional interfaces
- Web dashboard for management and analytics

## The Name: Journeyman

In the traditional guild system, a **journeyman** is a skilled worker who has completed their apprenticeship and travels between masters to learn different crafts. The name captures everything about the product:

- **Skilled and independent** -- capable of doing real work on their own
- **Always learning** -- travels to acquire new skills (dynamic skill acquisition)
- **Growth trajectory** -- apprentice to journeyman to master (the AI employee levels up)
- **Craftsmanship** -- connected to Volund (V&ouml;lundr), the legendary Norse master craftsman
- **Journey** -- the word itself implies progression and adaptability

## Open Questions

These are the questions we still need to answer:

1. **WhatsApp Business API limitations** -- What are the rate limits, message types, and costs? Can we build the UX we want within WhatsApp's constraints?
2. **Data privacy & compliance** -- UAE data residency requirements? How do we handle company data securely?
3. **Skill ecosystem** -- Do we build our own skill marketplace, or leverage existing ones (like skills.sh)?
4. **Pricing validation** -- What salary range feels right for the UAE market? $50/mo? $200/mo? $500/mo?
5. **Multi-language support** -- Arabic + English is table stakes for UAE. How do we handle bilingual AI employees?
6. **Competitive landscape** -- Who else is building WhatsApp-native AI agents for MENA? What's our defensible moat?
7. **Team building** -- What human skills do we need first? AI/ML engineer? WhatsApp API specialist? MENA business development?
8. **Legal entity** -- UAE free zone company? Where to incorporate for this kind of product?

## Success Criteria (6 Months)

- [ ] 3+ AI employees running Volund Ventures operations daily via WhatsApp
- [ ] At least one AI employee operating with high autonomy on routine tasks
- [ ] Dynamic skill acquisition working reliably (AI employees self-equipping)
- [ ] 5+ external beta users onboarding their own AI employees
- [ ] Clear signal on which role/use-case has the strongest product-market fit
- [ ] Revenue from at least 1 paying customer

---

*"Every master was once a journeyman. Every journeyman was once an apprentice."*

*This vision document is a living artifact. It will evolve as we learn from dogfooding, customer conversations, and market feedback.*

*Last updated: February 2026*
