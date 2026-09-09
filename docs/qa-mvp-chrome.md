# QA do nosso MVP — prompt para o Claude para Chrome

Testa o app local (`localhost:3000`) de ponta a ponta: login, as 4 ações de IA, e reporta
o que funcionou e o que não. O servidor já precisa estar rodando (`npm run dev` na pasta
`web`) — se `localhost:3000` não abrir, avise e pare.

## Antes de colar o prompt

1. Confirma que `http://localhost:3000` abre no navegador.
2. Deixa uma aba do Gmail (ou o e-mail que você usa) aberta e logada — o login é por link
   mágico, então o agente vai precisar checar o e-mail.
3. Tenha 2-3 fotos de teste à mão — pode usar as de `docs/pedra-teardown/fotos-teste/`
   (ex.: `A_sala_vazia_18041820.jpg`, `B2_sala_mobiliada_6782353.jpg`,
   `E_fachada_nublada_7031595.jpg`).

## PROMPT (colar a partir daqui)

VOCÊ VAI TESTAR um app local de IA para staging de imóveis, rodando em
`http://localhost:3000`. Documente cada passo com screenshot e descreva o que viu. Se algo
quebrar, anote o erro exato (texto da tela, e se possível o console do navegador) e siga
pros próximos testes em vez de parar.

PASSO 1 — LOGIN
- Abra `http://localhost:3000`.
- Clique em "Entrar", digite o e-mail combinado, clique em "Enviar link de acesso".
- Troque para a aba do Gmail, ache o e-mail (assunto tipo "Your Magic Link" ou similar,
  pode estar no spam), clique no link dentro dele.
- Confirme que voltou pro app logado, mostrando "Olá, [e-mail]" e "Créditos: N".
- Screenshot da tela logada.

PASSO 2 — MOBILIAR
- Clique em "Escolher foto", suba uma foto de sala vazia.
- Confirme que aparece um botão "✕ Remover" do lado.
- No seletor de ação, escolha "Mobiliar (estilo Moderno)".
- Clique em "Gerar". Cronometre quanto tempo demora até aparecer o resultado.
- Screenshot do resultado (antes/depois lado a lado).
- Anote: a resolução mostrada embaixo da imagem (ex. "3200×2100px"), se diz "upscaled",
  qual modelo usado, e se apareceu algum aviso (⚠) de fallback.
- Confirme que o número de créditos no topo da tela diminuiu em 1.

PASSO 3 — ESVAZIAR
- Remove a foto anterior ("✕ Remover"), sobe uma foto de sala mobiliada.
- Escolhe "Esvaziar cômodo", clica Gerar.
- Screenshot do resultado. Os móveis realmente sumiram, ou a imagem ficou parecida com a
  original (isso já aconteceu num teste anterior com outro modelo)?
- Anote tempo, resolução, modelo usado.

PASSO 4 — MELHORAR
- Sobe uma foto escura/mal iluminada (ou a mesma de novo).
- Escolhe "Melhorar foto escura", clica Gerar.
- Screenshot antes/depois. A imagem ficou mais clara e natural?

PASSO 5 — TROCAR CÉU
- Sobe uma foto de fachada com céu visível.
- Escolhe "Trocar céu (pôr do sol)", clica Gerar.
- Screenshot antes/depois. O céu mudou mantendo o resto da imagem igual?

PASSO 6 — CASOS DE ERRO (propositais)
- Tenta clicar em "Gerar" sem escolher foto nenhuma — o botão deveria estar desabilitado.
  Confirme.
- Se possível, teste gerar repetidamente até os créditos chegarem perto de 0 e veja o que
  acontece quando tenta gerar sem crédito (deve aparecer uma mensagem de erro específica).

PASSO 7 — GERAL
- A tela funciona bem no tamanho de celular (aperte F12, ative o modo responsivo, tente
  simular um iPhone)? Screenshot.
- Algum erro no console do navegador (F12 → aba Console) durante todo o teste? Liste.

FORMATO DO RELATÓRIO FINAL

## Resultado por ação
Tabela: Ação | Tempo (s) | Resolução final | Upscaled? | Modelo usado | Fallback? | Créditos debitaram corretamente? | Qualidade visual (nota 1-5 sua opinião)

## Bugs encontrados
Lista de qualquer coisa que quebrou, com screenshot e texto do erro.

## Responsividade
Como ficou no modo celular.

## Anexos
Lista de screenshots com legenda de uma linha cada.

FIM DO PROMPT.

---

## Depois do teste

Me manda o relatório (texto + screenshots dos antes/depois) — eu leio, corrijo o que
tiver quebrado, e a gente decide o próximo passo do Sprint 2/3.
