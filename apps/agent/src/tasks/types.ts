export interface Task {
  id: string;
  employeeId: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "needs_approval" | "completed" | "failed";
  autonomy: "supervised" | "semi_auto" | "auto";
  result?: string;
  createdAt: Date;
  completedAt?: Date;
}
