# Distância até a Pedra — mapa de funcionalidades (12/09/2026)

Base: `pedra-teardown/relatorio-teste-v2.md` (teste com conta Pro em 09/09/2026).
Posicionamento continua o de [[posicionamento-nao-e-clone]]: **replicar funcionalidade
é legítimo; nome, marca, textos e visual são nossos.**

Legenda: ✅ temos · ⚠️ parcial · ❌ falta

## Editar com IA

| Pedra | Encena hoje | O que falta | Esforço |
|---|---|---|---|
| Mobiliar: criatividade Alta/Média, 10 tipos de espaço + custom, 9 estilos + custom, "usar móveis de outra imagem", posição Auto/Desenhar | ⚠️ só "Mobiliar (estilo Moderno)" | tipo de espaço, escolha de estilo (incluir estilos brasileiros), criatividade, posição pelo pincel que já existe, móveis de referência | 2 dias |
| Renovar (reforma virtual): nível, tipo, estilo, móveis Auto/Com/Vazio | ❌ | ação nova, mesmos modelos, prompt parametrizado | 1 dia |
| Esvaziar | ✅ | | |
| Remover objeto: Auto e Desenhar | ⚠️ só Desenhar | modo Auto (detecção + segmentação) | 2 dias |
| Mudar piso (8 materiais) | ❌ | ação com lista de materiais; pipeline já provou "trocar piso" | 1 dia |
| Mudar parede (4 materiais) | ❌ | idem | meio dia |
| Melhorar | ✅ | | |
| Corrigir perspectiva | ❌ | prompt ou correção geométrica; qualidade a validar | 1 dia |
| Converter em HD | ⚠️ upscale roda dentro de toda geração | expor como ação avulsa | 2 horas |
| Céu azul: 5 opções | ⚠️ só pôr do sol | ensolarado, sem reflexos, amanhecer, noite | 2 horas |
| Editar via prompt | ❌ | campo livre com guarda-corpo de conteúdo | meio dia |
| Mudar ângulo da câmera, Desfocar, Efeito cortina | ❌ | prompts; baixa prioridade | meio dia cada |
| Remover marca d'água | ❌ | **não fazer**: remover marca alheia é risco jurídico | |

## Por foto e organização

| Pedra | Encena hoje | O que falta | Esforço |
|---|---|---|---|
| Imóveis (projetos) com fotos agrupadas e histórico | ❌ upload avulso, sem histórico | tabela `properties` já existe no schema; galeria por imóvel, lista de gerações | 4 dias |
| Marca d'água com logo do usuário | ❌ | upload do logo (Branding) + composição no export | meio dia |
| Adicionar legenda | ❌ | texto sobre a imagem no export | 2 horas |
| Compartilhar (link) | ❌ | página pública com URL assinada longa | meio dia |
| Baixar / export | ✅ e **melhor** (por portal BR) | | |
| Histórico de créditos com justificativa | ❌ dados existem no ledger | tela | meio dia |
| Selo "imagem ilustrativa" | ✅ **só nós** | | |

## Vídeo (a Pedra cobra 5 créditos por cena animada)

| Pedra | Encena hoje | Esforço |
|---|---|---|
| Vídeo de 1 foto e multi-foto; estático grátis, animado 5 cr/cena | ❌ | |
| Efeitos: Zoom In, Zoom Out, Transição entre fotos, Mágico (antes/depois animado) | ❌ | |
| Música: 5 gêneros, faixa sorteada | ❌ | |
| Narração: 4 vozes PT, roteiro com IA, 1 cr | ❌ | |
| Overlay: preço, localização, métricas, marca do corretor | ❌ | |
| Cenas extras: Mapa (endereço → clipe), Tela final (contato) | ❌ | |
| Título/legenda por cena, fonte, cor, 4s/8s, 16:9 e 9:16 | ❌ (e o plano prevê 1:1 e 4:5, que a Pedra não tem) | |
| **Total do bloco** | | **2 a 3 semanas**, e uma decisão técnica antes: onde renderizar (Vercel não tem ffmpeg nem tempo; opções: serviço com ffmpeg em container, API de render, ou render no navegador) |

## Módulos separados

