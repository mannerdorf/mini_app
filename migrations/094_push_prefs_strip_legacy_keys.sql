-- Убрать coarse-ключи accepted/in_transit из push-настроек, если уже есть granular-этапы.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_preferences_state'
  ) then
    update notification_preferences_state
    set preferences = jsonb_set(
          preferences,
          '{push}',
          (preferences->'push') - 'accepted' - 'in_transit'
        ),
        updated_at = now()
    where preferences->'push' ?| array['accepted', 'in_transit']
      and preferences->'push' ?| array[
        'info_received', 'received_at_warehouse', 'measured', 'consolidation',
        'loaded', 'sent', 'arrived', 'delivery_scheduled', 'delivered'
      ];
  end if;
end $$;
