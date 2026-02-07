-- Ответы API, вызванные из чата (GPT формирует запрос → мы вызываем API → пишем сюда)
create table if not exists chat_api_results (
  id bigserial primary key,
  session_id text not null,
  api_name text not null,
  request_payload jsonb not null default '{}',
  response_payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists chat_api_results_session_id_created_at_idx
  on chat_api_results(session_id, created_at desc);