| Pedra | Esforço | Observação |
|---|---|---|
| Tour virtual 360° (fotos panorâmicas, viewer, hotspots) | 1 semana básico | exige câmera 360 do cliente; nicho |
| Planta: esboço → planta (1 cr), editor CAD grátis, humano desenha (19 €) | semanas | o editor CAD é um produto inteiro; o "esboço → planta" via modelo é 2 dias |
| Social: posts e carrosséis, tom de voz, templates, publicar no Instagram/Facebook/YouTube | 1 a 2 semanas só a geração; publicar via OAuth é mais | |
| API REST pública + servidor MCP | 3 a 4 dias | rotas já existem, falta chave de API e documentação |

## Política, billing e marca

| Pedra | Encena hoje | O que falta | Esforço |
|---|---|---|---|
| "Pedir crédito" com classificador de IA que julga o resultado | ⚠️ botão manual, 3 estornos/dia | classificador com modelo de visão comparando antes/depois | 2 dias |
| Pro mensal, Pro anual, pacotes extras de créditos | ⚠️ 1 plano + 1 pacote | plano anual e pacotes maiores na Stripe | 1 dia |
| Branding (logo, cor, foto do agente) | ❌ | tela de configurações | 1 dia |
| Interface pt-BR, R$, Pix, entidade BR | ✅ **só nós** (Pedra é pt-PT e euro) | | |

## Resumo honesto

Das ~30 capacidades da Pedra: **5 temos por inteiro, 6 parcialmente, ~19 faltam.**
Somando tudo que é replicável com a equipe atual (eu), são **8 a 12 semanas** de
trabalho, sendo o vídeo o bloco mais caro e o que mais exige decisão de arquitetura.
Planta (editor CAD) e Social com publicação são produtos à parte e ficam por último.

O que a Pedra **não** tem e nós temos: export por portal brasileiro, selo de imagem
ilustrativa, pt-BR de verdade, cobrança em real, custo real por geração.

## Fase A — feita em 12/09/2026

Catálogo de ações (`web/src/lib/acoes.ts`) alimenta servidor e tela. Testado, cada um
com geração real:

| Item | Estado |
|---|---|
| Mobiliar: tipo de espaço (12 + "outro"), estilo (10, com Praiano e Tropical, + "outro"), intensidade | ✅ pela interface |
| Mobiliar só onde eu pintar (FLUX Fill) | ✅ pela interface; primeira rodada caiu na checagem de igualdade (mudança local), corrigido |
| Mobiliar com móveis de outra foto (2ª imagem pro Nano Banana) | ⚠️ implementado, não testado |
| Renovar (nível, tipo, estilo, móveis) | ✅ pela API, cozinha escandinava |
| Mudar piso (10 materiais) | ✅ pela interface, cimento queimado |
| Mudar parede (10 acabamentos) | ⚠️ implementado, mesmo pipeline do piso, não testado |
| Trocar céu (5 opções) | ⚠️ implementado, não testado nas opções novas |
| Converter em HD (só upscale, sem modelo; recusa foto já grande sem cobrar) | ✅ pela API, 900px → 2560px em 19s |
| Editar com texto | ✅ pela API: "almofadas amarelas e tirar o tapete" saiu exato |
| Histórico com miniaturas e movimentação de créditos | ✅ |
| Minha marca: logo e cor | ✅ |
| Export com legenda e logo do corretor | ✅ conferido na imagem |
| Interface nova: app shell, editor em passos, comparador antes/depois | ✅ |

Fora de propósito: remover marca d'água (jurídico). Ficou pra Fase B: remover objeto
automático, corrigir perspectiva.

## Fase B — feita em 12/09/2026

Migration 08 (`web/supabase/migration-08-imoveis-compartilhar-avaliacao.sql`). A foto
original passa a ficar guardada (`jobs.input_path`): sem ela não existe antes/depois na
galeria, no link público, nem no avaliador.

