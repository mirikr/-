-- Схема хранилища планировщика. Выполняется в SQL Editor панели Supabase.
-- Скрипт идемпотентный: повторный запуск ничего не сломает.

create table if not exists public.planner_kv (
  user_id    uuid        not null references auth.users on delete cascade,
  key        text        not null,
  value      text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.planner_kv enable row level security;

-- Единственное, что защищает данные: anon-ключ публичный и лежит в собранном
-- JavaScript, поэтому доступ ограничивается на стороне базы.
drop policy if exists "planner_kv принадлежит владельцу" on public.planner_kv;
create policy "planner_kv принадлежит владельцу"
  on public.planner_kv
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
