-- Migração 16: favoritos no acervo.
--
-- Um acervo com centenas de imagens precisa de "as que eu volto a usar". É uma coluna
-- booleana no job, não uma tabela nova: favorito é atributo da imagem pra quem a gerou,
-- e o filtro do acervo já lê jobs. Vídeo fica de fora por ora (a tabela videos tem
-- dezenas de linhas por conta, não centenas).

alter table public.jobs add column if not exists favorito boolean not null default false;

-- O filtro "Favoritos" é por usuário; sem o índice ele varre todos os jobs da pessoa,
-- que já é o que a lista do acervo faz -- mas favoritos são poucos, e o índice parcial
-- é barato.
create index if not exists jobs_favoritos_idx on public.jobs (user_id, criado_em desc) where favorito;
