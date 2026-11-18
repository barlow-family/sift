-- Initial Sift / Victor app schema
-- Apply with: supabase db push (after linking the Supabase project)
-- This migration assumes a fresh Supabase project.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared timestamp helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership boundary and user preferences
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My workspace' check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  preferred_weight_unit text not null default 'kg'
    check (preferred_weight_unit in ('kg', 'lb')),
  updated_at timestamptz not null default now()
);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (length(trim(key)) > 0),
  name text not null check (length(trim(name)) > 0),
  domain text not null default 'generic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key),
  unique (id, workspace_id)
);

-- SECURITY DEFINER avoids recursive RLS checks when a policy needs to verify
-- workspace ownership. The fixed search_path and qualified table names are
-- intentional.
create or replace function public.owns_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_workspace(uuid) from public, anon;
grant execute on function public.owns_workspace(uuid) to authenticated;

-- Every new Auth user receives one private workspace, default preferences,
-- and the initial Gym dataset.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  workspace_label text;
begin
  workspace_label := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    'My workspace'
  );

  insert into public.workspaces (owner_id, name)
  values (new.id, workspace_label)
  returning id into new_workspace_id;

  insert into public.workspace_settings (workspace_id)
  values (new_workspace_id);

  insert into public.datasets (workspace_id, key, name, domain)
  values (new_workspace_id, 'gym', 'Gym', 'gym');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_workspace on auth.users;
create trigger on_auth_user_created_create_workspace
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Generic records, categories and reusable routines
-- ---------------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes) = 'object'),
  is_favorite boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, dataset_id)
);

create index items_dataset_active_name_idx
  on public.items (dataset_id, lower(name))
  where archived_at is null;

create index items_attributes_gin_idx
  on public.items using gin (attributes);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category_type text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, dataset_id)
);

create unique index categories_dataset_type_name_idx
  on public.categories (dataset_id, category_type, lower(name));

create table public.item_categories (
  dataset_id uuid not null,
  item_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, category_id),
  foreign key (item_id, dataset_id)
    references public.items(id, dataset_id) on delete cascade,
  foreign key (category_id, dataset_id)
    references public.categories(id, dataset_id) on delete cascade
);

create index item_categories_category_idx
  on public.item_categories (category_id, item_id);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, dataset_id)
);

create unique index routines_dataset_name_idx
  on public.routines (dataset_id, lower(name));

create table public.routine_items (
  dataset_id uuid not null,
  routine_id uuid not null,
  item_id uuid not null,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (routine_id, item_id),
  foreign key (routine_id, dataset_id)
    references public.routines(id, dataset_id) on delete cascade,
  foreign key (item_id, dataset_id)
    references public.items(id, dataset_id) on delete cascade
);

create unique index routine_items_position_idx
  on public.routine_items (routine_id, position);

create index routine_items_item_idx
  on public.routine_items (item_id, routine_id);

-- Archived exercises remain linked to existing routines, but cannot be added
-- to a new routine or newly linked to another routine.
create or replace function public.reject_archived_item_routine_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_archive_time timestamptz;
begin
  select i.archived_at
    into item_archive_time
  from public.items i
  where i.id = new.item_id
    and i.dataset_id = new.dataset_id;

  if item_archive_time is not null then
    raise exception 'Archived items cannot be added to routines'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger routine_items_reject_archived_item
  before insert or update of routine_id, item_id, dataset_id
  on public.routine_items
  for each row execute function public.reject_archived_item_routine_link();

-- ---------------------------------------------------------------------------
-- Current values and dated history
-- ---------------------------------------------------------------------------

create table public.item_values (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  value_key text not null check (length(trim(value_key)) > 0),
  numeric_value numeric(14, 4) not null,
  unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, value_key),
  check (
    value_key <> 'current_weight'
    or (unit = 'kg' and numeric_value >= 0)
  )
);

create index item_values_item_idx on public.item_values (item_id);

