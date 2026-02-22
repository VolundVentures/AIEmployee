"use client";

import { useEffect, useState } from "react";
import { Clock, CheckCircle2, AlertCircle, Circle, HelpCircle } from "lucide-react";

const STATUS_CONFIG = {
  pending: { icon: Circle, label: "Pending", color: "text-[var(--muted)]" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-blue-400" },
  needs_approval: { icon: HelpCircle, label: "Needs Approval", color: "text-yellow-400" },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-[var(--success)]" },
  failed: { icon: AlertCircle, label: "Failed", color: "text-red-400" },
} as const;

type TaskStatus = keyof typeof STATUS_CONFIG;

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  autonomy: string;
  created_at: string;
  result?: string;
  employees?: { name: string };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTasks(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const columns: { status: TaskStatus; label: string }[] = [
    { status: "pending", label: "Pending" },
    { status: "in_progress", label: "In Progress" },
    { status: "needs_approval", label: "Needs Approval" },
    { status: "completed", label: "Completed" },
  ];

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
          <a href="/tasks" className="text-white">Tasks</a>
          <a href="/employees" className="hover:text-white transition-colors">Employees</a>
          <a href="/settings" className="hover:text-white transition-colors">Settings</a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Task Board</h1>
          <div className="text-sm text-[var(--muted)]">
            {tasks.length} tasks total
          </div>
        </div>

        {loading ? (
          <div className="text-[var(--muted)] text-center py-12">Loading tasks...</div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {columns.map((col) => {
              const config = STATUS_CONFIG[col.status];
              const columnTasks = tasks.filter((t) => t.status === col.status);
              return (
                <div key={col.status}>
                  <div className="flex items-center gap-2 mb-4">
                    <config.icon className={`w-4 h-4 ${config.color}`} />
                    <h2 className="font-medium text-sm">{col.label}</h2>
                    <span className="text-xs text-[var(--muted)] bg-[var(--card)] rounded-full px-2 py-0.5">
                      {columnTasks.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {columnTasks.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                    {columnTasks.length === 0 && (
                      <div className="text-sm text-[var(--muted)] bg-[var(--card)] border border-dashed border-[var(--card-border)] rounded-lg p-4 text-center">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function TaskCard({ task }: { task: TaskItem }) {
  const autonomyLabel = {
    supervised: "Supervised",
    semi_auto: "Semi-auto",
    auto: "Autonomous",
  }[task.autonomy] || task.autonomy;

  const timeAgo = formatTimeAgo(task.created_at);

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
      <h3 className="font-medium text-sm mb-2">{task.title}</h3>
      {task.description && (
        <p className="text-xs text-[var(--muted)] mb-3">{task.description}</p>
      )}
      {task.result && (
        <p className="text-xs text-[var(--success)] mb-3">{task.result}</p>
      )}
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span className="bg-[var(--background)] px-2 py-0.5 rounded">{autonomyLabel}</span>
        <span>{timeAgo}</span>
      </div>
      {task.employees?.name && (
        <div className="mt-2 text-xs text-[var(--muted)]">
          Assigned to {task.employees.name}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
