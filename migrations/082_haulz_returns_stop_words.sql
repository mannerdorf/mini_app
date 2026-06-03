-- ========== 082_haulz_returns_stop_words.sql ==========
-- Справочник STOP-слов общий для всех сессий возвратов (не привязан к job_id).

create table if not exists haulz_returns_stop_words (
  id bigserial primary key,
  word text not null,
  result text not null default 'STOP',
  match_mode text not null default 'exact'
    check (match_mode in ('exact', 'partial')),
  created_by_login text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists haulz_returns_stop_words_word_uq
  on haulz_returns_stop_words (lower(trim(word)));

create index if not exists haulz_returns_stop_words_updated_idx
  on haulz_returns_stop_words (updated_at desc);

comment on table haulz_returns_stop_words is 'Общий справочник STOP-слов HAULZ Возвраты (все сессии)';
