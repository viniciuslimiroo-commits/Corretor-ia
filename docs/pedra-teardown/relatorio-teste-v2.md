# Relatório de QA — Pedra.ai (conta Pro)

**Data do teste:** 09/09/2026
**Conta:** paga (Pro), já logada, fornecida pelo usuário
**Imóvel de teste:** "Imóvel 8/09/2026" (criado do zero)

> O teste foi interrompido algumas vezes (queda de conexão, reinício do PC, expiração de
> permissão de upload) — sempre retomado de onde parou. Nesta versão **todos os 10 blocos
> do roteiro estão concluídos**, incluindo a geração real do vídeo multi-foto (A+C+D+G).
> Tudo abaixo foi executado e observado na interface (ou, quando indicado, na documentação
> pública / faturas da Pedra). O que não foi testado está marcado como tal.

---

## 1. Mapa da interface

### 1.1 Navegação

```
Imóveis (lista de projetos)
 └─ Imóvel (editor)
     ├─ Fotos
     ├─ Vídeo
     ├─ 360° Tour virtual
     ├─ Planta
     └─ "+" → módulo oculto: Social
```

Menu de ações de cada foto muda se é **upload original** ou **resultado de IA**:

- **Foto original:** Editar com IA · Criar vídeo · Adicionar marca d'água · Adicionar legenda · Compartilhar · Baixar · Excluir
- **Foto já gerada por IA:** idem + **"Aplicar efeito cortina"** (opção nova, não testada — aparenta simular cortina/tecido na janela); o submenu "Editar com IA" fica menos expandido

Submenu **"Editar com IA"** — 3 grupos:

| Grupo | Ferramentas |
|---|---|
| **Decorar** | Renovar · Mobiliar · Esvaziar · Remover objeto · **Mudar piso** · **Mudar parede** |
| **Melhorar** | Melhorar · Corrigir perspectiva · Melhorar e corrigir perspectiva · Converter em HD · Céu azul |
| **Outro** | Editar via prompt · Remover marca d'água · Mudar ângulo da câmera · Desfocar |

"Mudar piso" e "Mudar parede" são ferramentas dedicadas — não estavam mapeadas antes.

### 1.2 Mobiliar (staging de cômodo vazio)

Painel com 4 controles:

1. **Criatividade:** Alta (**1 crédito**) vs. Média (**2 créditos**).
   - **Achado:** o nível "mais forte" (Alta) custa *menos* que o intermediário (Média) —
     inversão de preço não-intuitiva. Confirmar se é proposital.
   - Alta: "Transformação visual forte com mudanças significativas, acabamentos e texturas
     de qualidade de revista." · Média: "Muda acabamentos e móveis, variações equilibradas
     no layout."
2. **Tipo de espaço:** Auto + 10 presets (Quarto, Sala de estar, Cozinha, Escritório,
   Terraço, Sala de jantar, Banheiro, Entrada, Cozinha + Sala de estar, Sala de jantar +
   Sala de estar, Casa) + campo livre "Tipo de espaço personalizado".
3. **Estilo:** 9 fixos — **Minimalista, Tradicional, Escandinavo, Meados do século,
   Industrial, Mediterrâneo, Moderno, Boêmio, Pirenéus** — + "Adicionar estilo" (custom) +
   **"Usar móveis de outra imagem"** (staging consistente usando o mobiliário de uma foto
   de referência).
4. **Posição:** Auto vs. **Desenhar** → abre **ferramenta de pincel real**, com controle
   de tamanho do traço e "Limpar desenho". **Confirma que a Pedra TEM seleção de área /
   máscara manual** — ao contrário do que o teste v1 sugeriu.

Resolução de saída (via `naturalWidth`/`naturalHeight`): **4096 × 2732 px**. **Nenhuma
marca d'água** nas imagens geradas na conta Pro.

### 1.3 Renovar (reforma virtual)

Quase igual ao Mobiliar. 4 controles:

1. **Nível:** Alta (**1 crédito**) vs. Média (**2 créditos**). Mesma inversão de preço.
2. **Tipo de espaço:** mesma lista. **Não há preset "Fachada"** — para a fachada externa
   (E) usamos "Casa", o mais próximo.
