-- Временное отключение API-ключа без отзыва (revoke).

alter table user_api_keys
  add column if not exists disabled_at timestamptz;

comment on column user_api_keys.disabled_at is 'Если задано — ключ не принимается Partner API, но остаётся в списке и может быть включён снова.';
