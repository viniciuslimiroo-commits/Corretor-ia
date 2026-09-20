# Imagens da página inicial (20/09/2026)

Toda imagem da landing é fotografia de verdade ou captura do próprio produto. Nada de
ilustração genérica, nada de imagem comprada com cara de banco de imagem, e nenhuma foto de
imóvel de cliente.

## De onde vem cada uma

| Arquivo | O que é | Origem | Onde aparece |
|---|---|---|---|
| `exemplos/sala-antes.jpg` | sala vazia, foto profissional | Pexels 3935327 | herói (antes) |
| `exemplos/sala-depois.jpg` | a mesma sala mobiliada | **gerado pela Encena** (mobiliar · brasileiro contemporâneo · padrão médio) | herói (depois) e aba Foto |
| `exemplos/jantar-antes.jpg` | sala e jantar vazias | Pexels 3935349 | prova (antes) |
| `exemplos/jantar-depois.jpg` | a mesma sala mobiliada | **gerado pela Encena** (mobiliar · escandinavo) | prova (depois) |
| `exemplos/cozinha-*.jpg` | cozinha, remover objeto | teste real de 12/09 (foto de origem Pexels) | prova |
| `exemplos/parede-*.jpg` | parede terracota | teste real de 12/09 (foto de origem Pexels) | prova |
| `fotos/tela-editor-video.webp` | o editor de vídeo com 3 cenas, música e textos | **captura do produto** (fotos licenciadas, nenhum imóvel de cliente) | aba Vídeo |
| `fotos/tela-planta.webp` | planta com 2 cômodos, medidas e área total | **captura do produto** | aba Planta |
| `fotos/post-instagram.jpg` | post do Instagram montado | **gerado pela Encena** a partir de um imóvel modelo, apagado depois | aba Book e seção de materiais |
| `fotos/story-instagram.jpg` | story montado | idem | seção de materiais |
| `fotos/corretor-apartamento.jpg` | corretora num apartamento vazio | Pexels 7937328 | como funciona |
| `fotos/predio-sao-paulo.jpg` | prédio residencial em São Paulo | Pexels 38381580 | fundo da seção de imobiliárias |
| `fotos/bairro-de-cima.jpg` | loteamento brasileiro visto de cima | Pexels 31329153 | terreno e lançamento |
| `fotos/video-capa.jpg` | quadro de vídeo montado com capa | teste real do editor | reserva |

## Licença

As fotos de origem vêm do **Pexels** (licença livre para uso comercial, sem obrigação de
crédito, permitida a modificação). O que a Encena gera a partir delas é obra derivada, que a
licença permite. Três cuidados que valem sempre:

1. **Foto de banco de imagem nunca entra como "resultado" do produto.** Ela só aparece como
   o *antes* de um par que a Encena mesmo gerou, ou como ilustração de seção.
2. **Pessoa reconhecível não pode dar a entender que é cliente** nem que recomenda a Encena.
   Por isso há uma única foto com gente, no "como funciona", e a legenda descreve a cena.
3. **Nada de marca d'água de terceiro.** As quatro imagens da obra (fundação → casa pronta)
   ficaram de fora justamente por isso: a foto do lote que serviu de base traz a marca da
   empresa que fotografou. Pra ter a sequência na página, é preciso refazer a partir de uma
   foto de lote licenciada — 4 créditos.

## Como refazer os exemplos

`web/scripts/gerar-exemplos-landing.mjs` baixa as fotos de origem, manda pela mesma API que
o corretor usa e grava os pares em `public/exemplos`. Gasta 1 crédito por foto. As capturas
do produto são feitas à mão, com a conta de teste e fotos licenciadas — nunca com imóvel de
cliente, que é dado de terceiro numa página pública.
