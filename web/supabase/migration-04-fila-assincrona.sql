-- Migration 04 -- quebra a geração em etapas curtas. Cole no SQL Editor do Supabase e rode.
--
-- Por que: o teste ponta a ponta de 11/09/2026 mediu 99,9s para "remover objeto" e 38,2s
-- para "mobiliar", com upscale. O plano técnico assumia "chamada de IA é síncrona (~10s),
-- não precisa de fila" -- essa premissa está errada por um fator de 4 a 10.
--
-- Isso não é lentidão, é impedimento de deploy: função serverless na Vercel corta em 10s
-- por padrão no plano Hobby, 60s no máximo. Roda na minha máquina e morre em produção,
-- que é o pior tipo de bug porque só aparece depois do deploy.
--
-- A correção não é esperar mais: é parar de segurar a requisição. O app passa a usar a
-- API DE FILA do fal (queue.fal.run) em vez da síncrona (fal.run). /api/gerar despacha e
-- responde na hora; /api/job/[id] avança uma etapa por chamada. Nenhuma requisição
-- precisa durar mais que alguns segundos, em qualquer plano.
--
-- `pipeline` é jsonb de propósito: o estado dessa máquina ainda vai mudar (webhook em vez
-- de polling, mais etapas, cancelamento), e cada mudança dessas seria uma migration nova
-- se fosse coluna. O que o banco precisa garantir aqui é "guarde este estado", não o
-- formato dele.
alter table public.jobs add column if not exists pipeline jsonb;

-- Valores de `status` que o app usa agora:
--   'gerando'     -> despachado pro fal, esperando a imagem
--   'upscaling'   -> imagem pronta, esperando o aumento de resolução
--   'concluido'   -> carimbado e guardado no storage
--   'falhou'      -> os dois provedores falharam (crédito já estornado)
--   'sem_credito' -> barrado antes de gastar qualquer coisa
comment on column public.jobs.pipeline is
  'Estado da máquina de etapas da geração: etapa, modelo em uso, urls da fila do fal, caminho do arquivo de entrada.';

-- Índice pra varredura de jobs presos (uma geração despachada que nunca voltou fica
-- ocupando crédito do usuário). Ainda não existe rotina de limpeza, mas quando existir
-- ela vai procurar exatamente por isto.
create index if not exists jobs_status_criado_em_idx
  on public.jobs (status, criado_em)
  where status in ('gerando', 'upscaling');
