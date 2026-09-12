# Bateria com fotos reais: o que funciona, o que sai artificial (12/09/2026)

24 casos, fotos reais de imóveis (Pexels: apartamentos, casas, cozinhas, varanda,
fachadas) e três variantes "de celular" geradas de propósito: 900-1100px, JPEG a 50-55%
de qualidade, uma delas escurecida. Rodou 3 de cada vez contra o servidor, como o lote
faz. Imagens antes/depois em `docs/testes-reais/`, números em `log.json`.

**Resumo:** 22 de 24 concluíram. Tempo médio 57s (mínimo 36s, máximo 99s). Custo real
US$ 0,13 por geração, três vezes o que eu vinha usando na conta de margem — ver "custo"
abaixo, isso muda o preço. Duas falhas, as duas viraram correção de código.

## Ação por ação

| Ação | Veredito | O que observei |
|---|---|---|
| **Mobiliar** (4 casos) | ✅ o melhor do produto | Arquitetura intacta nos quatro: janelas, portas, lareira, ventilador, estantes e piso continuam iguais. Móveis com escala correta e sombra coerente. Estilo obedecido (escandinavo, praiano, tropical). |
| **Mobiliar em foto JÁ mobiliada** | ⚠️ faz mais do que promete | No caso 03 (sala com sofá azul) ele trocou os móveis **e** mudou a parede do fundo para um mármore que não existia, e as cortinas escuras viraram claras. Quem pede "mobiliar" numa foto mobiliada recebe "renovar". Corrigir com aviso na tela. |
| **Renovar** | ✅ | Cozinha vazia virou cozinha completa com bancada e armários; janela e proporções preservadas. É reforma virtual mesmo, como prometido. |
| **Esvaziar** | ✅ com ressalva | Sala e cozinha ficaram limpas e o piso foi reconstruído sem borrão. Na cozinha ele apagou a ilha inteira e refez o piso por baixo, bem. Ressalva: em ambiente que já está quase vazio, muda pouco (ver falha 1). |
| **Remover objeto (automático)** | ✅ | Tirou bagunça de bancada sem mexer nos móveis. "Tirar o tapete" tirou o tapete e refez o piso. |
| **Mudar piso** | ✅ | Trocou só o piso; parede, rodapé e janela intactos. |
| **Mudar parede** | ✅ | Verde ficou uniforme, cortina e sofá preservados. Um caso caiu no segundo modelo porque o primeiro recusou o pedido (filtro de conteúdo), e o resultado ficou bom. |
| **Melhorar** | ✅ o mais confiável | Foto escura virou foto de anúncio, sem inventar nada. Em foto de celular ruim também. |
| **Corrigir perspectiva** | ⚠️ efeito quase nulo | Nas duas fotos testadas a diferença é mínima. Ou a foto já estava reta, ou o modelo não endireita de verdade. Precisa de foto claramente torta pra julgar; hoje não prometo isso na tela. |
| **Trocar céu** | ✅ | Entardecer e noite ficaram plausíveis, com a luz da fachada acompanhando. Não invadiu telhado nem prédio vizinho. |
| **Editar com texto** | ✅ com ressalva | "Remover o ventilador de teto" removeu. Mas a TV acima da lareira mudou de aparência. Edição livre mexe mais do que o pedido; é da natureza da ferramenta. |
| **Converter em HD** | ❓ | Falhou por erro de rede do storage, não do modelo (ver falha 2). |
| **Tour 360** | ✅ | Câmera de verdade dentro da esfera. Ver seção própria. |
| **Terreno com medidas** | ✅ | Desenho exato, sem IA. Ver seção própria. |

## As duas falhas, e o que mudei

**1. Esvaziar de varanda descartado por engano.** Os dois modelos entregaram, e a
checagem "voltou igual?" (diferença média de pixel) rejeitou os dois, devolveu o crédito
e não entregou nada. Varanda quase vazia muda pouco quando esvaziada: a medida global lê
"não mudou" e age com confiança. **É a terceira vez que essa mesma medida erra** (as
duas anteriores: máscara, na observação 0012, e remover objeto automático).

Correção: quando a medida acusa "igual", em vez de descartar, um modelo de visão olha as
duas imagens e diz se o pedido foi cumprido. Só descarta se ele confirmar. Custa US$ 0,002
e só roda no caso suspeito. Reteste da mesma varanda: **passou em 60s**.

