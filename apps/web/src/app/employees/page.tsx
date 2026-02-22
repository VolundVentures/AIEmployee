"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  role: string;
  model_preference: string;
  autonomy_default: string;
  skills: unknown[];
  created_at: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employees")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setEmployees(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
          <a href="/employees" className="text-white">Employees</a>
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

        {loading ? (
          <div className="text-[var(--muted)] text-center py-12">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-12 text-center">
            <p className="text-[var(--muted)] mb-4">No employees yet.</p>
            <a
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-light)] text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Hire your first AI employee <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {employees.map((emp) => (
              <a
                key={emp.id}
                href={`/employees/${emp.id}`}
                className="block bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden hover:border-[var(--accent)] transition-colors"
              >
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-[var(--accent)] rounded-full flex items-center justify-center font-bold text-xl">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h2 className="font-bold text-xl">{emp.name}</h2>
                      <p className="text-[var(--muted)]">{emp.role.replace(/_/g, " ")}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-[var(--background)] rounded-full px-3 py-1">
                      <div className="w-2 h-2 bg-[var(--success)] rounded-full" />
                      <span className="text-sm">Active</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <ConfigCard
                      label="Model Routing"
                      value={emp.model_preference === "auto" ? "Auto (smart routing)" : emp.model_preference}
                    />
                    <ConfigCard
                      label="Default Autonomy"
                      value={
                        emp.autonomy_default === "semi_auto"
                          ? "Semi-autonomous"
                          : emp.autonomy_default === "auto"
                            ? "Autonomous"
                            : "Supervised"
                      }
                    />
                    <ConfigCard
                      label="Created"
                      value={new Date(emp.created_at).toLocaleDateString()}
                    />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
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
