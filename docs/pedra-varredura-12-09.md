# Varredura da Pedra, menu por menu (12/09/2026)

Feita na conta do Vinicius (plano Free, 4 créditos), navegando cada aba e submenu.
Complementa o teste de 09/09 (`pedra-teardown/relatorio-teste-v2.md`), que cobriu o que
cada ferramenta FAZ. Aqui é a arquitetura do produto: onde as coisas ficam, o que é pago
e o que não é.

## Estrutura

```
Imóveis (lista)            ← página inicial de quem entra
Convidar membros           ← item de primeiro nível, não escondido
Tutoriais
Configurações
 └ Conta · Assinatura e créditos · Faturação · Branding · Redes sociais · API

Imóvel (aberto)
 └ abas: Fotos · Vídeo · Tour virtual · Planta · (+)
```

## O que achei de mais importante

### 1. O modelo de crédito é outro, e vende melhor que o nosso

Na Pedra, **crédito só existe para IA de imagem**. Está escrito na página de preços:

| Item | Custa |
|---|---|
| Foto editada com IA (mobiliar, esvaziar, renovar, remover, prompt) | 1 crédito |
| Foto animada (virar clipe com movimento) | **5 créditos** |
| Renderizar planta | 2 créditos |
| **Vídeos** | **ilimitado** |
| **Tours virtuais 360** | **ilimitado** |
| **Desenhar plantas** | **ilimitado** |
| **Publicação em redes sociais** | **ilimitado** |

Nós cobramos 1 crédito pelo vídeo montado. **Isso é uma desvantagem de percepção e não
tem justificativa de custo**: vídeo, tour e terreno rodam no nosso servidor e custam CPU,
não IA. Recomendo tornar vídeo, tour 360 e terreno **sem crédito**, e manter crédito só
onde há IA de verdade: foto editada (1) e cena animada (2, contra 5 deles).

Efeito colateral bom: "vídeo ilimitado" vira argumento de venda, e o custo real por
cliente quase não muda.

### 2. Tour virtual deles é INTERATIVO, o nosso é vídeo

"Carregue suas fotos 360°, 0/70 fotos. Carregue pelo menos 2 fotos para criar navegação
entre os espaços." É um tour navegável, em que o comprador arrasta e anda de cômodo em
cômodo por pontos de ligação. O nosso 360 é um vídeo com câmera passeando.

São produtos diferentes, e o interativo é o que o comprador espera quando lê "tour
virtual". Dá para fazer sem IA: uma página pública com visualizador de esfera e pontos
de ligação entre fotos. **Recomendo fazer os dois:** o vídeo (bom para Reels) e o
interativo (bom para o anúncio).

### 3. Planta: eles medem sozinhos

"Desenhe uma planta desta propriedade, ou converta um esboço ou foto numa. As divisões
medem-se sozinhas nos dois casos." Renderizar planta custa 2 créditos; desenhar é
ilimitado. Temos zero disso. O nosso "terreno com medidas" é primo pobre e resolve outro
problema (lote, não planta baixa).

### 4. Atalho de processar no upload

Na aba Fotos, embaixo da área de upload: "Ou carregue e processe diretamente" com quatro
botões: **Renovar · Esvaziar · Mobiliar · Renderizar planta**. Sobe a foto e já aplica.
Um clique a menos que o nosso fluxo. Barato de copiar e melhora o uso diário.

### 5. Branding tem mais do que o nosso

Marca d'água, foto do profissional, telefone, cor da marca, **fonte do vídeo** (Inter,
Montserrat, Playfair Display), **cor do texto do vídeo** (branco, preto, marca,
personalizado) e **"não recortar fotos nos vídeos"** (foto inteira com barra, ou foto
cortada). Temos logo, cor, nome, CRECI e WhatsApp; faltam fonte, cor do texto e a opção
de não cortar.

### 6. Notificação por e-mail quando o vídeo fica pronto

Em Configurações › Conta: "Enviar-me um e-mail quando um vídeo estiver pronto". Resolve
exatamente o problema que o nosso vídeo tem hoje (a aba precisa ficar aberta). **Deve
entrar.**

### 7. Login: Google e e-mail, com troca entre os dois

Em Conta: "Login do Google · Mudar para login por e-mail". Mesma coisa que acabei de
fazer aqui, então estamos em paridade assim que a credencial do Google for criada.

### 8. Idioma

Configurações › Conta › Idioma: Português, com troca. A Pedra é espanhola e traduziu.
Português deles tem erro ("Faturação", "divisões", "Carregar fotos"): é português de
Portugal. **Isso é vantagem nossa e dá para usar na venda:** o Encena é escrito em
português do Brasil, por brasileiro.

### 9. API e redes sociais

API: "Acessar a API da Pedra · Click to generate API key", incluída nos dois planos.
Redes sociais: conectar Instagram (conta comercial), Facebook (páginas), YouTube, TikTok,
com publicação direta. Não temos nada disso.

### 10. Preço e pacotes

Pro mensal 29€ (100 créditos), Pro anual 239€ (1.200 créditos, "4 meses grátis"). Mais
créditos é **upgrade de plano**, não pacote avulso: 200 a 600 por mês, de 0,28€ a 0,20€
por crédito; no anual, 1.200 a 7.200, de 0,19€ a 0,14€.

Nós somos 3 a 5 vezes mais baratos por cadeira. Duas diferenças a favor deles: o
escalonamento de créditos é mais simples de entender que pacote avulso, e o teste grátis
deles dá **7 créditos + 1 vídeo + 1 tour**, não 5 créditos secos.

### 11. Novidade que eles lançaram: "Pedra for mobile"

App que guia o corretor a filmar o imóvel, tomada por tomada, e edita um vídeo de
qualidade profissional. Incluído no plano anual. É o movimento mais inteligente que eles
fizeram: resolve o problema real, que é corretor não saber filmar. Fora do nosso alcance
agora (app nativo), mas dá para fazer uma versão web com guia de enquadramento.

## O que copiar, na ordem

1. **Vídeo, tour e terreno sem crédito.** Um dia de trabalho, muda o discurso de venda.
2. **Aviso por e-mail quando o vídeo fica pronto.** Meio dia, tira o "deixe a aba aberta".
3. **Processar direto no upload** (Mobiliar / Esvaziar / Renovar em um clique). Meio dia.
4. **Tour 360 interativo** na página compartilhada, com ligação entre cômodos. Dois dias.
5. **Branding: fonte e cor do texto do vídeo, e não cortar foto.** Meio dia.
6. **Convidar membros no menu principal** (hoje está dentro de Equipe). Uma hora.
7. Planta baixa e redes sociais: semanas, ficam depois de ter cliente pagando.

## O que já fazemos melhor

Português do Brasil de verdade, real e Pix, export no tamanho dos portais brasileiros,
selo de imagem ilustrativa, custo real por geração no painel, edição em lote de 40 fotos
(eles não têm lote), terreno com medidas, e conta de imobiliária com créditos
compartilhados em vez de cobrança por cadeira.