3. **Estilo:** os mesmos 9.
4. **Móveis:** Auto / Com móveis / Vazio ("móveis só se o espaço estiver vazio").

**"Dá para pedir SÓ trocar o piso? SÓ pintar a parede?"** → "Renovar" **sempre faz
transformação completa**, sem controle interno para restringir a uma superfície. Mas a
Pedra resolve com **duas ferramentas separadas**:

- **Mudar piso** (1 crédito) — 8 materiais: Freixo, Nogueira, Concreto polido, Piso
  sintético, Grama, Terracota, Porcelanato, Piscina. Testado "Concreto polido" em D:
  **trocou só o piso, resto da imagem pixel-idêntico ao original** — a melhor demonstração
  de precisão de todo o teste.
- **Mudar parede** (1 crédito) — 4 materiais: Branco, Bege, Painéis de madeira, Azulejos
  brancos. Testado "Azulejos brancos" em D: interpretou "parede" de forma ampla, mudou
  também a frente de um armário alto colado à parede. Piso e ilha intactos.

**Céu na renovação de fachada:** sim, muda junto. Renovar (Alta, Moderno) na fachada E
deixou o céu mais saturado + nuvens definidas, junto com reforma de fachada, gramado e
mobiliário externo. Não há "manter céu original" no Renovar — usar "Céu azul" depois.

### 1.4 Esvaziar

Sem painel, só "Gerar imagem". **1 crédito** fixo. Bom resultado removendo móveis da
sala/cozinha integrada (B), sem fantasmas/resíduos.

### 1.5 Melhorar

Ação de 1 clique, sem painel, sem tela de custo antes. **Custo confirmado pelo histórico:
1 crédito.** Correção de exposição na foto escura (F) **excelente** — bem iluminado,
balanço de branco natural, sem artefatos.

### 1.6 Corrigir perspectiva

1 clique, sem painel, sem tela de custo. Preview em miniatura no hover. **1 crédito.**
Corrigiu ângulo/distorção; manteve exposição próxima da fonte → **cada ferramenta parte da
imagem-fonte selecionada, não de um "estado acumulado" das edições.**

*Nota de transparência:* ao revisitar a ferramenta só para conferir se tinha painel, um
clique disparou uma 2ª geração real e cobrou +1 crédito sem necessidade (dois registros no
histórico, 02:29 e 02:51 GMT-3). Uso não-intencional de 1 crédito da conta durante a
verificação.

### 1.7 Converter em HD

1 clique, sem painel, sem tela de custo (padrão das 3 ferramentas do grupo "Melhorar" — não
têm a seta "›"). **1 crédito.** Aumentou nitidez/detalhe sem artefatos de upscaling.
Saída 4096×2732px.

### 1.8 Céu azul (trocar céu)

1 controle: "Selecionar estilo", **5 opções**: Ensolarado (padrão), Ensolarado sem
reflexos, Amanhecer, Entardecer, Noite. Custo fixo **2 créditos**. Testado "Entardecer" na
fachada renovada (E): degradê alaranjado convincente, boa integração de iluminação —
**um dos melhores resultados visuais do teste**.

### 1.9 Remover objeto (Desenhar) — falha real

2 modos: **Auto** e **Desenhar** (pincel manual, controle de espessura, "Limpar desenho").
Custo **1 crédito** no modo Desenhar.

**Teste:** marcamos com o pincel uma orquídea rosa bem visível numa sala e pedimos para
remover. Geração demorou **~159 s** (outlier, parecido com "Mudar parede" = 178s). Tela
mostrou "Tempo estimado: 10s" e ficou muito além disso.

**Resultado: FALHOU.** A orquídea **não foi removida** — permaneceu intacta e na mesma
posição (confirmado por zoom antes/depois). Falha genuína e não-forçada da ferramenta.

Usamos essa falha para revalidar a política de crédito (ver §2): botão "Pedir crédito" →
descrição → toast "Verificando o resultado..." (~9s) → botão some (estorno automático).

### 1.10 Vídeo a partir de uma foto única ("Criar vídeo")

Painel de vídeo de **cena única**:

