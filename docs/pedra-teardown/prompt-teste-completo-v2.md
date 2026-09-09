# Prompt v2 — teste completo da Pedra (conta paga)

O teste v1 (08/09/2026) travou porque o trial da Pedra dá **0 créditos**. Esta versão
assume que você **assinou o Pro Mensal** (~29 €) e tem ~100 créditos. Objetivo: fechar
todos os furos do relatório v1 — sobretudo **tempo e qualidade real** de cada ferramenta
de imagem.

## Antes de começar

1. Assine o **Pro Mensal** da Pedra. Confirme o saldo de créditos em Configurações →
   Assinatura e créditos.
2. O **kit fixo de fotos já está baixado** em `docs/pedra-teardown/fotos-teste/` — veja o
   `README.md` de lá pro mapa arquivo → papel (A, A2, B, C, D, E, F, G). Use sempre essas
   mesmas fotos (na Pedra e depois nos concorrentes). Ressalvas no README: `A2` não é a
   mesma sala da `A` (o teste de consistência do bloco 2 fica fraco — pule ou use 2 fotos
   reais de um cômodo só); `F` foi escurecida artificialmente.
3. Abra uma planilha (`planilha-protocolo.csv`, ao lado deste arquivo) e preencha 1 linha
   por **(ferramenta × tentativa)** — 3 tentativas por ferramenta.
4. Crie a pasta `docs/pedra-teardown/screens/` e salve **todos** os resultados e prints.
5. Você dirige o navegador. O agente do Chrome só apoia: tira screenshot, cronometra,
   transcreve textos de tela. Ele **não** julga qualidade de imagem — quem dá a nota 1–5
   é você.

## Regras

- Não alterar dados de pagamento nem configurações de conta além do necessário.
- Cronometrar do clique em "Gerar" até o resultado renderizar. Anotar em segundos.
- Se algo falhar, registrar o erro exato e seguir.
- Baixar cada resultado antes de passar para o próximo.

---

## PROMPT (colar a partir daqui na aba com o Claude para Chrome)

VOCÊ VAI APOIAR UM TESTE do produto Pedra.ai, que já está aberto e logado nesta aba, numa
conta paga (Pro). O usuário conduz as ações; você documenta. Para cada passo: tire
screenshot, cronometre o que for geração, transcreva os textos de tela relevantes e
registre tudo num rascunho de relatório no formato do fim deste prompt. NÃO altere
configurações de conta nem dados de pagamento.

BLOCO 1 — STAGING (MOBILIAR CÔMODO VAZIO) — imagem A
- Upload de A. Cronometre o upload.
- Screenshot do editor. Transcreva: todos os painéis, todos os controles, e a LISTA
  COMPLETA de estilos de decoração do dropdown (nomes exatos, todos).
- Confirme: existe seleção de área / máscara / pincel em algum lugar? (esperado: não)
- Rode staging no estilo "Moderno". Cronometre. Anote: quantos créditos foram debitados
  (saldo antes/depois), quantas variações vieram, a resolução exata da saída (abrir a
  imagem e ver dimensões), se há marca d'água na conta paga.
- Repita o MESMO estilo mais 2 vezes (total 3 gerações). As variações são diferentes entre
  si? Dá para "travar"/favoritar uma e regenerar só o resto?
- Rode 1 vez em outro estilo bem diferente ("Rústico" ou "Luxo").
- Peça ao usuário a nota 1–5 de cada geração: paredes/janelas/piso preservados?
  perspectiva correta? móveis realistas e em escala? sombras coerentes? artefatos?

BLOCO 2 — CONSISTÊNCIA ENTRE FOTOS — imagem A2
- Rode staging em A2 no MESMO estilo "Moderno".
- Compare com A: os móveis, cores e disposição "combinam" como se fosse o mesmo cômodo?
  Nota 1–5 de consistência. Isso é decisivo para anúncio (várias fotos do mesmo ambiente).

BLOCO 3 — ESVAZIAR — imagem B
- Rode "Esvaziar". Cronometre. Créditos.
- Nota 1–5: sobrou sombra/fantasma dos móveis? piso e parede reconstruídos de forma
  plausível? distorceu algo?

BLOCO 4 — REFORMA VIRTUAL (RENOVAR) — imagens D e E
- Renovar a cozinha D com nível "Média". Cronometre. Créditos.
- Teste o nível de controle: dá para pedir SÓ trocar o piso? SÓ pintar a parede? Ou é
  sempre transformação total do ambiente? Tente cada um e registre o que acontece.
- Renovar a fachada E (nível Alta). Cronometre. Céu foi trocado junto?

