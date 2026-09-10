-- Проверка после schema.sql. Выполняется в SQL Editor панели Supabase.
-- Ожидаемый результат описан в комментариях к каждому запросу.

-- 1. Таблица существует и RLS включён.
--    Ожидается одна строка: planner_kv | true
select relname as table, relrowsecurity as rls_enabled
from pg_class
where relname = 'planner_kv';

-- 2. Политика на месте.
--    Ожидается одна строка с ролью {authenticated} и cmd = ALL.
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'planner_kv';

-- 3. Сколько записей и чьих (после первого входа в приложение).
--    До первого сохранения таблица пустая — это нормально.
select user_id, key, length(value) as bytes, updated_at
from public.planner_kv
order by updated_at desc
limit 20;