1. **Estilo:** "Tudo animado" (**5 créditos/cena**) vs. "Tudo estático" (**grátis**).
2. **Áudio e branding:**
   - **Música:** 5 gêneros — Acústico, Chill, Cinema, Eletrônica, Animado. Faixa sorteada
     por vídeo (ex. "Batidas Chill · Faixa 6"); não dá para escolher faixa exata, só trocar
     de gênero ou embaralhar. Player embutido.
   - **Áudio de voz (narração):** só "Português" (seletor não expandiu — sugere só PT). 4
     vozes: **Bruno (Calma), Marta (Acolhedora), Cláudia (Descontraída), Adilson
     (Confiante)**. Campo de roteiro com "Escrever com IA". "Gerar áudio" = **1
     crédito/geração**. Dá para enviar áudio próprio.
   - **Marca d'água do vídeo:** logo **do usuário** (não da Pedra). Padrão: "Nenhuma logo".
3. **Refinar cada cena:** efeito de câmera, duração, custo.
4. **Prévia:** **16:9** ou **9:16**.

Nenhum vídeo de foto única foi gerado (foco foi o multi-foto).

### 1.11 Vídeo multi-foto (aba "Vídeo" do imóvel) — mapa completo

Fluxo: aba "Vídeo" → "Criar vídeo" → "Selecionar fotos" → "Próximo" → tela "Gere um vídeo a
partir de fotos", 3 blocos + prévia ao vivo.

**Bloco 1 — Estilo:** "Tudo animado" (5 créditos/cena) vs. "Tudo estático" (grátis).

**Bloco 2 — Áudio e branding**, 5 sub-seções:
- **Música de fundo** (ver 1.10).
- **Áudio de voz** — 4 vozes PT (ver 1.10), botão "+ Adicionar".
- **Marca d'água** — logo do usuário, "Carregar" / "Remover", padrão "Nenhuma logo".
- **Características** — overlay de texto/dados sobre o vídeo, **2 estilos**:
  - **"Simples":** Preço (pré-preenchido "350.000 €" — placeholder), Localização ("Chiado,
    Lisboa"), chips de métricas: Superfície Habitável, Quartos, Banheiros, **Quartos
    (duplicado — bug de UI)**, Estacionamento, Aquecimento, Espaço Exterior.
  - **"Marca":** identidade de agente — Cor, Enviar foto, Preço, Status ("À VENDA"),
    Telefone/Site (nº português de exemplo), + os campos da Simples.
- (removido depois de documentar, sem impacto no custo)

**Bloco 3 — Refinar cada cena:** uma cena por foto, com efeito/duração/custo + "+ Adicionar
cena".
- **Efeitos (4):** **Zoom In, Zoom Out, Transição, Mágico**.
  - **Transição:** abre "Selecionar segunda imagem para transição" — *"Movimento suave de
    câmera de uma imagem para outra. Para melhores resultados, use imagens do mesmo
    ambiente com iluminação e altura similares."*
  - **Mágico:** abre "Selecionar a versão editada desta foto" — *"Escolha uma versão
    editada desta foto (vazia, mobiliada ou renovada) e geraremos um vídeo de transformação
    com efeito mágico."* → **before/after animado** (ex. vazio → mobiliado). Formato de alto
    engajamento em redes.
- **Duração por cena:** 4s (padrão) ou 8s (+5 créditos).
- **Mostrar título / Mostrar legenda:** toggles por cena (off por padrão).
- **"+ Adicionar cena"** → 3 tipos: **Foto ou vídeo** · **Mapa** ("clipe de mapa com zoom
  no local do imóvel" — pede endereço, "Gerar mapa") · **Tela final** (encerramento com
  nome/contato/foto/marca — pré-preenchido com dados da conta).

**Configurações do vídeo (engrenagem):**
- **Fonte:** Inter (padrão), Montserrat, Playfair Display.
- **Cor do texto:** Branco (padrão), Preto, Marca, Personalizado.
- **"Não recortar fotos nos vídeos"** (toggle): foto inteira letterboxed vs. recortada.

**Prévia:** "Quadro N de M" + seletor **16:9 / 9:16**. **Não existe 1:1 (quadrado)** em
nenhuma tela de vídeo.

**Custo total:** persistente no rodapé, atualizado em tempo real, antes de "Gerar vídeo".

### 1.12 Marca d'água "Made with Pedra.ai" — só em conteúdo de demonstração

A conta tem um **imóvel de demonstração pré-carregado** com o mesmo padrão de nome
("Imóvel [data]") e **2 vídeos de exemplo prontos** — esses vídeos de demo carregam a marca
**"Made with 🐿 Pedra.ai"** centralizada. Um deles é exatamente o efeito "Mágico".

**Mas o vídeo real gerado pela conta Pro NÃO carrega essa marca** (ver 1.13). A marca
parece exclusiva do conteúdo de demo pré-fabricado — consistente com as imagens.

### 1.13 Bloco 7 — geração real do vídeo multi-foto (A+C+D+G)

Upload de A (sala vazia), C (sala ampla, ventilador), D (cozinha "meio render") e G
(varanda à noite). Aba "Vídeo" → "Criar vídeo" → 4 fotos → "Próximo" → **configuração
padrão**: Estilo "Tudo animado", música "Batidas Chill · Faixa 2", voz off, sem marca, sem
Características, **16:9**, 4 cenas com efeito padrão **"Zoom In"** de 4s cada.

- **Custo antes de gerar:** 20 créditos (4 cenas × 5).
- **Cronometragem:** clique 06:40:33 UTC → pronto 06:42:04 UTC → **≈91 s** (estimativa da
  tela: "2-5min").
- **Custo real (histórico):** "Imagens animadas para vídeo · 4 fotos · -20". Saldo 84 → 64.
- **Resultado:** 4 cenas, **~13 s** total, efeito "Zoom In" (Ken Burns — zoom/pan sobre
  imagem estática, **não** paralaxe 3D real), música ao longo, corte direto entre cenas.
- **Marca d'água:** **nenhuma** em nenhum dos 4 quadros (verificado por reprodução + zoom
  na interface; arquivo não baixado). **Confirma: Pro não recebe marca d'água em vídeo.**