create table public.item_value_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  value_key text not null,
  numeric_value numeric(14, 4) not null,
  unit text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  check (
    value_key <> 'current_weight'
    or (unit = 'kg' and numeric_value >= 0)
  )
);

create index item_value_history_item_date_idx
  on public.item_value_history (item_id, value_key, changed_at desc);

-- Record each new value and each actual change. For current_weight the
-- application converts lb input to kg before writing; both current and
-- historical values therefore use kg as the canonical unit.
create or replace function public.record_item_value_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.numeric_value is not distinct from new.numeric_value
     and old.unit is not distinct from new.unit then
    return new;
  end if;

  insert into public.item_value_history (
    item_id,
    value_key,
    numeric_value,
    unit,
    changed_at,
    changed_by
  )
  values (
    new.item_id,
    new.value_key,
    new.numeric_value,
    new.unit,
    now(),
    auth.uid()
  );

  return new;
end;
$$;

create trigger item_values_write_history
  after insert or update of numeric_value, unit
  on public.item_values
  for each row execute function public.record_item_value_history();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create trigger workspace_settings_set_updated_at
  before update on public.workspace_settings
  for each row execute function public.set_updated_at();

create trigger datasets_set_updated_at
  before update on public.datasets
  for each row execute function public.set_updated_at();

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();

create trigger item_values_set_updated_at
  before update on public.item_values
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.datasets enable row level security;
alter table public.items enable row level security;
alter table public.categories enable row level security;
alter table public.item_categories enable row level security;
alter table public.routines enable row level security;
alter table public.routine_items enable row level security;
alter table public.item_values enable row level security;
alter table public.item_value_history enable row level security;

create policy workspaces_owner_all
  on public.workspaces for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy workspace_settings_owner_all
  on public.workspace_settings for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy datasets_owner_all
  on public.datasets for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy items_owner_all
  on public.items for all to authenticated
  using (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy categories_owner_all
  on public.categories for all to authenticated
  using (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy item_categories_owner_all
  on public.item_categories for all to authenticated
  using (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy routines_owner_all
  on public.routines for all to authenticated
  using (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy routine_items_owner_all
  on public.routine_items for all to authenticated
  using (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      where d.id = dataset_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy item_values_owner_all
  on public.item_values for all to authenticated
  using (
    exists (
      select 1
      from public.items i
      join public.datasets d on d.id = i.dataset_id
      where i.id = item_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.items i
      join public.datasets d on d.id = i.dataset_id
      where i.id = item_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy item_value_history_owner_select
  on public.item_value_history for select to authenticated
  using (
    exists (
      select 1
      from public.items i
      join public.datasets d on d.id = i.dataset_id
      where i.id = item_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy item_value_history_owner_update
  on public.item_value_history for update to authenticated
  using (
    exists (
      select 1
      from public.items i
      join public.datasets d on d.id = i.dataset_id
      where i.id = item_id
        and public.owns_workspace(d.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.items i
      join public.datasets d on d.id = i.dataset_id
      where i.id = item_id
        and public.owns_workspace(d.workspace_id)
    )
  );

create policy item_value_history_owner_delete
  on public.item_value_history for delete to authenticated
  using (
    exists (
      select 1
      from public.items i
      join public.datasets d on d.id = i.dataset_id
      where i.id = item_id
        and public.owns_workspace(d.workspace_id)
    )
  );

-- Explicit grants: no anonymous access. Exercises are archived, not deleted.
grant usage on schema public to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_settings to authenticated;
grant select, insert, update, delete on public.datasets to authenticated;
grant select, insert, update on public.items to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.item_categories to authenticated;
grant select, insert, update, delete on public.routines to authenticated;
grant select, insert, update, delete on public.routine_items to authenticated;
grant select, insert, update, delete on public.item_values to authenticated;
grant select, update, delete on public.item_value_history to authenticated;

revoke all on public.workspaces, public.workspace_settings, public.datasets,
  public.items, public.categories, public.item_categories, public.routines,
  public.routine_items, public.item_values, public.item_value_history
  from anon;

revoke delete on public.items from authenticated;

commit;
