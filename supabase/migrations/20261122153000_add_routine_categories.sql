-- Store the categories that apply to each routine.
-- Category and routine links are constrained to the same dataset.
create table if not exists public.routine_categories (
  dataset_id uuid not null,
  routine_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (routine_id, category_id),
  constraint routine_categories_routine_dataset_fkey
    foreign key (routine_id, dataset_id)
    references public.routines(id, dataset_id) on delete cascade,
  constraint routine_categories_category_dataset_fkey
    foreign key (category_id, dataset_id)
    references public.categories(id, dataset_id) on delete cascade
);

alter table public.routine_categories enable row level security;

drop policy if exists routine_categories_owner_all on public.routine_categories;
create policy routine_categories_owner_all
  on public.routine_categories
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.datasets d
      where d.id = routine_categories.dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      where d.id = routine_categories.dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  );

grant select, insert, update, delete on public.routine_categories to authenticated;
