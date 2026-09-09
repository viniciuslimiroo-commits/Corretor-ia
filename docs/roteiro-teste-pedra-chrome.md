# Roteiro de teste da Pedra.ai — para o Claude para Chrome

Objetivo: percorrer o app da Pedra logado, documentar cada tela, medir qualidade e
tempo de geração, e baixar exemplos de referência. Rodar com a extensão **Claude para
Chrome** (ou qualquer sessão de navegador com login).

> Usar uma conta de teste dedicada. Não subir foto de imóvel real de cliente sem
> autorização. Guardar todos os screenshots em `docs/pedra-teardown/screens/`.

---

## 0. Preparação

- [ ] Criar conta em https://pedra.ai com e-mail dedicado (trial dá 7 créditos de
      imagem + 1 vídeo + 1 tour, sem cartão).
- [ ] Separar 6–8 fotos de teste (usar bancos livres / fotos próprias):
  - 1 sala **vazia** (bem enquadrada, luz de dia)
  - 1 sala **mobiliada e bagunçada** (para testar "esvaziar")
  - 1 quarto vazio
  - 1 cozinha
  - 1 fachada com céu nublado
  - 1 foto tremida / escura / com marca d'água
  - 1 varanda / área externa
- [ ] Ativar gravação de tela ou tirar screenshot em cada passo.

## 1. Onboarding e navegação

- [ ] Screenshot da tela pós-cadastro. Anotar: quantos passos, o que pedem, se há
      tour guiado, qual a primeira ação sugerida.
- [ ] Mapear o menu principal: nomes exatos de cada item, ordem, ícones.
- [ ] Anotar onde aparece o saldo de créditos e como é exibido o consumo.
- [ ] Verificar idiomas disponíveis (tem português? PT-BR ou PT-PT?).

## 2. Virtual Staging — mobiliar cômodo vazio

- [ ] Subir a foto da sala vazia. Cronometrar o upload.
- [ ] Documentar a tela do editor: painéis, ferramentas, onde ficam os estilos,
      se dá para selecionar área (máscara) ou é a imagem toda.
- [ ] Listar TODOS os estilos de decoração disponíveis (nomes exatos).
- [ ] Rodar staging no estilo "moderno". **Cronometrar** do clique ao resultado.
- [ ] Anotar: resolução da saída, se tem marca d'água no trial, quantas variações
      vêm por geração, custo em créditos cobrado.
- [ ] Avaliar qualidade (nota 1–5): paredes/janelas preservadas? Perspectiva certa?
      Móveis realistas? Sombras coerentes? Artefatos?
- [ ] Regenerar. As variações são diferentes? Dá para "travar" o que gostou?
- [ ] Testar staging na MESMA sala em outra foto (ângulo diferente) e ver se os
      móveis ficam consistentes entre as fotos.
- [ ] Baixar 3 melhores resultados para a pasta de referência.

## 3. Virtual Staging — esvaziar cômodo mobiliado

- [ ] Subir a foto da sala bagunçada. Rodar "esvaziar / remover móveis".
- [ ] Cronometrar. Avaliar: sobrou sombra/marca dos móveis? Piso e parede
      reconstruídos corretamente?

## 4. Reforma virtual (Renovate)

- [ ] Rodar reforma na cozinha (ex: "cozinha moderna com armários claros").
- [ ] Testar reforma de fachada e/ou área externa.
- [ ] Anotar nível de controle: dá para pedir só trocar piso? Só pintura? Ou é
      transformação total?

## 5. Enhance / correções

- [ ] Auto-enhance na foto escura. Antes/depois.
- [ ] Troca de céu na fachada nublada.
- [ ] Remoção de objeto (escolher um objeto e remover).
- [ ] Remoção de marca d'água (testar no limite — anotar qualidade).
- [ ] Correção de perspectiva / HD. Cronometrar cada um. Custo em créditos.

## 6. Vídeo

- [ ] Gerar vídeo do imóvel a partir de 5–6 fotos.
- [ ] Documentar as opções: trilha, locução (tem voz em português?), legendas,
      logo, formato vertical x horizontal, duração, transições.
- [ ] Cronometrar a geração. Baixar o vídeo.
- [ ] Avaliar: cara de "slideshow" ou movimento real? Qualidade da locução PT.

## 7. Tour 360°

- [ ] Se possível, subir fotos 360 (ou pular e documentar o fluxo/telas).
- [ ] Anotar: hotspots automáticos, staging dentro do tour, como é o link de
      compartilhamento e o player, se dá para embutir.

## 8. Planta baixa

- [ ] Testar geração de planta a partir de rascunho.
- [ ] Testar render 3D da planta.
- [ ] Anotar: edição, medidas, marca da imobiliária, formatos de export.

## 9. Social media / Instagram

- [ ] Documentar o fluxo de automação de post. O que ele gera (imagem, legenda,
      hashtags, story)? Conecta direto no Instagram? Agenda?

## 10. Export e integrações

- [ ] Ver todas as opções de download/export. Tem preset por portal?
- [ ] Procurar a documentação da API (endpoints, autenticação, preço). Salvar.
- [ ] Ver se há integração com CRM / portais.

## 11. Billing

- [ ] Abrir a tela de planos logado. Screenshot de todos os tiers e add-ons.
- [ ] Ver métodos de pagamento aceitos.
- [ ] Testar o fluxo de "pausar assinatura".
- [ ] Anotar o que acontece quando os créditos acabam (bloqueia? oferece compra
      avulsa? quanto custa o pacote extra?).

## 12. Fechamento

- [ ] Preencher a planilha de medições: para cada ferramenta — tempo de geração,
      custo em créditos, nota de qualidade (1–5), observações.
- [ ] Listar os 5 pontos onde a Pedra é claramente melhor que os concorrentes.
- [ ] Listar os 5 pontos fracos / lacunas (oportunidade para o clone BR).
- [ ] Consolidar tudo em `docs/pedra-teardown/relatorio-teste.md`.

---

## Planilha de medições (preencher)

| Ferramenta | Tempo (s) | Créditos | Qualidade (1-5) | Marca d'água no trial? | Observações |
|---|---|---|---|---|---|
| Staging (mobiliar) | | | | | |
| Staging (esvaziar) | | | | | |
| Reforma interior | | | | | |
| Reforma fachada | | | | | |
| Auto-enhance | | | | | |
| Troca de céu | | | | | |
| Remoção de objeto | | | | | |
| Remoção de marca d'água | | | | | |
| Vídeo | | | | | |
| Tour 360 | | | | | |
| Planta baixa | | | | | |
| Render de planta | | | | | |
