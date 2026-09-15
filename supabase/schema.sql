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

-- Общая копилка ответов тренажёра.
--
-- Всё остальное в приложении у каждого своё, а эта таблица общая намеренно:
-- правильных ответов банк ФИПИ не отдаёт, и понять, верен ли наш ключ, можно
-- только вместе. Если несколько человек независимо ответили так же, как
-- записано у нас, ключу можно верить; если банк кому-то ответил иначе — ключ
-- спорный и его надо перерешать.
--
-- Здесь нет ничего личного: номер задания, ответ и отметка о сверке. Видеть
-- строки друг друга могут все вошедшие — иначе «трое из четверых» не посчитать.
create table if not exists public.bank_answers (
  task_id    text        not null,
  user_id    uuid        not null references auth.users on delete cascade,
  answer     text        not null,
  matches    boolean     not null default false,
  fipi       text        not null default '',
  updated_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

alter table public.bank_answers enable row level security;

-- Читают все вошедшие: это и есть общий счёт голосов.
drop policy if exists "bank_answers виден всем вошедшим" on public.bank_answers;
create policy "bank_answers виден всем вошедшим"
  on public.bank_answers
  for select
  to authenticated
  using (true);

-- Пишет каждый только свою строку: чужой голос подделать нельзя.
drop policy if exists "bank_answers пишет только владелец строки" on public.bank_answers;
create policy "bank_answers пишет только владелец строки"
  on public.bank_answers
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
