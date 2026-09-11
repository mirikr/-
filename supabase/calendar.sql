-- Календарь-подписка: приложение держит здесь один небольшой файл .ics на
-- пользователя, а Календарь телефона периодически его перечитывает.
-- Выполняется в SQL Editor панели Supabase, повторный запуск безопасен.

-- Бакет публичный намеренно: подписка на календарь не умеет передавать пароль
-- или заголовок авторизации, поэтому ссылка должна открываться сама. Защита —
-- в непредсказуемости пути: <user_id>/<случайный токен>.ics. Внутри только то,
-- что вы сами внесли в события, экзамены и домашние задания.
insert into storage.buckets (id, name, public)
values ('calendar', 'calendar', true)
on conflict (id) do update set public = true;

-- Писать в свою папку может только её владелец.
drop policy if exists "calendar: свой файл создавать" on storage.objects;
create policy "calendar: свой файл создавать"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'calendar' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "calendar: свой файл обновлять" on storage.objects;
create policy "calendar: свой файл обновлять"
  on storage.objects for update to authenticated
  using (bucket_id = 'calendar' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'calendar' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "calendar: свой файл удалять" on storage.objects;
create policy "calendar: свой файл удалять"
  on storage.objects for delete to authenticated
  using (bucket_id = 'calendar' and (storage.foldername(name))[1] = auth.uid()::text);
