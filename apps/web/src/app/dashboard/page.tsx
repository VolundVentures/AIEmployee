"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Brain, Zap, BarChart3 } from "lucide-react";

interface DashboardStats {
  totalMessages: number;
  totalTasks: number;
  totalCost: number;
  tasksByStatus: Record<string, number>;
  employees: Array<{
    id: string;
    name: string;
    role: string;
    model_preference: string;
    autonomy_default: string;
    skills: unknown[];
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const completedTasks = stats?.tasksByStatus?.completed || 0;

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
          <a href="/employees" className="hover:text-white transition-colors">Employees</a>
          <a href="/settings" className="hover:text-white transition-colors">Settings</a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-8">Your AI Employees</h1>

        {loading ? (
          <div className="text-[var(--muted)] text-center py-12">Loading dashboard...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<Brain className="w-5 h-5" />}
                label="Employees"
                value={String(stats?.employees?.length || 0)}
              />
              <StatCard
                icon={<MessageSquare className="w-5 h-5" />}
                label="Total messages"
                value={String(stats?.totalMessages || 0)}
              />
              <StatCard
                icon={<Zap className="w-5 h-5" />}
                label="Tasks completed"
                value={String(completedTasks)}
              />
              <StatCard
                icon={<BarChart3 className="w-5 h-5" />}
                label="Cost this month"
                value={`$${(stats?.totalCost || 0).toFixed(2)}`}
              />
            </div>

            {/* Employee cards */}
            {stats?.employees && stats.employees.length > 0 ? (
              stats.employees.map((emp) => (
                <a
                  key={emp.id}
                  href={`/employees/${emp.id}`}
                  className="block bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 mb-4 hover:border-[var(--accent)] transition-colors"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-[var(--accent)] rounded-full flex items-center justify-center font-bold text-lg">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-semibold text-lg">{emp.name}</h2>
                      <p className="text-sm text-[var(--muted)]">{emp.role.replace(/_/g, " ")}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-2 h-2 bg-[var(--success)] rounded-full" />
                      <span className="text-sm text-[var(--muted)]">Active</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="bg-[var(--background)] rounded-lg p-3">
                      <div className="text-[var(--muted)] mb-1">Model preference</div>
                      <div className="font-medium">
                        {emp.model_preference === "auto" ? "Auto (smart routing)" : emp.model_preference}
                      </div>
                    </div>
                    <div className="bg-[var(--background)] rounded-lg p-3">
                      <div className="text-[var(--muted)] mb-1">Default autonomy</div>
                      <div className="font-medium">
                        {emp.autonomy_default === "semi_auto"
                          ? "Semi-autonomous"
                          : emp.autonomy_default === "auto"
                            ? "Autonomous"
                            : "Supervised"}
                      </div>
                    </div>
                    <div className="bg-[var(--background)] rounded-lg p-3">
                      <div className="text-[var(--muted)] mb-1">Skills</div>
                      <div className="font-medium">
                        {Array.isArray(emp.skills) && emp.skills.length > 0
                          ? (emp.skills as string[]).join(", ")
                          : "Default skills"}
                      </div>
                    </div>
                  </div>
                </a>
              ))
            ) : (
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
                <Brain className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>No employees yet.</p>
                <a
                  href="/onboarding"
                  className="inline-block mt-4 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Hire your first AI employee
                </a>
              </div>
            )}

            {/* Activity feed placeholder */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
                <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>
                  {stats?.totalMessages
                    ? `${stats.totalMessages} messages processed. Send more messages via WhatsApp.`
                    : "No activity yet. Send your first message via WhatsApp to get started."}
                </p>
              </div>
            </div>
          </>
        )}
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
