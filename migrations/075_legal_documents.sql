-- Версии оферты и согласия на обработку ПД + журнал принятий заказчиками

create table if not exists legal_document_versions (
  id serial primary key,
  document_type text not null check (document_type in ('offer', 'consent')),
  version_label text not null,
  body_text text not null,
  published_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists legal_document_versions_one_current_per_type
  on legal_document_versions (document_type)
  where is_current = true;

create index if not exists legal_document_versions_type_published_idx
  on legal_document_versions (document_type, published_at desc nulls last);

create table if not exists legal_acceptances (
  id serial primary key,
  login text not null,
  document_type text not null check (document_type in ('offer', 'consent')),
  version_id int not null references legal_document_versions(id) on delete restrict,
  version_label text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index if not exists legal_acceptances_login_idx on legal_acceptances (lower(trim(login)));
create index if not exists legal_acceptances_login_type_accepted_idx
  on legal_acceptances (lower(trim(login)), document_type, accepted_at desc);

comment on table legal_document_versions is 'Редакции публичной оферты и согласия на обработку ПД';
comment on table legal_acceptances is 'Журнал принятий юридических документов пользователями (по login)';
