-- Migração 19: a foto tem FUNDO pra câmera andar pra frente?
--
-- Nasce de uma queixa concreta (12/10/2026). Ele gerou um "Tour pela casa" de onze cenas e
-- disse: "só a primeira imagem ficou boa, as outras só parece que a imagem está passando de
-- lado". Medido depois, nas duas pontas: a área gourmet dele -- um espaço que se estende em
-- corredor -- andou 72,8; uma sala larga, com o MESMO ajuste e o MESMO modelo, andou 31,2.
--
-- Ou seja: o que decide se a câmera anda não é o ajuste nem o modelo. É a foto ter para onde
-- andar. Numa parede de azulejo a dois metros não existe nada atrás pra revelar -- e o
-- modelo que "andasse" ali estaria inventando cômodo, que é o que ele proibiu em 24/09 e que
-- vira propaganda enganosa no anúncio.
--
-- `ambiente_ia` não responde isso: profundidade não é cômodo. Duas fotos da mesma sala, uma
-- da porta e outra de frente pra parede, pedem movimentos diferentes.
--
-- Fica no job pelo mesmo motivo da migração 12: a mesma foto entra em vários vídeos, e
-- perguntar de novo é pagar de novo pela mesma resposta.

alter table public.jobs add column if not exists profundidade_ia smallint;

comment on column public.jobs.profundidade_ia is
  'Quanto a câmera pode AVANÇAR nesta foto, de 0 a 10, lido da imagem. 0 = parede ou objeto de perto, nada a revelar; 10 = corredor, enfiada de cômodos, vista que se estende. Decide se a cena vira câmera de IA (que avança) ou movimento na foto (que desliza). Não é fato do imóvel: é leitura de imagem, como ambiente_ia e qualidade_ia.';

-- As fotos já vistas antes desta migração ficam com profundidade nula, e nulo quer dizer
-- "ainda não sei" -- NÃO "sem profundidade". Quem lê trata nulo como o comportamento de
-- antes, pra nenhum vídeo mudar sozinho por causa de uma coluna nova.