- **Qualidade (autoavaliação): 4/5.** Coeso, transições limpas, boa trilha, sem erros — mas
  efeito de câmera simples, não uma "tour" dinâmica.

---

## 2. Política de crédito (Bloco 6)

Forçamos um resultado ruim: Mobiliar na foto mais escura/problemática (F) com estilo pouco
compatível.

**Fluxo:**
1. No card da imagem ruim, ao lado do "👍", aparece **"Pedir crédito"**.
2. Abre modal **"Peça seu crédito de volta"**.
3. Banner (transcrição): *"Você não paga por resultados falhos. Conte-nos o que deu errado
   e devolvemos o crédito."*
4. Campo de texto livre para descrever o problema.
5. Ao enviar: toast **"Verificando o resultado..."** por ~8 s.
6. Crédito devolvido **automaticamente** (confirmado por saldo antes/depois). Sem aprovação
   humana visível.

**Achado (Configurações › Assinatura e créditos › "Ver histórico de créditos"):** cada
linha "Crédito reivindicado" tem um ícone (ⓘ) que no hover revela a **justificativa exata
que o classificador automático escreveu, em inglês**, + miniatura:

- **Falha forçada:** *"The AI generated a living room instead of a bathroom, which is a
  major technical failure."* (o classificador inferiu tipo de cômodo — não bate 100% com
  nossa descrição da fonte; de todo modo prova que há um classificador comparando resultado
  vs. expectativa antes de aprovar o estorno.)
- **Falha real (Remover objeto):** *"The marked orchid is still clearly visible in the
  result image."* (bate perfeitamente com o observado.)

→ **A política de crédito roda sobre um classificador de IA com "opinião" própria** — não é
estorno incondicional só porque o usuário reclamou. Não testamos abuso (pedir estorno de
resultado bom) — não se sabe se há limite de tentativas ou 2ª camada anti-abuso.

Cross-validado em 2 casos (1 forçado + 1 real): mesmo fluxo, mesmo texto, estorno
automático consistente.

---

## 3. Billing (Bloco 10)

Configurações da conta: 6 abas — Conta, Assinatura e créditos, Faturação, Branding, Redes
sociais, API. **Nada foi alterado.**

**Conta:** Plano **Pro**, 1 membro, **100 créditos/mês**, 84 restantes no momento,
renovação "8 de octubro" (**bug de i18n: "octubro" em espanhol**). Fatura mais recente:
**08 Sept 2026 — 29 €**.

