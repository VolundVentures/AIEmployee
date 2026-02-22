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
  createdAt: string;
  result?: string;
}

// Demo tasks for the UI -- will be replaced with real data from Supabase
const DEMO_TASKS: TaskItem[] = [
  {
    id: "1",
    title: "Research WhatsApp AI agent competitors in UAE",
    description: "Find and analyze top 10 competitors in the MENA AI agent space",
    status: "completed",
    autonomy: "auto",
    createdAt: "2h ago",
    result: "Found 8 competitors. Report saved to memory.",
  },
  {
    id: "2",
    title: "Draft launch announcement for LinkedIn",
    status: "needs_approval",
    autonomy: "supervised",
    createdAt: "1h ago",
  },
  {
    id: "3",
    title: "Analyze pricing vs. OpenClaw and alternatives",
    status: "in_progress",
    autonomy: "semi_auto",
    createdAt: "30m ago",
  },
  {
    id: "4",
    title: "Set up beta user onboarding sequence",
    status: "pending",
    autonomy: "semi_auto",
    createdAt: "10m ago",
  },
];

export default function TasksPage() {
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
          <a href="/settings" className="hover:text-white transition-colors">Settings</a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Task Board</h1>
          <div className="text-sm text-[var(--muted)]">
            {DEMO_TASKS.length} tasks total
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {columns.map((col) => {
            const config = STATUS_CONFIG[col.status];
            const tasks = DEMO_TASKS.filter((t) => t.status === col.status);
            return (
              <div key={col.status}>
                <div className="flex items-center gap-2 mb-4">
                  <config.icon className={`w-4 h-4 ${config.color}`} />
                  <h2 className="font-medium text-sm">{col.label}</h2>
                  <span className="text-xs text-[var(--muted)] bg-[var(--card)] rounded-full px-2 py-0.5">
                    {tasks.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                  {tasks.length === 0 && (
                    <div className="text-sm text-[var(--muted)] bg-[var(--card)] border border-dashed border-[var(--card-border)] rounded-lg p-4 text-center">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
        <span>{task.createdAt}</span>
      </div>
    </div>
  );
}
