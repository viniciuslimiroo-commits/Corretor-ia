-- Migration 11 -- Criador de Books. Cole no SQL Editor e rode.
--
-- Um book é um documento com vida própria: nasce montado a partir de um imóvel, é
-- editado, guardado, reaberto e reexportado. O PDF NÃO é guardado -- o book é a verdade
-- e o arquivo é derivado, regenerado quando pedirem. Isso evita versão velha circulando
-- e deixa "trocar a cor da marca e reexportar" custar segundos.
--
-- `documento` guarda as páginas JÁ RESOLVIDAS, não a receita. É o que faz a edição
-- manual sobreviver a uma remontagem: cada página carrega origem 'auto' ou 'manual', e
-- remontar refresca só as automáticas.
--
-- `versao` existe pro salvamento automático: cada PATCH manda a versão que leu e o
-- servidor recusa se já mudou. Sem isso, duas abas abertas se sobrescrevem em silêncio.
--
-- org_id entra AGORA, não depois. Retroencaixar equipe numa tabela cheia é migração de
-- dados; a coluna nula hoje não custa nada.

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  tipo text not null,                          -- book | whatsapp | alto_padrao | lancamento | catalogo | ...
  titulo text,
  documento jsonb not null,
  versao int not null default 1,
  share_token text unique,
  aberturas int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists books_user_id_idx on public.books (user_id, atualizado_em desc);
create index if not exists books_org_id_idx on public.books (org_id, atualizado_em desc);
create index if not exists books_property_id_idx on public.books (property_id);
create index if not exists books_share_token_idx on public.books (share_token);

alter table public.books enable row level security;

-- Quem escreve é o servidor, com service role (que ignora RLS). A policy existe pra
-- fechar a porta antes de alguém abrir: se um dia o navegador ler direto, só lê o que é
-- dele. Mesmo padrão de jobs e videos.
drop policy if exists "usuario ve proprios books" on public.books;
create policy "usuario ve proprios books" on public.books
  for all using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Ficha técnica do imóvel.
--
-- É o que o book precisa e não tem onde morar hoje: properties só guarda título,
-- endereço e capa. Os campos ficam no IMÓVEL, não no book -- três books do mesmo
-- apartamento com três preços diferentes é pior do que o incômodo de a edição valer
-- pra todos.
--
-- preco, condominio e iptu são TEXTO de propósito: o corretor escreve "sob consulta",
-- "a partir de R$ 690.000", "isento". Guardar número obriga a formatar, e formatar
-- moeda é onde o bug mora.
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists preco text;
alter table public.properties add column if not exists descricao text;
alter table public.properties add column if not exists area_total numeric(10,2);
alter table public.properties add column if not exists area_util numeric(10,2);
alter table public.properties add column if not exists dormitorios int;
alter table public.properties add column if not exists suites int;
alter table public.properties add column if not exists banheiros int;
alter table public.properties add column if not exists vagas int;
alter table public.properties add column if not exists ano_construcao int;
alter table public.properties add column if not exists condominio text;
alter table public.properties add column if not exists iptu text;

-- Obrigatório em anúncio de imóvel vendido antes da conclusão: número do registro,
-- matrícula e cartório (art. 32 §3º da Lei 4.591/64 e Resolução COFECI 458/95). O book
-- de lançamento se recusa a exportar sem isto preenchido.
alter table public.properties add column if not exists registro_incorporacao text;

-- ---------------------------------------------------------------------------
-- Miniatura do resultado.
--
-- O editor abre vinte páginas de uma vez, e hoje `assinar()` devolve o arquivo inteiro:
-- vinte JPEGs de 2 MB antes do primeiro clique. Miniatura de 400px gerada quando o job
-- termina, como videos.thumb_path já faz. Fica nula no que já existe e é preenchida
-- de forma preguiçosa na primeira vez que a foto aparecer num editor.
-- ---------------------------------------------------------------------------
alter table public.jobs add column if not exists thumb_path text;