| Item | Estado |
|---|---|
| Imóveis: lista, criar, renomear, endereço, capa, excluir (`/imoveis`, `/api/imoveis`) | ✅ testado pela API e pela tela |
| Galeria por imóvel com antes/depois, baixar, tirar do imóvel | ✅ pela tela |
| Seletor "Guardar em" no editor, `?imovel=` vindo da página do imóvel | ✅ (primeira versão perdia o parâmetro no modo estrito do React; corrigido lendo a URL no estado inicial) |
| Compartilhar foto ou imóvel: link público `/c/{token}`, copiar, WhatsApp, desativar | ✅ testado; página conferida no celular (375px) |
| Página pública com nome, CRECI, WhatsApp e logo do corretor | ✅ |
| Classificador de estorno (`fal-ai/any-llm/vision`, gemini-2.5-flash-lite, antes+depois+pedido+relato) | ✅ disse "ok" pra reclamação falsa em resultado bom (8,7s) e "falhou" nos dois casos ruins forjados (sem mudança; ação diferente da pedida) |
| Política de estorno: confirmado pelo modelo até 10/dia; cortesia até 3/dia; o resto vai pra análise manual; justificativa no histórico | ✅ |
| Remover objeto: modo automático (descreve ou deixa em branco = tirar bagunça) | ✅ cozinha real: bancada limpa, móveis e eletrodomésticos intactos. Nano Banana recusou o prompt (filtro de conteúdo, 422) e o fallback pro Kontext resolveu |
| Corrigir perspectiva | ✅ roda; efeito sutil na foto de teste, que já era reta |
| Mudar parede (pendente da Fase A) | ✅ terracota, piso e janelas intactos |
| Trocar céu, opção nova (pendente da Fase A) | ✅ ensolarado na fachada |
| Planos: Pro anual (R$ 690, 960 créditos na hora) e pacotes de 20 e 200, por `lookup_key` na Stripe; página `/planos` | ✅ checkout aberto pras 4 ofertas novas em modo teste |
| Minha marca: nome, CRECI, WhatsApp | ✅ |

Duas lições que mudaram código (registradas no log do task-observer):

- A checagem "voltou igual?" descartou o resultado certo do modo automático de remover
  objeto, dos dois modelos, porque tirar bagunça muda poucos pixels. É o mesmo erro da
  máscara (observação 0012), reincidido por outra porta. Remover objeto ficou sem a
  checagem; quem julga é o avaliador.
- Uma fila que responde COMPLETED e depois 422 na resposta é falha do provedor; antes
  ia direto pro estorno, agora tenta o segundo modelo.

Ficou de fora, de propósito: "Mudar ângulo da câmera", "Desfocar", "Efeito cortina" (baixo
uso, prompts simples quando alguém pedir).

## Fase C — vídeo, primeira versão no ar em 12/09/2026

**Onde renderiza (decidido medindo, não supondo):** ffmpeg estático dentro da própria
Vercel, em etapas curtas -- uma cena por chamada, a montagem final numa chamada. Medido
em produção: cena de 4s em 1080x1920 leva 8-10s, a montagem de um vídeo de 15s leva 23s;
vídeo de 3 cenas + tela final + música ficou pronto em 69s de ponta a ponta (48s local).
Cabe nos 300s do plano Hobby com folga pra vídeos de até ~40s. Sem servidor novo, sem
conta nova. Detalhes que custaram tempo: o binário linux do pacote `ffmpeg-static` e o
do johnvansickle **não têm drawtext**; o que serve é o do BtbN (173 MB), baixado no
build por `web/scripts/ffmpeg-linux.mjs`. Migration 09 (`videos`, `debitar_creditos`).

| Pedra | Encena | Estado |
|---|---|---|
| Vídeo de 1 ou várias fotos, Zoom In/Out | Cenas de foto com Aproximar, Afastar, Passear ←/→, Parado (Ken Burns) | ✅ produção |
| Transição entre fotos | Suave (crossfade) ou Corte | ✅ |
| "Mágico" (antes/depois animado) | Cena **Antes e depois**: cortina passa da original pro resultado, com rótulos | ✅ |
| Cena animada (5 cr) | Cena **animada** por image-to-video (wan 2.2), presets Drone, Caminhar, Girar, Aproximar; 2 créditos; se falhar vira foto e devolve | ✅ código; teste em produção logo abaixo |
| Música: 5 gêneros | 5 faixas próprias geradas por IA (stable-audio-25): Calma, Elegante, Moderna, Alegre, Cinematográfica, 45s em loop, fade | ✅ |
| Narração: 4 vozes, roteiro com IA, 1 cr | 4 vozes ElevenLabs (pt), roteiro escrito por IA a partir de título/preço/local/legendas, 1 crédito; música abaixa quando fala | ✅ código; teste em produção logo abaixo |
| Overlay: preço, localização, marca | Carimbo de título + preço · local no topo; legenda por cena; **tela final** com logo, nome, CRECI e WhatsApp da Minha marca | ✅ |
| Tela final (contato) | idem | ✅ |
| 16:9 e 9:16, 4s/8s | **9:16, 16:9, 1:1 e 4:5** (a Pedra não tem os dois últimos); 3 a 8 s por cena | ✅ |
| Mapa (endereço → clipe) | — | ❌ (precisa de chave de mapas; depois) |
| — | **Clipes do próprio corretor** (MP4/MOV enviados direto pro bucket, até 120 MB), com "melhorar cor e nitidez" | ✅ (pedido do Vinicius) |
| — | Compartilhar vídeo por link público (`/c/{token}`) com player e WhatsApp | ✅ |

