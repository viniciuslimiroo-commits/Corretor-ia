# Prompt para o Claude para Chrome — teste da Pedra.ai

Cole o texto abaixo (a partir de "VOCÊ VAI TESTAR...") numa aba com a extensão
**Claude para Chrome** ativa. Antes de colar:

1. Abra https://pedra.ai e crie uma conta com um e-mail dedicado (o trial dá 7 créditos
   de imagem + 1 vídeo + 1 tour, sem cartão). Faça o login você mesmo.
2. Tenha 6–8 imagens de teste salvas numa pasta local (links de bancos livres servem —
   Unsplash/Pexels: "empty living room", "cluttered living room", "empty bedroom",
   "kitchen", "house facade cloudy sky", "dark blurry room photo", "apartment balcony").
3. Deixe a aba da Pedra aberta e logada.

O agente **não** deve inserir cartão, comprar créditos, nem mexer em conta real de
cliente. Só o ambiente de trial.

---

## PROMPT (copiar a partir daqui)

VOCÊ VAI TESTAR o produto Pedra.ai (staging virtual de imóveis) que já está aberto e
logado nesta aba. O objetivo é documentar cada funcionalidade com screenshots e
medições, para servir de referência a um concorrente brasileiro.

REGRAS
- Use somente a conta de trial já logada. NÃO insira cartão, NÃO compre créditos, NÃO
  altere configurações de conta ou dados de pagamento.
- Se uma ação pedir upgrade/pagamento, apenas registre "bloqueado no trial" e siga.
- Para cada tela relevante, tire um screenshot e descreva o que está visível.
- Cronometre cada geração (do clique em "gerar" até o resultado aparecer). Anote em
  segundos, aproximado.
- Se ficar sem passos, priorize a ORDEM abaixo — os itens 1 a 5 são os mais importantes.
- Ao final, entregue o RELATÓRIO no formato especificado no fim deste prompt.

IMAGENS DE TESTE
Use estas imagens (baixe de bancos livres ou peça upload):
- A: sala vazia, bem enquadrada, luz de dia
- B: sala mobiliada e bagunçada
- C: quarto vazio
- D: cozinha
- E: fachada com céu nublado
- F: foto escura ou tremida
- G: varanda / área externa

PASSOS

1) NAVEGAÇÃO E ONBOARDING
- Screenshot da tela inicial pós-login.
- Liste os itens do menu principal (nomes exatos, na ordem).
- Onde aparece o saldo de créditos? Como o consumo é mostrado?
- Há português na interface? PT-BR ou PT-PT?
- Screenshot da galeria/projetos.

2) VIRTUAL STAGING — MOBILIAR CÔMODO VAZIO (imagem A)
- Faça upload da imagem A. Cronometre o upload.
- Screenshot do editor: descreva painéis, ferramentas, onde ficam os estilos, se dá
  para selecionar uma área (máscara) ou é a imagem inteira.
- Liste TODOS os estilos de decoração disponíveis (nomes exatos).
- Rode o staging no estilo "moderno" (ou equivalente). Cronometre.
- Anote: resolução da saída, se tem marca d'água no trial, quantas variações vieram,
  quantos créditos foram cobrados.
- Avalie a qualidade de 1 a 5: paredes/janelas preservadas? perspectiva correta?
  móveis realistas? sombras coerentes? algum artefato?
- Regenere uma vez. As variações são diferentes? Dá para travar o que gostou?
- Screenshot do melhor resultado.

3) VIRTUAL STAGING — ESVAZIAR CÔMODO MOBILIADO (imagem B)
- Rode "esvaziar / remover móveis" na imagem B. Cronometre.
- Avalie 1–5: sobrou sombra ou marca dos móveis? piso e parede reconstruídos?
- Screenshot antes/depois.

4) ENHANCE / CORREÇÕES
- Auto-enhance na imagem F (escura). Screenshot antes/depois. Cronometre. Créditos?
- Troca de céu na imagem E. Screenshot antes/depois. Cronometre.
- Remoção de objeto: escolha um objeto na imagem B e remova. Cronometre. Qualidade 1–5.
- Remoção de marca d'água, se existir a ferramenta: teste e anote a qualidade.

5) VÍDEO
- Gere um vídeo do imóvel a partir das imagens A, C, D, G.
- Documente as opções: trilha, locução (tem voz em português?), legendas, logo,
  formato vertical x horizontal, duração, transições.
- Cronometre a geração. Screenshot do preview. O movimento parece real ou é slideshow?

6) REFORMA VIRTUAL
- Rode reforma na imagem D (ex: "cozinha moderna, armários claros"). Cronometre.
- Nível de controle: dá para pedir só troca de piso? só pintura? ou é transformação total?
- Screenshot antes/depois.

7) TOUR 360 e PLANTA BAIXA
- Se não tiver fotos 360, apenas percorra o fluxo e tire screenshots das telas.
- Anote: hotspots automáticos, staging dentro do tour, como é o link de compartilhamento,
  se dá para embutir. Idem para planta baixa (rascunho, render 3D, medidas, export).

8) SOCIAL MEDIA
- Percorra o fluxo de automação de post. O que ele gera (imagem, legenda, hashtags,
  story)? Conecta direto no Instagram? Agenda? Screenshots.

9) EXPORT E API
- Liste todas as opções de download/export. Existe preset por portal imobiliário?
- Ache a documentação da API (endpoints, autenticação, preço). Copie o texto principal.

10) BILLING
- Abra a tela de planos logado. Screenshot de todos os tiers e add-ons, com preços.
- Métodos de pagamento aceitos.
- Percorra (sem confirmar) o fluxo de "pausar assinatura". O que ele oferece?
- O que acontece quando os créditos do trial acabam? Bloqueia? Oferece pacote avulso?
  Qual o preço do pacote extra?

FORMATO DO RELATÓRIO FINAL

## Planilha de medições
Tabela com colunas: Ferramenta | Tempo (s) | Créditos | Qualidade 1-5 | Marca d'água no trial? | Observações
Uma linha para: Staging mobiliar, Staging esvaziar, Reforma interior, Reforma fachada,
Auto-enhance, Troca de céu, Remoção de objeto, Remoção de marca d'água, Vídeo,
Tour 360, Planta baixa, Render de planta.

## Mapa da interface
- Itens do menu (ordem exata)
- Layout do editor (painéis, onde fica cada coisa)
- Lista completa de estilos de decoração
- Como funciona (ou não) a seleção de área / máscara

## Billing observado
- Todos os planos e preços vistos logado
- Preço de pacote avulso de créditos
- Métodos de pagamento
- O que a opção "pausar" oferece

## 5 pontos fortes da Pedra
(onde ela é claramente melhor que os concorrentes)

## 5 pontos fracos / lacunas
(oportunidade para o concorrente brasileiro — foco em: português, portais BR,
WhatsApp, PIX, preço, controle fino de edição, velocidade, qualidade em cômodos difíceis)

## Anexos
Liste todos os screenshots tirados, com uma legenda de uma linha cada.

FIM DO PROMPT.

---

## Depois do teste

Salve o relatório do agente em `docs/pedra-teardown/relatorio-teste.md` e os
screenshots em `docs/pedra-teardown/screens/`. Em seguida me mande o relatório —
eu consolido com a análise e atualizo o plano (`Clonar a Pedra`) e a arquitetura
técnica com os dados reais.
