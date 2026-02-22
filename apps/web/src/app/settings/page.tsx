import { Save } from "lucide-react";

export default function SettingsPage() {
  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center font-bold text-sm">
            J
          </div>
          <span className="font-bold">Journeyman</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
          <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
          <a href="/tasks" className="hover:text-white transition-colors">Tasks</a>
          <a href="/settings" className="text-white">Settings</a>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        {/* Company Settings */}
        <section className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Company</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium mb-1.5">Company name</label>
              <input
                id="companyName"
                type="text"
                defaultValue="Journeyman"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="industry" className="block text-sm font-medium mb-1.5">Industry</label>
              <input
                id="industry"
                type="text"
                defaultValue="AI / Technology"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>
        </section>

        {/* Autonomy Defaults */}
        <section className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Default Autonomy</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Set the default autonomy level for new tasks. Can be overridden per task.
          </p>
          <div className="space-y-3">
            <AutonomyOption
              name="supervised"
              label="Supervised"
              description="AI checks in before every major action"
              defaultChecked={false}
            />
            <AutonomyOption
              name="semi_auto"
              label="Semi-autonomous"
              description="AI works independently, reports what it did"
              defaultChecked={true}
            />
            <AutonomyOption
              name="auto"
              label="Fully autonomous"
              description="AI executes silently, delivers results only"
              defaultChecked={false}
            />
          </div>
        </section>

        {/* Model Preferences */}
        <section className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Model Routing</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Smart routing automatically picks the best model for each task. Override to force a specific model.
          </p>
          <div className="space-y-3">
            <ModelOption
              name="auto"
              label="Auto (Recommended)"
              description="Haiku for simple, Sonnet for moderate, Opus for complex tasks"
              cost="~$0.009/message average"
              defaultChecked={true}
            />
            <ModelOption
              name="haiku"
              label="Haiku only"
              description="Fastest, cheapest. Good for simple Q&A and lookups."
              cost="~$0.003/message"
              defaultChecked={false}
            />
            <ModelOption
              name="sonnet"
              label="Sonnet only"
              description="Balanced. Good for writing, analysis, moderate reasoning."
              cost="~$0.012/message"
              defaultChecked={false}
            />
            <ModelOption
              name="opus"
              label="Opus only"
              description="Most capable. Best for research, strategy, complex tasks."
              cost="~$0.045/message"
              defaultChecked={false}
            />
          </div>
        </section>

        {/* WhatsApp Connection */}
        <section className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">WhatsApp Connection</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-[var(--success)] rounded-full" />
                <span className="text-sm font-medium">Connected</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                WhatsApp is connected via Baileys. Scan QR code again if disconnected.
              </p>
            </div>
            <button className="text-sm border border-[var(--card-border)] hover:border-[var(--muted)] px-4 py-2 rounded-lg transition-colors">
              Reconnect
            </button>
          </div>
        </section>

        {/* API Keys */}
        <section className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">API Configuration</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="anthropicKey" className="block text-sm font-medium mb-1.5">Anthropic API Key</label>
              <input
                id="anthropicKey"
                type="password"
                defaultValue="sk-ant-••••••••••"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
              />
            </div>
            <div>
              <label htmlFor="braveKey" className="block text-sm font-medium mb-1.5">
                Brave Search API Key <span className="text-[var(--muted)]">(optional)</span>
              </label>
              <input
                id="braveKey"
                type="password"
                placeholder="For enhanced web search"
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors font-mono"
              />
            </div>
          </div>
        </section>

        <button className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-6 py-3 rounded-lg font-medium transition-colors">
          <Save className="w-4 h-4" /> Save settings
        </button>
      </div>
    </main>
  );
}

function AutonomyOption({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 bg-[var(--background)] rounded-lg p-3 cursor-pointer hover:bg-[var(--background)]/80 transition-colors">
      <input
        type="radio"
        name="autonomy"
        value={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 accent-[var(--accent)]"
      />
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-[var(--muted)]">{description}</div>
      </div>
    </label>
  );
}

function ModelOption({
  name,
  label,
  description,
  cost,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  cost: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 bg-[var(--background)] rounded-lg p-3 cursor-pointer hover:bg-[var(--background)]/80 transition-colors">
      <input
        type="radio"
        name="model"
        value={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 accent-[var(--accent)]"
      />
      <div className="flex-1">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-[var(--muted)]">{description}</div>
      </div>
      <span className="text-xs text-[var(--muted)] whitespace-nowrap">{cost}</span>
    </label>
  );
}
