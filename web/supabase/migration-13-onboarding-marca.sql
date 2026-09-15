-- Migração 13: a pessoa já viu a tela de marca?
--
-- Uma coluna, no usuário, com três estados possíveis: null (nunca viu), 'feito' (salvou
-- alguma coisa) e 'pulado' (clicou em "pular por enquanto"). Fica no USUÁRIO mesmo quando
-- a marca salva é a da imobiliária: quem viu a tela foi a pessoa, não a empresa -- o
-- segundo corretor da mesma imobiliária precisa ver a boas-vindas dele.
--
-- Nenhuma tabela nova de marca. Nome, logo e cor continuam onde sempre estiveram:
-- users.{nome,logo_path,cor_marca} e organizations.{nome,logo_path,cor_marca}, mesclados
-- por marcaEfetiva() em lib/cobranca.ts. Duplicar isso seria criar duas verdades sobre a
-- mesma marca.

alter table public.users add column if not exists onboarding_marca text;
alter table public.users add column if not exists onboarding_marca_em timestamptz;

comment on column public.users.onboarding_marca is
  'null = nunca viu a tela de marca; feito = salvou; pulado = dispensou. Só controla a EXIBIÇÃO -- a marca em si mora em users/organizations.';

-- Quem já tem marca não é "primeiro login": mostrar a tela de boas-vindas pra quem já
-- preencheu logo e nome meses atrás seria o produto perguntando algo que ele já sabe.
-- Idempotente como as outras: rodar de novo não desfaz quem pulou depois.
update public.users
   set onboarding_marca = 'feito',
       onboarding_marca_em = coalesce(onboarding_marca_em, now())
 where onboarding_marca is null
   and (logo_path is not null or nullif(btrim(coalesce(nome, '')), '') is not null);
