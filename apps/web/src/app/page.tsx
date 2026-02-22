import { PRICING_TIERS } from "@journeyman/shared";
import {
  MessageSquare,
  Brain,
  Zap,
  Users,
  ArrowRight,
  Check,
  Shield,
  TrendingUp,
} from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center font-bold text-sm">
            J
          </div>
          <span className="font-bold text-lg">Journeyman</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="text-sm text-[var(--muted)] hover:text-white transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-sm text-[var(--muted)] hover:text-white transition-colors">
            Pricing
          </a>
          <a
            href="/signup"
            className="text-sm bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-4 py-2 rounded-lg transition-colors"
          >
            Start free
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 bg-[var(--card)] border border-[var(--card-border)] rounded-full px-4 py-1.5 mb-8">
          <div className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
          <span className="text-sm text-[var(--muted)]">Now in early access</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Hire an AI employee
          <br />
          <span className="text-[var(--accent-light)]">on WhatsApp</span>
        </h1>

        <p className="text-xl text-[var(--muted)] max-w-2xl mx-auto mb-10">
          AI employees that learn your business, acquire skills on the fly, and get
          work done. Onboard them like real team members. Pay them a monthly salary.
        </p>

        <div className="flex items-center justify-center gap-4">
          <a
            href="/signup"
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Start free <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 border border-[var(--card-border)] hover:border-[var(--muted)] text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            See how it works
          </a>
        </div>

        {/* WhatsApp chat mockup */}
        <div className="mt-16 max-w-md mx-auto bg-[#0b141a] rounded-2xl border border-[#1f2c33] overflow-hidden shadow-2xl">
          <div className="bg-[#1f2c33] px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--accent)] rounded-full flex items-center justify-center text-sm font-bold">
              A
            </div>
            <div>
              <div className="font-medium text-sm">Atlas - Chief of Staff</div>
              <div className="text-xs text-[#8696a0]">online</div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <ChatBubble from="user" text="Atlas, research the top 5 AI agent startups in Dubai and summarize them" />
            <ChatBubble from="assistant" text="On it. I'll research this using multiple sources and compile a summary for you." />
            <ChatBubble from="assistant" text="Here's what I found:

1. **Instabase** - Document AI platform, $2B valuation
2. **Presight AI** - Abu Dhabi-based analytics
3. **G42** - AI infrastructure, backed by $10B fund
4. **Bayanat** - Geospatial AI solutions
5. **AIQ** - Autonomous vehicle AI

