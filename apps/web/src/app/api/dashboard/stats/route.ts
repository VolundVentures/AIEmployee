import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's company
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!company) {
    return NextResponse.json({
      totalMessages: 0,
      totalTasks: 0,
      totalCost: 0,
      tasksByStatus: {},
      employees: [],
    });
  }

  // Get employee IDs
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", company.id);

  if (!employees || employees.length === 0) {
    return NextResponse.json({
      totalMessages: 0,
      totalTasks: 0,
      totalCost: 0,
      tasksByStatus: {},
      employees: [],
    });
  }

  const employeeIds = employees.map((e) => e.id);

  // Run queries in parallel
  const [messagesResult, tasksResult, costResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .in("employee_id", employeeIds),
    supabase
      .from("tasks")
      .select("status")
      .in("employee_id", employeeIds),
    supabase
      .from("conversations")
      .select("cost_usd")
      .in("employee_id", employeeIds)
      .not("cost_usd", "is", null),
  ]);

  // Aggregate tasks by status
  const tasksByStatus: Record<string, number> = {};
  for (const task of tasksResult.data || []) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
  }

  const totalCost = (costResult.data || []).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0
  );

  return NextResponse.json({
    totalMessages: messagesResult.count || 0,
    totalTasks: (tasksResult.data || []).length,
    totalCost,
    tasksByStatus,
    employees,
  });
}
