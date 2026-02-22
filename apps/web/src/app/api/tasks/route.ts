import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const employeeId = searchParams.get("employee_id");

  // Get user's company
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!company) {
    return NextResponse.json([]);
  }

  // Get employee IDs for this company
  const { data: employees } = await supabase
    .from("employees")
    .select("id")
    .eq("company_id", company.id);

  if (!employees || employees.length === 0) {
    return NextResponse.json([]);
  }

  const employeeIds = employees.map((e) => e.id);

  let query = supabase
    .from("tasks")
    .select("*, employees(name)")
    .in("employee_id", employeeIds)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }
  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