Pedidos do Vinicius em 12/09 e onde entraram: **drone** = preset da cena animada;
**tour** = sequência de cenas com Caminhar/Girar (tour por vídeo; o tour 360° de fotos
panorâmicas continua na Fase D, exige câmera 360); **antes e depois** = cena própria;
**colocar um vídeo e melhorar** = cena de clipe com correção de cor/nitidez (o upscale
por IA de vídeo é caro -- Topaz no fal -- e fica pra quando houver demanda).

## Imobiliárias: conta de equipe e planos, 12/09/2026

O produto atende corretor autônomo **e** imobiliária. A Pedra cobra por cadeira
(€29/pessoa); o nosso diferencial é **plano por equipe**: créditos compartilhados, cada
corretor com seu login, gestor vê o uso de cada um, marca da casa como padrão. Conta de
custo e margem em `docs/precos-e-margens.md`.

Migration 10 (`organizations`, `org_members`, `org_convites`, `liberacoes_creditos`,
`org_id` em jobs/videos/properties/ledger, funções `debitar_creditos_org` /
`adicionar_creditos_org`). Regra única em `web/src/lib/cobranca.ts`: membro de
imobiliária gasta da imobiliária; créditos pessoais ficam congelados até sair; quem cria
leva os próprios créditos.

| Item | Estado |
|---|---|
| Planos: Pro (R$ 69 / R$ 690), Equipe (R$ 249 / R$ 2.490, 5 pessoas, 400 cr/mês), Imobiliária (R$ 599 / R$ 5.990, 15 pessoas, 1.200 cr/mês); pacotes pros dois | ✅ preços na Stripe (teste) por lookup_key; tela `/planos` com os dois públicos |
| Anual paga 10 meses e libera créditos **mês a mês** (metadata `creditos_por_mes`, tabela `liberacoes_creditos`, cron diário `/api/cron/liberacoes` com CRON_SECRET) | ✅ testado em produção: assinatura anual da imobiliária → +400 e 11 parcelas agendadas → cron liberou +400 → cancelar apagou as parcelas |
| Tela `/equipe`: criar imobiliária, convidar por e-mail (entra ao logar), membros com uso do mês, papéis dono/gestor/corretor, sair, marca da casa | ✅ testado pela API de ponta a ponta e pela tela |
| Débito/estorno de fotos e vídeos na conta certa; marca da imobiliária como padrão em export, vídeo e link público | ✅ vídeo de um corretor membro debitou da imobiliária |
| Webhook: acha a conta (pessoa ou imobiliária) pelo customer; `charge.refunded` apaga parcelas futuras | ✅ |

Bug herdado e corrigido: o webhook devolvia 500 (pra Stripe tentar de novo) sem apagar o
registro de idempotência, então a retentativa seria tratada como duplicata e o crédito
nunca entraria. Agora o registro sai antes do 500.

Fora desta versão: painel do gestor com as fotos e vídeos de toda a equipe (hoje ele vê
contagens); boleto e nota fiscal; mais de 15 pessoas (sob medida, por contato).

## Ordem proposta

**Fase A — edição completa (1 semana).** Mobiliar completo (tipo de espaço, estilos com
opções brasileiras, criatividade, posição pelo pincel), Renovar, Mudar piso, Mudar parede,
Céu com 5 opções, Converter em HD, Editar via prompt, Histórico de créditos, marca d'água
do usuário e legenda. Fecha a paridade em foto, que é o uso diário do corretor.

**Fase B — organização e confiança (1 a 2 semanas).** Imóveis com galeria e histórico,
Compartilhar, classificador de estorno, plano anual e pacotes, Corrigir perspectiva,
Remover objeto automático, Branding.

**Fase C — vídeo (2 a 3 semanas).** O bloco inteiro, começando pela decisão de onde
renderizar. O plano de produto chama o vídeo de "herói" e prevê 1:1 e 4:5, que a Pedra
não oferece: é aqui que dá pra passar a Pedra, não só alcançar.

**Fase D — plataforma.** API + MCP, Social, Tour 360, Planta.