BLOCO 5 — ENHANCE E CORREÇÕES — imagens F, E, B
- "Melhorar" na foto escura F. Antes/depois. Cronometre. Créditos.
- "Corrigir perspectiva" em F ou A. Cronometre. Créditos. Ficou torto/esticado?
- "Converter em HD" numa geração anterior. Cronometre. Créditos. Resolução final.
- "Trocar céu" na fachada E. Opções de céu disponíveis (liste). Cronometre.
- "Remover objeto" — escolha um objeto claro em B, marque e remova. Cronometre. Nota 1–5.
- Se existir "remover marca d'água": teste numa imagem com marca e registre a qualidade.

BLOCO 6 — POLÍTICA DE CRÉDITO
- Force uma geração provavelmente ruim (foto F crua + estilo incompatível).
- Se o resultado for ruim, procure a opção de reportar / regenerar. A Pedra devolve o
  crédito automaticamente? Regenera de graça? Transcreva exatamente o que a tela oferece.

BLOCO 7 — VÍDEO (aprofundar o v1)
- Gere vídeo com A, C, D, G. Transcreva TODAS as opções: trilhas disponíveis, vozes de
  locução (tem PT-BR? liste as vozes), idiomas de legenda, formatos (9:16, 1:1, 16:9),
  durações, tipos de transição, onde entra o logo.
- Cronometre. Baixe o vídeo em cada formato. O movimento é parallax real ou slideshow?
- A marca d'água "Made with Pedra.ai" some na conta paga? Onde se desliga?

BLOCO 8 — TOUR 360
- Se tiver foto 360 equiretangular (baixe uma de banco livre), suba e monte um tour.
  Senão, percorra o fluxo vazio e documente as telas.
- Transcreva: cria hotspots automático? dá para aplicar staging dentro do panorama?
  como é o link de compartilhamento e o player? tem código de embed? hospedagem é inclusa?

BLOCO 9 — PLANTA BAIXA
- Percorra: gerar planta a partir de rascunho → render 3D. Cronometre o render. Créditos.
- Transcreva: dá para editar medidas? colocar a marca da imobiliária? quais formatos de
  export (PNG, PDF, DWG)?

BLOCO 10 — SOCIAL MEDIA
- Percorra a automação de post. O que ele gera exatamente (imagem, legenda, hashtags,
  story, carrossel)? Conecta direto no Instagram/Facebook? Agenda horário? Screenshots.

BLOCO 11 — EXPORT E API
- Liste TODAS as opções de download/export de uma foto e de um imóvel inteiro. Existe
  preset por portal imobiliário (dimensão/proporção por site)? Quais resoluções?
- Ache a doc da API (provável em pedra.ai/api ou nas Configurações → API). Copie: lista de
  endpoints, método de autenticação, formato de request, e a tabela de preço por chamada.

BLOCO 12 — BILLING COMPLETO
- Tela de planos logado: transcreva TODOS os tiers, preços, créditos/mês e o que cada um
  inclui (inclusive faixas acima do Pro Mensal).
- Existe compra de pacote avulso de créditos? Qual o preço por pacote?
- Métodos de pagamento na tela de checkout (cartão? PayPal? algo local?).
- Percorra (sem confirmar) o fluxo de "pausar assinatura": quantos meses, o que acontece
  com os créditos e o conteúdo.
- Percorra o fluxo de CANCELAMENTO até a última tela antes de confirmar: que retenção
  ele oferece (desconto, downgrade, pausa)? Transcreva. O conteúdo gerado continua
  acessível depois?

FORMATO DO RELATÓRIO FINAL

## Planilha de medições
Tabela: Ferramenta | Tentativa | Tempo (s) | Créditos debitados | Resolução saída | Nº variações | Qualidade 1-5 | Consistência 1-5 | Marca d'água | Observações

## Mapa da interface (atualizado)
- Lista COMPLETA de estilos de decoração
- Todos os controles de cada ferramenta
- Confirmação: existe ou não seleção de área/máscara
- Opções completas de vídeo (trilhas, vozes PT, formatos, transições)

## Política de crédito
- O que exatamente acontece com geração ruim (texto da tela)

## Billing completo
- Todos os planos e preços · pacote avulso · métodos de pagamento · fluxo de pausa · fluxo
  de cancelamento e retenção

## Tour 360 / Planta / Social / API
- Um parágrafo por módulo com as telas e opções reais

## Anexos
- Lista de todos os screenshots e arquivos baixados, com legenda de uma linha

FIM DO PROMPT.

---

## Depois do teste

1. Salve o relatório em `docs/pedra-teardown/relatorio-teste-v2.md` e os arquivos em
   `docs/pedra-teardown/screens/`.
2. Me mande o relatório — eu atualizo a seção 0 da arquitetura, o artifact e o plano de
   MVP com os números reais.
3. **Cancele a assinatura da Pedra** (documentando o fluxo, como pede o bloco 12).
4. Opcional: rode o mesmo kit de 8 fotos em VirtualStagingAI / REimagineHome / ApplyDesign
   para ter régua de qualidade e preço.
