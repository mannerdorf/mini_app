-- Отписка от партнёрской рассылки «Самери»
create table if not exists haulz_summary_unsubscribe (
  email text primary key,
  unsubscribed_at timestamptz not null default now()
);

create index if not exists haulz_summary_unsubscribe_at_idx
  on haulz_summary_unsubscribe (unsubscribed_at desc);
