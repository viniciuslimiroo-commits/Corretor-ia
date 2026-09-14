-- Migração 12: o que a IA VIU em cada foto.
--
-- Fica no job, não no book: a mesma foto entra em vários books, e reclassificar a cada
-- montagem é pagar de novo pela mesma resposta. Colunas separadas de `parametros` de
-- propósito -- `parametros` guarda o que a PESSOA pediu, e misturar leitura de máquina
-- com pedido de gente estraga o histórico.
--
-- Nada aqui é fato do imóvel. Ambiente, nota e legenda são leitura de imagem; metragem,
-- quartos, vagas e preço continuam vindo só de `properties`.

alter table public.jobs add column if not exists ambiente_ia text;
alter table public.jobs add column if not exists qualidade_ia smallint;
alter table public.jobs add column if not exists legenda_ia text;
alter table public.jobs add column if not exists visto_em timestamptz;

comment on column public.jobs.ambiente_ia is 'Cômodo lido da imagem (vocabulário de TIPOS_ESPACO). Só preenche quando tipo_espaco não veio da pessoa.';
comment on column public.jobs.qualidade_ia is 'Nota 0-10 de nitidez, enquadramento e luz. Ordena as melhores fotos do book.';
comment on column public.jobs.legenda_ia is 'Legenda curta do que aparece na foto. Nunca contém número nem medida.';

-- Só as ainda não vistas entram na fila de classificação.
create index if not exists jobs_por_ver on public.jobs (user_id, property_id) where visto_em is null;
