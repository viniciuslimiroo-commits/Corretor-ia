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