**2. Geração perdida por 504 do storage.** O upload da foto original falhou com
"Gateway Timeout" e derrubou um trabalho já pago. Correção: três tentativas com espera
crescente, só para erros passageiros.

## Tour 360

Funciona, e é honesto: o `v360` do ffmpeg reprojeta a esfera em perspectiva a cada
quadro, então as linhas se curvam certo e o ambiente aparece de verdade. Cinco
movimentos: olhar em volta, giro completo, entrar no ambiente, panorâmica e do piso ao
ambiente. Detectamos foto 360 pela proporção 2:1 e oferecemos o tipo sozinho.

Dois problemas achados e corrigidos no caminho:
- **Rotação acumulando:** os comandos do v360 somam ao estado anterior, então a câmera
  girava feito pião e chegava de cabeça para baixo. Resolvido zerando a rotação antes de
  cada quadro.
- **Custo de render:** 8s a 1080×1920 levava 85s. Renderizando a dois terços e ampliando
  com lanczos, e mudando o campo de visão a cada 6 quadros em vez de todo quadro, caiu
  para 33s sem diferença visível. Teto de 10s por cena.

## Terreno com medidas

Sem IA, de propósito. A pessoa toca nos cantos, digita os metros de cada lado e a área;
o servidor desenha polígono, medidas, frente destacada e área no centro, em cima da foto
em até 2560px. Sai com "Medidas aproximadas · informadas pelo anunciante", que protege o
corretor. **Não gasta crédito.** Testado: 4 cantos, 4 medidas, área e título saíram no
lugar certo.

Por que não pedir para a IA desenhar: linha de lote é geometria, não estética. Modelo de
imagem entorta borda e inventa número. Aqui o que a pessoa marca é o que sai.

## Drone e sobrevoo: o que não vou fingir

Foto plana não tem o que está atrás do sofá. Empurrar e ampliar é o "arrasto" que o
próprio Vinicius reprovou. Só há dois caminhos honestos, e os dois estão no produto:
**cena animada por IA** (paralaxe real, 2 créditos) e **tour 360** (a cena inteira
existe). Um terceiro caminho, mapa de profundidade com deslocamento, dá paralaxe barata
mas quebra em borda de móvel; fica como estudo, não como promessa.

## O custo mudou o preço

Medido nesta bateria: **US$ 0,13 por geração**, contra os US$ 0,04 que eu tinha medido
antes com fotos menores. A diferença é o upscale: foto de entrada maior gera saída maior
e o upscaler cobra por megapixel.

Em real, R$ 0,72 por foto. Isso derruba a margem do plano Imobiliária de 40% para
**negativa** se o cliente usar tudo (1.200 créditos × R$ 0,72 = R$ 864 contra R$ 599 de
receita). **Tem que agir antes de vender:**

1. Baixar o alvo do upscale de 2048 para 1600px nas ações comuns (o portal aceita, e
   corta o custo quase pela metade).
2. Ou cobrar 2 créditos em "converter em HD" e nas ações que entregam acima de 2048.
3. Ou subir o preço do plano Imobiliária para R$ 899.

**Feito e medido de novo (mesma data):** alvo do upscale baixado para 1600px.
Mobiliar caiu para **US$ 0,040** e melhorar para **US$ 0,089** (o "melhorar" custa mais
porque passa por dois modelos). Saída 1600×1064, que é mais do que o portal exibe. A
média volta para perto de **US$ 0,06 (R$ 0,33)**, e a margem do Imobiliária volta a ser
positiva mesmo com uso total: 1.200 × R$ 0,33 = R$ 396 contra R$ 599.

Ainda assim, `precos-e-margens.md` está desatualizado: refazer com R$ 0,33 por crédito
antes de vender, e considerar cobrar 2 créditos no "Converter em HD" (2560px).

## O que a Pedra faz que ainda não fazemos

Do mapa em `gap-pedra.md`, seguem de fora: posts para redes sociais, planta a partir de
esboço, editor de planta, mapa no vídeo (endereço vira clipe), API pública e servidor
MCP. Nenhum é bloqueio para vender; todos são expansão.
