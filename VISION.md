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

The dogfooding approach will help us discover the ideal customer: we'll use Journeyman to run Volund Ventures itself and productize what works.

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

### Agent Backend: Claude Agent SDK
Built on the Claude Agent SDK, leveraging:
- Native tool use for interacting with external systems
- Structured outputs for reliable task execution
- Long context for maintaining company knowledge
- The skills ecosystem for dynamic capability acquisition

### Key Technical Components
- **Onboarding Engine** -- structured flow to capture company context, data, and preferences
- **Memory System** -- persistent, evolving knowledge base per AI employee
- **Skill Registry** -- dynamic skill discovery, installation, and execution
- **Orchestration Layer** -- multi-agent coordination and task routing
- **WhatsApp Integration** -- WhatsApp Business API for message handling
- **Autonomy Controller** -- per-task autonomy settings and approval workflows

## MVP Strategy: Dogfooding

Build Journeyman for ourselves first. Use it to run Volund Ventures.

### Phase 1: Build for Ourselves
- Create 2-3 AI employees for our own startup operations
- One handles customer/investor communications
- One handles research and market analysis
- One handles internal ops (scheduling, task management, note-taking)
- All operate through WhatsApp

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