**Preços (site público `pedra.ai/pricing`, não a área logada):**

| Plano | Preço | Créditos | Obs. |
|---|---|---|---|
| **Pro Mensal** | €29/mês | 100/mês | cancelável a qualquer momento; vídeos/tours/plantas "ilimitados"; API |
| **Pro Anual** | €239/ano (≈€20/mês) | 1.200/ano | "4 meses grátis"; suporte prioritário + app mobile |
| Pacotes extras (mensal) | €52–€120/mês | 200–600/mês | €0,26–€0,20 por crédito |
| Pacotes extras (anual) | €432–€1.008/ano | 2.400–7.200/ano | €0,18–€0,14 por crédito |
| **Teste grátis** | grátis, sem cartão | 7 créditos img + 1 vídeo + 1 tour | ⚠ o teste v1 (08/09) observou **0 créditos** na conta real — divergência com o anunciado |

**Não testado:** upgrade/downgrade, cancelamento, troca de pagamento (botões "Editar
assinatura" e "Aumentar créditos mensais" existem, não clicados).

Módulo **Planta** tem serviço pago à parte, fora de créditos: **"Desenhamo-la por ti"** (a
equipe da Pedra desenha a planta, 2-3 dias úteis) por **19,00 € + IVA** avulso.

---

## 4. Módulos do Bloco 8

### 4.1 Tour virtual 360°

Exige **fotos panorâmicas 360°** — não aceita fotos comuns. Modal "Passo 1: Carregue suas
fotos 360°" pede mín. 2, máx. 70. **Não testado** por falta de fotos 360 no kit (exige
câmera tipo Ricoh Theta / Insta360 ou app de captura panorâmica).

### 4.2 Planta — mapa completo (destaque)

"Nova planta" → **3 caminhos**:
1. **"A partir de um esboço ou planta antiga"** — a Pedra "lê" as paredes e entrega planta
   editável. **1 crédito.**
2. **"Desenhar do zero"** — editor de planta completo. **Grátis.**
3. **"Desenhamo-la por ti"** — humano da equipe Pedra desenha, 2-3 dias úteis. **19 € +
   IVA** avulso.

**Testamos "Desenhar do zero":** editor tipo **CAD 2D completo** — ferramentas Selecionar,
Mover, Divisão (cômodo), Parede, Porta, Janela, Mobiliário. **Medidas calculadas
automaticamente em tempo real** (desenhamos um retângulo → "7.10m × 4.85m = 33.25 m²"
instantâneo, contador de área total no painel). Ferramenta de porta insere vão com
indicador de abertura. **Catálogo de mobiliário pesquisável por cômodo**, cada item com
dimensões reais (ex. "Sofá · 2.00 × 0.90"). Menu "Ver" liga/desliga Nomes/Áreas/Medidas/
Mobiliário/Grelha e troca Metros ⇄ Pés. Botão "Descarregar" para exportar (não testado).
Salva automático na aba "Planta" ("Rés do chão" por padrão).

### 4.3 Social

Escondido no botão "+". *"Transforme suas fotos em meses de conteúdo para redes sociais em
2 minutos."* — "Posts e carrosséis prontos", "Otimizado para Instagram, Facebook e
LinkedIn", **"Pensado para imobiliárias (não influenciadores)"**.

Wizard **"Configure sua marca":** logotipo, foto do agente, cor principal, **tom de voz**
(Profissional / Amigável / Luxo / Casual) para as legendas por IA, **3 templates visuais**:
"Luxo Minimalista", "Moderno Ousado", "Editorial Acolhedor" (cada um com prévia de anúncio
fictício em Barcelona). Pede e-mail + telefone. **Fechado sem preencher** (não conectamos
Instagram/Facebook/YouTube — OAuth, fora do que podemos autorizar).

**Redes suportadas:** Instagram (conta comercial/criador), Facebook (Páginas),
YouTube, TikTok ("Em breve").

---

## 5. Export / API (Bloco 9)

**API REST pública e documentada** (`pedra.ai/api-documentation`). Área logada:
Configurações › API mostra só "Click to generate API key" (não clicado).

- **Auth:** `apiKey` no corpo JSON. Chaves de longa duração; doc avisa para não expor
  client-side.
