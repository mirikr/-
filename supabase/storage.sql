-- Хранилище файлов для конспектов и домашних заданий.
-- Выполняется в SQL Editor панели Supabase, повторный запуск безопасен.

-- Приватный бакет: файлы отдаются только по временной подписанной ссылке.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Каждый работает только со своей папкой attachments/<user_id>/...
-- storage.foldername(name) режет путь на части, первая — идентификатор владельца.
drop policy if exists "attachments: свои файлы читать" on storage.objects;
create policy "attachments: свои файлы читать"
  on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments: свои файлы загружать" on storage.objects;
create policy "attachments: свои файлы загружать"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments: свои файлы заменять" on storage.objects;
create policy "attachments: свои файлы заменять"
  on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments: свои файлы удалять" on storage.objects;
create policy "attachments: свои файлы удалять"
  on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
