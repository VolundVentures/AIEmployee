import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get employee with company ownership check
  const { data: employee, error } = await supabase
    .from("employees")
    .select(`
      *,
      companies!inner(user_id)
    `)
    .eq("id", id)
    .eq("companies.user_id", user.id)
    .single();

  if (error || !employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Get aggregated stats
  const [messagesResult, tasksResult, costResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", id),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", id),
    supabase
      .from("conversations")
      .select("cost_usd")
      .eq("employee_id", id)
      .not("cost_usd", "is", null),
  ]);

  const totalCost = (costResult.data || []).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0
  );

  return NextResponse.json({
    ...employee,
    companies: undefined,
    stats: {
      totalMessages: messagesResult.count || 0,
      totalTasks: tasksResult.count || 0,
      totalCost,
    },
  });
}
