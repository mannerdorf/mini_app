-- Повторно расширяет event_id для этапов перевозки (если 090 не применялась на prod).

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_preferences'
  ) then
    alter table notification_preferences
      drop constraint if exists notification_preferences_event_id_check;

    alter table notification_preferences
      add constraint notification_preferences_event_id_check
      check (event_id in (
        'info_received',
        'received_at_warehouse',
        'measured',
        'consolidation',
        'loaded',
        'sent',
        'arrived',
        'delivery_scheduled',
        'delivered',
        'accepted',
        'in_transit',
        'bill_created',
        'bill_paid',
        'daily_summary',
        'weekly_summary'
      ));
  end if;
end $$;
