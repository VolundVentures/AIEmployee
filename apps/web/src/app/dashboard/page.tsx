import { MessageSquare, Brain, Zap, BarChart3 } from "lucide-react";

export default function DashboardPage() {
  return (
    <main className="min-h-screen">
      {/* Top bar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[var(--accent)] rounded-lg flex items-center justify-center font-bold text-sm">
            J
          </div>
          <span className="font-bold">Journeyman</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
          <a href="/dashboard" className="text-white">Dashboard</a>
          <a href="/tasks" className="hover:text-white transition-colors">Tasks</a>
          <a href="/settings" className="hover:text-white transition-colors">Settings</a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-8">Your AI Employees</h1>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Brain className="w-5 h-5" />} label="Employees" value="1" />
          <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Messages today" value="--" />
          <StatCard icon={<Zap className="w-5 h-5" />} label="Tasks completed" value="--" />
          <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Cost this month" value="$0.00" />
        </div>

        {/* Employee card */}
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-[var(--accent)] rounded-full flex items-center justify-center font-bold text-lg">
              A
            </div>
            <div>
              <h2 className="font-semibold text-lg">Atlas</h2>
              <p className="text-sm text-[var(--muted)]">Chief of Staff</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-2 h-2 bg-[var(--success)] rounded-full" />
              <span className="text-sm text-[var(--muted)]">Online</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-[var(--background)] rounded-lg p-3">
              <div className="text-[var(--muted)] mb-1">Model preference</div>
              <div className="font-medium">Auto (smart routing)</div>
            </div>
            <div className="bg-[var(--background)] rounded-lg p-3">
              <div className="text-[var(--muted)] mb-1">Default autonomy</div>
              <div className="font-medium">Semi-autonomous</div>
            </div>
            <div className="bg-[var(--background)] rounded-lg p-3">
              <div className="text-[var(--muted)] mb-1">Skills</div>
              <div className="font-medium">Research, Writing, Analysis</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--card-border)] text-sm text-[var(--muted)]">
            <p>
              Atlas is Journeyman&apos;s own AI employee. It runs the startup operations: customer
              communications, market research, content creation, and task management.
            </p>
          </div>
        </div>

        {/* Placeholder for activity feed */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>No activity yet. Send your first message to Atlas on WhatsApp to get started.</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
      <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
