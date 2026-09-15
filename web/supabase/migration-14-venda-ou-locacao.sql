-- Migração 14: o imóvel é de venda ou de locação?
--
-- Sem isso, "R$ 2.500" na capa do book não se explica: pode ser aluguel do apartamento ou
-- venda de uma vaga de garagem. Quem escreveu sabe; quem recebe o PDF no WhatsApp, não --
-- e é ele que decide se liga.
--
-- Uma coluna de texto, não um booleano: existe imóvel anunciado nas duas pontas ao mesmo
-- tempo, e booleano obrigaria a criar um segundo campo pra dizer "os dois".
--
-- Fica NULL pro que já existe. Nulo quer dizer "não informado", e o produto continua
-- imprimindo o preço cru, como sempre imprimiu -- ninguém acorda com o anúncio mudado.

alter table public.properties add column if not exists negocio text;

comment on column public.properties.negocio is
  'venda | locacao | ambos. Null = não informado. Decide o rótulo do preço ("Preço" x "Aluguel") e o "/mês" em tudo que imprime.';
