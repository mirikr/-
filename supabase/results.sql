-- Результаты, которые выкладывает учитель — каждому ученику свои.
-- Выполняется один раз в SQL Editor панели Supabase. Скрипт идемпотентный.
--
-- Кто учитель, решает приложение: список почт в src/results-roles.js, роль
-- выдаётся обновлением. База же отвечает за то, что подделать нельзя:
--   * почту автора строки записывает она сама, из токена входа;
--   * ученик видит только строки, выложенные на его почту;
--   * автор видит и может убрать только своё.
-- Строки от того, кого нет в списке учителей, приложение ученику не покажет.

create table if not exists public.results_inbox (
  id           uuid        primary key default gen_random_uuid(),
  recipient    text        not null,                -- почта ученика, строчными
  author_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  author_email text        not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  author_name  text        not null default '',
  payload      jsonb       not null,                -- сам результат (как в приложении)
  created_at   timestamptz not null default now()
);
create index if not exists results_inbox_recipient on public.results_inbox (recipient);
alter table public.results_inbox enable row level security;

drop policy if exists "results_inbox ученик видит свои" on public.results_inbox;
create policy "results_inbox ученик видит свои"
  on public.results_inbox for select to authenticated
  using (recipient = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "results_inbox автор видит своё" on public.results_inbox;
create policy "results_inbox автор видит своё"
  on public.results_inbox for select to authenticated
  using (author_id = auth.uid());

-- Выкладывать может любой вошедший, но только от своего имени: почта и id
-- автора должны совпасть с токеном. Чужую почту подставить нельзя.
drop policy if exists "results_inbox выкладывает от своего имени" on public.results_inbox;
create policy "results_inbox выкладывает от своего имени"
  on public.results_inbox for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "results_inbox автор убирает своё" on public.results_inbox;
create policy "results_inbox автор убирает своё"
  on public.results_inbox for delete to authenticated
  using (author_id = auth.uid());