Want me to go deeper on any of these?" />
            <ChatBubble from="user" text="Great work. Draft a LinkedIn post about our launch." />
            <div className="flex items-center gap-2 text-xs text-[#8696a0] pl-2">
              <div className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse" />
              Atlas is typing...
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
          Like hiring a real employee
        </h2>
        <p className="text-[var(--muted)] text-center max-w-xl mx-auto mb-16">
          Three steps. No code. Your AI employee starts working in minutes.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          <StepCard
            step={1}
            icon={<Brain className="w-6 h-6" />}
            title="Onboard"
            description="Tell your AI employee about your company, your processes, and your preferences. Just like onboarding a new hire."
          />
          <StepCard
            step={2}
            icon={<MessageSquare className="w-6 h-6" />}
            title="Assign work"
            description="Send tasks via WhatsApp. Your AI employee understands context, asks clarifying questions, and gets to work."
          />
          <StepCard
            step={3}
            icon={<Zap className="w-6 h-6" />}
            title="Get results"
            description="Your AI employee delivers results, learns from feedback, and gets better over time. Skills are acquired on the fly."
          />
        </div>
      </section>

      {/* Differentiators */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
          Not just another chatbot
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Brain className="w-6 h-6 text-[var(--accent-light)]" />}
            title="Deep company memory"
            description="Accumulates knowledge about your business over time. The longer it works for you, the better it gets."
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6 text-[var(--accent-light)]" />}
            title="Self-equipping"
            description="When a task requires a skill it doesn't have, it acquires it on the fly. Like an employee taking a course."
          />
          <FeatureCard
            icon={<Users className="w-6 h-6 text-[var(--accent-light)]" />}
            title="Team dynamics"
            description="AI employees collaborate with each other and with your human team. One escalates to another when needed."
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6 text-[var(--accent-light)]" />}
            title="Configurable autonomy"
            description="Set the leash length per task. Some are fire-and-forget. Others need your approval. Just like managing a real team."
          />
          <FeatureCard
            icon={<TrendingUp className="w-6 h-6 text-[var(--accent-light)]" />}
            title="Smart routing"
            description="Uses the right AI model for each task -- fast models for simple work, powerful models for complex reasoning. Cost-efficient."
          />
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6 text-[var(--accent-light)]" />}
            title="WhatsApp native"
            description="Lives where your business already runs. No new app. No learning curve. Just message your AI employee."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-24">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
          Pay your AI a monthly salary
        </h2>
        <p className="text-[var(--muted)] text-center max-w-xl mx-auto mb-16">
          Hire AI employees for a fraction of the cost. Upgrade their tier as they prove themselves.
        </p>

        <div className="grid md:grid-cols-4 gap-6">
          <PricingCard
            tier="Intern"
            price={PRICING_TIERS.intern.monthlyPrice}
            features={[
              `${PRICING_TIERS.intern.messagesPerMonth} messages/month`,
              "Basic skills",
              "Supervised mode only",
              "1 AI employee",
            ]}
            cta="Start free"
            highlighted={false}
          />
          <PricingCard
            tier="Junior"
            price={PRICING_TIERS.junior.monthlyPrice}
            features={[
              `${PRICING_TIERS.junior.messagesPerMonth.toLocaleString()} messages/month`,
              "Core skills",
              "Moderate autonomy",
              "Up to 3 AI employees",
            ]}
            cta="Hire Junior"
            highlighted={false}
          />
          <PricingCard
            tier="Senior"
            price={PRICING_TIERS.senior.monthlyPrice}
            features={[
              `${PRICING_TIERS.senior.messagesPerMonth.toLocaleString()} messages/month`,
              "Advanced skills + Opus model",
              "Full autonomy",
              "Up to 10 AI employees",
            ]}
            cta="Hire Senior"
            highlighted={true}
          />
          <PricingCard
            tier="Lead"
            price={PRICING_TIERS.lead.monthlyPrice}
            features={[
              `${PRICING_TIERS.lead.messagesPerMonth.toLocaleString()} messages/month`,
              "Premium skills + priority",
              "Full autonomy + team coordination",
              "Unlimited AI employees",
            ]}
            cta="Hire Lead"
            highlighted={false}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Ready to hire your first AI employee?
        </h2>
        <p className="text-[var(--muted)] max-w-xl mx-auto mb-8">
          Start with a free Intern. Upgrade when you&apos;re ready. No credit card required.
        </p>
        <a
          href="/signup"
          className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-8 py-4 rounded-lg font-medium text-lg transition-colors"
        >
          Start free <ArrowRight className="w-5 h-5" />
        </a>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] mt-12">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-[var(--muted)]">
          <span>Journeyman by Volund Ventures</span>
          <span>
            <em>&quot;Every master was once a journeyman.&quot;</em>
          </span>
        </div>
      </footer>
    </main>
  );
}

function ChatBubble({ from, text }: { from: "user" | "assistant"; text: string }) {
  const isUser = from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-line ${
          isUser
            ? "bg-[#005c4b] text-white rounded-tr-none"
            : "bg-[#1f2c33] text-[#e9edef] rounded-tl-none"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  description,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-[var(--accent)] rounded-full flex items-center justify-center text-sm font-bold">
          {step}
        </div>
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-[var(--muted)] text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
      <div className="mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-[var(--muted)] text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({
  tier,
  price,
  features,
  cta,
  highlighted,
}: {
  tier: string;
  price: number;
  features: string[];
  cta: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-6 flex flex-col ${
        highlighted
          ? "bg-[var(--accent)] border-2 border-[var(--accent-light)] ring-2 ring-[var(--accent-light)]/20"
          : "bg-[var(--card)] border border-[var(--card-border)]"
      }`}
    >
      <div className="mb-4">
        <h3 className="font-semibold text-lg">{tier}</h3>
        <div className="mt-2">
          <span className="text-3xl font-bold">{price === 0 ? "Free" : `$${price}`}</span>
          {price > 0 && <span className="text-sm text-[var(--muted)]">/mo</span>}
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <a
        href="/signup"
        className={`text-center py-2.5 rounded-lg font-medium text-sm transition-colors ${
          highlighted
            ? "bg-white text-[var(--accent)] hover:bg-gray-100"
            : "bg-[var(--accent)] text-white hover:bg-[var(--accent-light)]"
        }`}
      >
        {cta}
      </a>
    </div>
  );
}
