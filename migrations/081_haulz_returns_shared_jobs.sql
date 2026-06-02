-- ========== 081_haulz_returns_shared_jobs.sql ==========
-- Сессии возвратов общие для всех пользователей с доступом (не только owner_login).

create index if not exists haulz_returns_jobs_created_idx
  on haulz_returns_jobs (created_at desc);

comment on column haulz_returns_jobs.owner_login is 'Кто создал сессию (для отображения; доступ общий)';
