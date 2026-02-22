import { ArrowRight } from "lucide-react";

export default function EmployeesPage() {
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
          <a href="/settings" className="hover:text-white transition-colors">Settings</a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">AI Employees</h1>
          <a
            href="/onboarding"
            className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Hire new employee <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Atlas employee card */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-[var(--accent)] rounded-full flex items-center justify-center font-bold text-xl">
                A
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-xl">Atlas</h2>
                <p className="text-[var(--muted)]">Chief of Staff</p>
              </div>
              <div className="flex items-center gap-2 bg-[var(--background)] rounded-full px-3 py-1">
                <div className="w-2 h-2 bg-[var(--success)] rounded-full" />
                <span className="text-sm">Online</span>
              </div>
            </div>

            <p className="text-sm text-[var(--muted)] mb-6">
              Journeyman&apos;s own AI employee. Handles startup operations: customer communications,
              market research, content creation, task management, and strategic analysis.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--background)] rounded-lg p-3">
                <div className="text-2xl font-bold">--</div>
                <div className="text-xs text-[var(--muted)]">Messages today</div>
              </div>
              <div className="bg-[var(--background)] rounded-lg p-3">
                <div className="text-2xl font-bold">--</div>
                <div className="text-xs text-[var(--muted)]">Tasks completed</div>
              </div>
              <div className="bg-[var(--background)] rounded-lg p-3">
                <div className="text-2xl font-bold">5</div>
                <div className="text-xs text-[var(--muted)]">Skills installed</div>
              </div>
              <div className="bg-[var(--background)] rounded-lg p-3">
                <div className="text-2xl font-bold">$0.00</div>
                <div className="text-xs text-[var(--muted)]">Cost this month</div>
              </div>
            </div>

            {/* Config */}
            <div className="grid grid-cols-3 gap-4">
              <ConfigCard label="Model Routing" value="Auto (Haiku/Sonnet/Opus)" />
              <ConfigCard label="Default Autonomy" value="Semi-autonomous" />
              <ConfigCard label="Tier" value="Senior ($149/mo)" />
            </div>
          </div>

          {/* Skills section */}
          <div className="border-t border-[var(--card-border)] p-6">
            <h3 className="font-semibold mb-4">Installed Skills</h3>
            <div className="flex flex-wrap gap-2">
              <SkillBadge name="Summarize Document" />
              <SkillBadge name="Draft Email/Message" />
              <SkillBadge name="Analyze Data" />
              <SkillBadge name="Generate Report" />
              <SkillBadge name="Translate Text" />
            </div>
          </div>

          {/* Memory section */}
          <div className="border-t border-[var(--card-border)] p-6">
            <h3 className="font-semibold mb-4">Recent Memory</h3>
            <div className="space-y-2 text-sm">
              <MemoryItem type="fact" content="Company name: Journeyman" />
              <MemoryItem type="fact" content="Industry: AI / Technology" />
              <MemoryItem type="fact" content="Primary needs: Running its own startup operations" />
              <MemoryItem type="preference" content="Communication style: Professional but concise" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ConfigCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--background)] rounded-lg p-3">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function SkillBadge({ name }: { name: string }) {
  return (
    <span className="bg-[var(--accent)]/10 text-[var(--accent-light)] border border-[var(--accent)]/20 text-xs px-3 py-1 rounded-full">
      {name}
    </span>
  );
}

function MemoryItem({ type, content }: { type: string; content: string }) {
  const colors: Record<string, string> = {
    fact: "text-blue-400",
    preference: "text-purple-400",
    task_outcome: "text-green-400",
    learned_skill: "text-yellow-400",
  };
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-mono ${colors[type] || "text-[var(--muted)]"}`}>
        [{type}]
      </span>
      <span className="text-[var(--muted)]">{content}</span>
    </div>
  );
}
