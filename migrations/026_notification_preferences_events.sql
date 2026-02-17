-- Expand notification events: bill_created + daily_summary

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
      check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_created', 'bill_paid', 'daily_summary'));
  end if;
end $$;
