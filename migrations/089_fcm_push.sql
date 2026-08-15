-- FCM push tokens for Android app + channel "push" in notification preferences

create table if not exists fcm_device_tokens (
  token text primary key,
  login text not null,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

create index if not exists fcm_device_tokens_login_idx on fcm_device_tokens(login);

comment on table fcm_device_tokens is 'FCM device tokens для push-уведомлений в Android-приложении';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_preferences'
  ) then
    alter table notification_preferences
      drop constraint if exists notification_preferences_channel_check;

    alter table notification_preferences
      add constraint notification_preferences_channel_check
      check (channel in ('telegram', 'web', 'email', 'push'));
  end if;
end $$;
