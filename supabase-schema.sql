create table if not exists public.hint_submissions (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  category text not null,
  hint_no integer not null check (hint_no > 0),
  hint_value text,
  note text,
  image_url text not null,
  ocr_text text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create index if not exists hint_submissions_slot_idx
  on public.hint_submissions (category, hint_no);

create index if not exists hint_submissions_status_idx
  on public.hint_submissions (status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hint-images',
  'hint-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

alter table public.hint_submissions enable row level security;

drop policy if exists "mvp read hint submissions" on public.hint_submissions;
drop policy if exists "mvp insert hint submissions" on public.hint_submissions;
drop policy if exists "mvp update hint submissions" on public.hint_submissions;

create policy "mvp read hint submissions"
  on public.hint_submissions
  for select
  to anon
  using (true);

create policy "mvp insert hint submissions"
  on public.hint_submissions
  for insert
  to anon
  with check (
    char_length(trim(nickname)) between 1 and 80
    and char_length(trim(category)) between 1 and 80
  );

create policy "mvp update hint submissions"
  on public.hint_submissions
  for update
  to anon
  using (true)
  with check (status in ('pending', 'accepted', 'rejected'));

drop policy if exists "mvp read hint images" on storage.objects;
drop policy if exists "mvp upload hint images" on storage.objects;

create policy "mvp read hint images"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'hint-images');

create policy "mvp upload hint images"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'hint-images');
