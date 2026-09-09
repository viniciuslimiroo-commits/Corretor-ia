# Teste do nosso pipeline (fal.ai)

Responde a pergunta que trava a decisão de arquitetura: **dá para chegar perto da
qualidade/resolução da Pedra usando uma API de terceiro, sem GPU própria?**

Roda as mesmas 5 ações que já medimos na Pedra — mobiliar, esvaziar, trocar piso, trocar
céu, melhorar — nas mesmas fotos do kit, usando **Nano Banana** (nosso modelo padrão do
MVP) e, em 2 casos, **Flux Kontext** para comparar.

## Custo

~US$ 0,28 no total (7 chamadas). Nada perto dos ~R$ 50 que eu tinha estimado antes.

## Passo a passo

1. Crie uma conta em **fal.ai** e gere uma chave em fal.ai/dashboard/keys.
2. Crie o arquivo `fal_key.txt` **nesta pasta** (`docs/pipeline-teste/fal_key.txt`) com
   só a chave, numa linha só. **Eu não vou abrir nem mostrar esse arquivo** — o script lê
   ele localmente, e a chave nunca aparece na nossa conversa.
3. Rode no terminal (dentro da pasta do projeto):
   ```
   powershell -File docs/pipeline-teste/testar-pipeline.ps1
   ```
4. Isso gera:
   - `docs/pipeline-teste/resultados/*.jpg` — as 7 imagens geradas
   - `docs/pipeline-teste/resultados.csv` — tempo, resolução, custo e status de cada teste

5. Me avisa quando terminar (ou me diz se algum passo falhar) — eu abro as imagens, comparo
   com os achados da Pedra ([relatorio-teste-v2.md](../pedra-teardown/relatorio-teste-v2.md))
   e fecho a decisão de arquitetura (`docs/arquitetura-tecnica.md § 6`).

## O que vamos comparar com a Pedra

| Teste | Pedra (medido) | Nosso pipeline |
|---|---|---|
| Mobiliar | resultado bom, 4096×2732, sem marca d'água | a medir |
| Esvaziar | sem fantasmas/resíduos | a medir |
| Trocar piso | **pixel-idêntico fora do piso** (o resultado mais impressionante da Pedra) | a medir — é o teste mais difícil |
| Trocar céu | um dos melhores resultados visuais do teste | a medir |
| Melhorar | excelente, sem artefatos | a medir |