- **Staging:** `/api/furnish`, `/api/empty_room`, `/api/renovation`, `/api/edit_via_prompt`,
  `/api/remove_object`.
- **Melhoria:** `/api/enhance`, `/api/enhance_and_correct_perspective`, `/api/sky_blue`,
  `/api/blur`.
- **Vídeo:** `/api/create_video`.
- **Conta:** `/api/credits`, `/api/feedback` (provável endpoint do botão "Pedir crédito").
- **Comportamento:** síncrono (sem polling), ~10-30s imagens, até 10 min vídeo.
- **Preço:** "por geração bem-sucedida, com descontos por volume" + teste grátis. Sem
  tabela de rate limits na página.
- **Não expostos na API** (existem só na web): `change_floor`, `change_wall`, `convert_hd`,
  `remove_watermark`, `change_camera_angle` — recursos mais novos ainda não na API (ou não
  capturados no resumo).
- **Servidor MCP oficial** no GitHub (`pedra-ai/pedra-mcp`): *"AI real-estate photo editing
  inside Claude, ChatGPT, Cursor"* — a Pedra já expõe as ferramentas como MCP plugável em
  assistentes de IA.

Web: cada foto tem "Baixar" (com submenu "..." não aberto) e "Compartilhar" (não testados).

---

## 6. Achados fora do escopo do briefing

1. **Inversão de preço "Alta < Média"** idêntica em Mobiliar e Renovar (Alta = 1, Média =
   2). Intencional ou erro de precificação?
2. **"Mudar piso" e "Mudar parede"** — ferramentas dedicadas com listas de materiais
   próprias, separadas do "Renovar".
3. **"Aplicar efeito cortina"** só em fotos já geradas por IA — não testada.
4. Menu de edição de fotos **já geradas** é mais enxuto que o de fotos originais.
5. Vídeo multi-foto tem: cena de **Mapa** (endereço → clipe), **Tela final**
   (encerramento auto-preenchido), efeito **Transição** (câmera entre 2 fotos), efeito
   **Mágico** (before/after animado vazio→mobiliado — alto engajamento).
6. Bug de UI: **"Quartos" duplicado** na lista de métricas do overlay de vídeo.
7. **Imóvel de demonstração pré-carregado** com o mesmo padrão de nome de imóveis novos.
8. **Histórico de créditos** (Configurações › Assinatura e créditos) — tela muito útil:
   data/hora com fuso, tipo e custo de cada geração + justificativa do classificador de
   estorno no hover. Foi como confirmamos os custos de Melhorar/Corrigir/HD/Céu/Remover
   objeto.
9. **Bug de i18n:** "8 de octubro" (espanhol) em interface portuguesa.
10. **Planta** tem editor 2D completo e **grátis** com medição automática e catálogo de
    móveis com dimensões reais — além das opções pagas.
11. **API REST pública** + **servidor MCP oficial** — a Pedra investe em uso programático,
    não só app web.
12. **A interface é pt-PT, não pt-BR:** "telemóvel", "Faturação", "Rés do chão", exemplos
    em Lisboa/Barcelona, "€", telefone em formato português, bug "octubro". A localização
    brasileira de verdade (pt-BR, R$, cidades BR, CRECI) é uma lacuna real.

---

## 7. Anexos

Nenhum arquivo baixado da Pedra — verificações visuais por reprodução + zoom efêmero na
ferramenta de automação, não salvas. As 8 fotos de teste e o `README.md` foram fornecidos
pelo usuário. Preços (§3) e API (§5) vêm do site público, via busca na web.

Arquivos do relatório:
- `pedra_qa_planilha.xlsx` — tabela comparativa
- `relatorio-teste-v2.md` — este documento

---

## 8. Pendências para uma próxima sessão

Todos os 10 blocos concluídos. Resta (nada bloqueante):
1. **Tour 360°** — só executável com fotos panorâmicas 360°.
2. **Vídeo de foto única** — interface mapeada, geração não feita.
3. **Efeitos "Transição" e "Mágico"** — mapeados via modais, não usados na geração real.
4. Menores: submenu "..." do "Baixar"; fluxo "Compartilhar"; "Aplicar efeito cortina".
