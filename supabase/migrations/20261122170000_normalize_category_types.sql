-- Normalize existing category types and merge duplicate labels without losing exercise links.
do $$
declare
  old_category record;
  target_category_id uuid;
begin
  for old_category in
    select id, dataset_id, name, category_type
    from public.categories
    where (lower(name) = 'shoulders' and category_type <> 'muscle_group')
       or (lower(name) = 'free weights' and category_type <> 'equipment')
  loop
    select id into target_category_id
    from public.categories
    where dataset_id = old_category.dataset_id
      and lower(name) = lower(old_category.name)
      and category_type = case
        when lower(old_category.name) = 'shoulders' then 'muscle_group'
        else 'equipment'
      end
    limit 1;

    if target_category_id is not null then
      insert into public.item_categories (dataset_id, item_id, category_id)
      select dataset_id, item_id, target_category_id
      from public.item_categories
      where category_id = old_category.id
        and not exists (
          select 1 from public.item_categories existing
          where existing.dataset_id = public.item_categories.dataset_id
            and existing.item_id = public.item_categories.item_id
            and existing.category_id = target_category_id
        );
      delete from public.item_categories where category_id = old_category.id;

      insert into public.routine_categories (dataset_id, routine_id, category_id)
      select dataset_id, routine_id, target_category_id
      from public.routine_categories
      where category_id = old_category.id
        and not exists (
          select 1 from public.routine_categories existing
          where existing.routine_id = public.routine_categories.routine_id
            and existing.category_id = target_category_id
        );
      delete from public.routine_categories where category_id = old_category.id;

      delete from public.categories where id = old_category.id;
    else
      update public.categories
      set category_type = case
        when lower(old_category.name) = 'shoulders' then 'muscle_group'
        else 'equipment'
      end
      where id = old_category.id;
    end if;
  end loop;
end $$;
