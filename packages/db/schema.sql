-- Journeyman Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable pgvector for future RAG support
create extension if not exists vector;

-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  context jsonb default '{}',
  created_at timestamptz default now()
);

alter table companies enable row level security;
create policy "Users can manage their own companies"
  on companies for all using (auth.uid() = user_id);

-- AI Employees
create table employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  name text not null,
  role text not null,
  persona_prompt text,
  model_preference text default 'auto' check (model_preference in ('auto', 'haiku', 'sonnet', 'opus')),
  autonomy_default text default 'semi_auto' check (autonomy_default in ('supervised', 'semi_auto', 'auto')),
  skills jsonb default '[]',
  created_at timestamptz default now()
);

alter table employees enable row level security;
create policy "Users can manage employees in their companies"
  on employees for all using (
    company_id in (select id from companies where user_id = auth.uid())
  );

-- Persistent Memory per Employee
create table memory (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade not null,
  type text not null check (type in ('fact', 'preference', 'task_outcome', 'learned_skill')),
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table memory enable row level security;
create policy "Users can manage memory for their employees"
  on memory for all using (
    employee_id in (
      select e.id from employees e
      join companies c on e.company_id = c.id
      where c.user_id = auth.uid()
    )
  );

-- Conversation History
create table conversations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade not null,
  phone_number text,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model_used text,
  tokens_used integer,
  cost_usd numeric(10, 6),
  created_at timestamptz default now()
);

alter table conversations enable row level security;
create policy "Users can view conversations for their employees"
  on conversations for all using (
    employee_id in (
      select e.id from employees e
      join companies c on e.company_id = c.id
      where c.user_id = auth.uid()
    )
  );

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade not null,
  title text not null,
  description text,
  status text default 'pending' check (status in ('pending', 'in_progress', 'needs_approval', 'completed', 'failed')),
  autonomy text default 'semi_auto' check (autonomy in ('supervised', 'semi_auto', 'auto')),
  result text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table tasks enable row level security;
create policy "Users can manage tasks for their employees"
  on tasks for all using (
    employee_id in (
      select e.id from employees e
      join companies c on e.company_id = c.id
      where c.user_id = auth.uid()
    )
  );

-- Indexes for performance
create index idx_employees_company on employees(company_id);
create index idx_memory_employee on memory(employee_id);
create index idx_memory_type on memory(employee_id, type);
create index idx_conversations_employee on conversations(employee_id);
create index idx_conversations_created on conversations(employee_id, created_at desc);
create index idx_tasks_employee on tasks(employee_id);
create index idx_tasks_status on tasks(employee_id, status);
