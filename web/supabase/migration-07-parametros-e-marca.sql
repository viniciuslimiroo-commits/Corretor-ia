-- Migration 07 -- Fase A do gap com a Pedra. Cole no SQL Editor do Supabase e rode.
--
-- 1. jobs.parametros: as escolhas da pessoa (tipo de espaço, estilo, material...).
--    Antes toda ação era fixa; agora o histórico precisa mostrar "Mobiliar · Quarto ·
--    Escandinavo", não só "mobiliar".
-- 2. users.logo_path / users.cor_marca: a marca do corretor, pra carimbar o logo dele
--    no export (a Pedra chama de Branding). O logo fica no bucket privado em
--    marca/{userId}/logo.png; aqui só o caminho.
alter table public.jobs add column if not exists parametros jsonb;
alter table public.users add column if not exists logo_path text;
alter table public.users add column if not exists cor_marca text;
