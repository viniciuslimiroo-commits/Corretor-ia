-- Migration 03 -- fecha o item de backlog do QA: "URL do resultado é pública/sem
-- expiração (link direto pro fal.media)". Cole no SQL Editor do Supabase e rode.
--
-- Problema que isto resolve: até agora a foto do imóvel do cliente virava um link
-- público no fal.media, sem expiração e sem autenticação. Qualquer pessoa com o link
-- via a foto pra sempre, e o link vazava em qualquer print, log ou histórico de rede.
-- Antes de corretor de verdade subir foto de casa de cliente, isso tinha que sair.
--
-- Como fica: o servidor baixa o resultado do fal.ai, carimba o selo de imagem
-- ilustrativa, e guarda num bucket PRIVADO. O navegador nunca recebe URL do fal.media
-- -- recebe URL assinada com validade curta, gerada a cada leitura.

-- 1. Bucket privado pros resultados.
--    (Dá pra criar pela interface do Supabase em Storage > New bucket, deixando
--    "Public bucket" DESmarcado -- este insert faz a mesma coisa.)
insert into storage.buckets (id, name, public)
values ('resultados', 'resultados', false)
on conflict (id) do nothing;

-- 2. Nenhuma policy de storage pro cliente, de propósito.
--    Sem policy, `anon` e `authenticated` não leem nada do bucket. Só o `service_role`
--    (o servidor, em /api/gerar e /api/exportar) escreve e assina URL. É o mesmo
--    desenho da migration 02: quem manipula o recurso sensível é o servidor, nunca o
--    navegador.

-- 3. `jobs` passa a guardar o CAMINHO no storage, não a URL do fornecedor.
--    A URL do fal.media não é mais persistida em lugar nenhum -- ela é descartável,
--    vive só durante a requisição que gerou a imagem.
alter table public.jobs add column if not exists output_path text;

-- 4. Registra se a imagem saiu carimbada, e com qual texto. Serve de prova de que o
--    anúncio foi publicado com aviso de imagem ilustrativa, se alguém questionar.
alter table public.jobs add column if not exists selo text;

-- 5. Limpa as URLs de fal.media que ficaram gravadas nos jobs antigos. Elas não servem
--    mais pra nada (o app agora lê do storage) e não tem motivo pra continuar guardando
--    um link público e permanente da foto de um cliente.
update public.jobs set output_url = null where output_url is not null;
