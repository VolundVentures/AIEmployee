"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageSquare, Zap, DollarSign } from "lucide-react";

interface EmployeeDetail {
  id: string;
  name: string;
  role: string;
  model_preference: string;
  autonomy_default: string;
  skills: unknown[];
  created_at: string;
  stats: {
    totalMessages: number;
    totalTasks: number;
    totalCost: number;
  };
}

interface Conversation {
  id: string;
  role: "user" | "assistant";
  content: string;
  model_used?: string;
  created_at: string;
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`/api/employees/${id}`).then((r) => r.json()),
      fetch(`/api/conversations?employee_id=${id}&limit=30`).then((r) => r.json()),
    ])
      .then(([emp, convos]) => {
        if (emp && emp.id) setEmployee(emp);
        if (Array.isArray(convos)) setConversations(convos.reverse());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--muted)]">Loading employee...</div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--muted)] mb-4">Employee not found</p>
          <a href="/employees" className="text-[var(--accent-light)] hover:underline">Back to employees</a>
        </div>
      </main>
    );
  }

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
          <a href="/employees" className="hover:text-white transition-colors">Employees</a>
          <a href="/settings" className="hover:text-white transition-colors">Settings</a>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <a href="/employees" className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to employees
        </a>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-[var(--accent)] rounded-full flex items-center justify-center font-bold text-2xl">
            {employee.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{employee.name}</h1>
            <p className="text-[var(--muted)]">{employee.role.replace(/_/g, " ")}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm">Messages</span>
            </div>
            <div className="text-2xl font-bold">{employee.stats.totalMessages}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
              <Zap className="w-4 h-4" />
              <span className="text-sm">Tasks</span>
            </div>
            <div className="text-2xl font-bold">{employee.stats.totalTasks}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Total cost</span>
            </div>
            <div className="text-2xl font-bold">${employee.stats.totalCost.toFixed(2)}</div>
          </div>
        </div>

        {/* Config */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
            <div className="text-xs text-[var(--muted)] mb-1">Model Routing</div>
            <div className="text-sm font-medium">
              {employee.model_preference === "auto" ? "Auto (smart routing)" : employee.model_preference}
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
            <div className="text-xs text-[var(--muted)] mb-1">Default Autonomy</div>
            <div className="text-sm font-medium">
              {employee.autonomy_default === "semi_auto"
                ? "Semi-autonomous"
                : employee.autonomy_default === "auto"
                  ? "Autonomous"
                  : "Supervised"}
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-3">
            <div className="text-xs text-[var(--muted)] mb-1">Created</div>
            <div className="text-sm font-medium">{new Date(employee.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Conversation history */}
        <h2 className="text-lg font-semibold mb-4">Recent Conversations</h2>
        {conversations.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>No conversations yet. Send a message via WhatsApp to get started.</p>
          </div>
        ) : (
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 space-y-4 max-h-[600px] overflow-y-auto">
            {conversations.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    msg.role === "assistant"
                      ? "bg-[var(--background)] text-[var(--foreground)]"
                      : "bg-[var(--accent)] text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs opacity-60">
                    <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                    {msg.model_used && <span>via {msg.model_used}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
