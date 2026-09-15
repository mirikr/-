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

-- 4. Копилка ответов тренажёра: таблица, RLS и две политики.
--    Ожидается: true | true | 2
select
  (select count(*) = 1 from pg_class
     where relname = 'bank_answers' and relnamespace = 'public'::regnamespace) as table_exists,
  (select relrowsecurity from pg_class
     where relname = 'bank_answers' and relnamespace = 'public'::regnamespace) as rls_enabled,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'bank_answers') as policies;

-- 5. Что накопилось: по скольким заданиям сходятся ответы.
select task_id,
       count(*) filter (where matches) as сошлось_с_ключом,
       count(*) filter (where not matches) as ответили_иначе,
       count(*) filter (where fipi = 'ok') as подтвердил_фипи,
       count(*) filter (where fipi = 'wrong') as фипи_против
from public.bank_answers
group by task_id
order by сошлось_с_ключом desc
limit 20;

-- 6. Ответы, которые засчитал сам банк: это и есть список правок для ключей.
select task_id, fipi_answer, count(*) as прислали
from public.bank_answers
where fipi_answer <> ''
group by task_id, fipi_answer
order by прислали desc, task_id;
