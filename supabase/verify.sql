-- Проверка после schema.sql. Выполняется в SQL Editor панели Supabase.
--
-- ВАЖНО: редактор показывает результат только последнего оператора, поэтому
-- запросы ниже запускайте по одному (выделите нужный и нажмите Run).

-- 1. Таблица есть, RLS включён, политика на месте — всё одной строкой.
--    Ожидается: true | true | 1
select
  (select count(*) = 1 from pg_class
     where relname = 'planner_kv' and relnamespace = 'public'::regnamespace) as table_exists,
  (select relrowsecurity from pg_class
     where relname = 'planner_kv' and relnamespace = 'public'::regnamespace) as rls_enabled,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'planner_kv') as policies;

-- 3. Сколько записей и чьих (после первого входа в приложение).
--    До первого сохранения таблица пустая — это нормально.
select user_id, key, length(value) as bytes, updated_at
from public.planner_kv
order by updated_at desc
limit 20;
