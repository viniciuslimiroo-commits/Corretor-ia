# Ler a planta com IA: o que foi medido (21/09/2026)

O dono pediu a opção de **mandar a planta pronta** em vez de desenhar. Antes de investir em
acabamento, medimos se um modelo de visão lê uma planta bem o bastante pra virar rascunho.

Roda com `web/scripts/experimento-ler-planta.ts`. Não escreve no banco, não gasta crédito de
ninguém; gasta centavos do saldo fal por imagem.

## Por que dá pra confiar no número

O experimento tem **gabarito**: as plantas de controle são desenhadas pelo próprio produto a
partir de cômodos escritos no script. A resposta certa é conhecida em metros, então o erro de
cada cômodo é medido, não olhado.

Gabarito: Sala 4,20×3,60 · Cozinha 2,80×2,40 · Quarto 1 3,40×3,00 · Quarto 2 2,90×3,00 ·
Banheiro 1,60×1,20.

Três qualidades de imagem, porque a planta que chega não é um PNG limpo:

| caso | como é |
|---|---|
| controle | PNG limpo, cotas desenhadas pelo produto (97 KB) |
| print de portal | 760px, JPEG qualidade 45 (20 KB) |
| foto de prancha | girada 2,5°, contraste rebaixado (54 KB) |

## O resultado que decidiu o modelo

| modelo | cômodos | cotas lidas | erro médio | pior erro |
|---|---|---|---|---|
| `gemini-2.5-flash-lite` | 5/5 | 5/5 | 9% | **33%** |
| `openai/gpt-4o` | 5/5 | 5/5 | 7% | **33%** |
| **`gemini-2.5-flash`** | **5/5** | **5/5** | **0%** | **0%** |

O `flash-lite` é o que o avaliador já usa e seria a escolha óbvia por custo. Ele errou de dois
jeitos, e os dois são do tipo perigoso — saem **parecendo número certo**:

- **troca de eixo:** Banheiro 1,60×1,20 virou 1,20×1,60 (área certa, cômodo deitado);
- **dígito errado:** Quarto 1 3,40×**3,00** virou 3,40×**3,40**.

O `gpt-4o` repetiu a troca de eixo do banheiro.

O `gemini-2.5-flash` foi **perfeito em 9 de 9 leituras** (3 rodadas × 3 qualidades de imagem).
Por isso é ele no produto, e não o mais barato.

`gemini-2.5-pro` não roda nesta rota: exige `reasoning=true`.

## Dois achados que mudam o desenho, não só o modelo

**1. Qualidade de imagem não é o gargalo.** O print de 20 KB leu tão bem quanto o PNG de
97 KB. Ou seja: "manda uma foto melhor" não conserta leitura ruim — o que decide é o modelo.

**2. A trava de honestidade funciona.** Nas duas plantas reais que deu pra testar (uma prancha
de 1912 em 1:400 e uma planta de implantação de igreja), o modelo devolveu
`tem_cotas: false` e nenhuma medida marcada como lida — ele estimou pela escala e **disse que
estimou**, em vez de inventar medida com cara de certa. É o contrato de `lib/planta-lida.ts`
fazendo o trabalho dele.

## A planta de verdade (21/09, à tarde)

O dono mandou uma planta de lançamento real: humanizada, com mobília, textura de piso, balões
de marketing, logo e texto na lateral — e cotas pequenas de TRECHO de parede, não um
"3,20 × 2,50" por cômodo. A prancha declara **98 m²**, o que dá gabarito de graça: a soma dos
cômodos tem que cair um pouco abaixo disso.

| rodada | cômodos | soma | % dos 98 m² |
|---|---|---|---|
| primeira | 11 (um falso) | 79,7 m² | 81% |
| com o prompt corrigido | 11 (um falso) | 99,4 m² | 101% |
| **com o filtro de não-cômodo** | **10** | **90,5 m²** | **92%** |

Os dois defeitos que a planta real revelou, e o que cada um ensinou:

**1. Cota emprestada do vizinho.** A cozinha herdou o 2,85 da lavanderia; o banho herdou o
3,15 do dormitório. O modelo lê o número certo e pendura no cômodo errado — é erro de
ATRIBUIÇÃO, não de leitura, e é o mais perigoso porque o número parece certo. Resolvido no
prompt: uma cota só vale pro cômodo se a linha de cota corre na parede dele; sem cota própria,
estima e marca `medida_lida: false`.

**2. Balão de marketing virando cômodo.** "Laje técnica" entrou como um cômodo de 4 m². Mandar
o modelo ignorar balões no prompt **não resolveu** — ele continuou entrando. Resolvido no
CÓDIGO, com uma lista de rótulos que não são cômodo (`NAO_E_COMODO`). Instrução repetida no
prompt não faz o modelo obedecer; filtro determinístico faz, custa nada e sobrevive a troca de
modelo.

O que ficou bom: os nomes saem certos (Lavanderia, Cozinha, Terraço Gourmet, Sala de TV,
Dormitório, Suíte, Banho, Lavabo, Sala de Jantar), a Suíte saiu exata nas três rodadas
(3,00 × 4,35, conferido na lupa) e a proporção da área fecha.

O que continua irregular: cômodos cujas cotas são ambíguas mudam de tamanho entre rodadas (a
cozinha saiu 5,45 numa e 4,65 noutra). Para rascunho que a pessoa ajusta, serve; para número
de anúncio sem conferência, não — e é por isso que a medida lida não vai sozinha pra ficha.

## O que este experimento NÃO prova

Isto é importante e não deve sumir do registro:

- **A planta de controle é o caso mais fácil que existe.** Ela é desenhada pelo produto: texto
  vetorial limpo, cômodos retangulares alinhados, um rótulo e uma cota por cômodo, sem
  mobília, sem hachura, sem espessura de parede, sem escada, sem porta.
- **Uma planta de construtora testada, não dez.** A de 98 m² acima é uma só, e de um só
  estilo de prancha (humanizada, de lançamento). Planta TÉCNICA de arquiteto — linha preta,
  cadeia de cotas nas laterais, sem mobília — continua não testada, e é um desenho bem
  diferente.
- **Amostra: uma planta sintética de controle e uma real.**

O próximo passo que vale mais que qualquer ajuste de código: **3 a 5 plantas reais** (PDF
exportado de construtora, foto de prancha impressa, print de portal) rodadas com
`--extra pasta/`. Enquanto isso não for feito, o que se sabe é: o mecanismo funciona e o
modelo certo é o `flash`; o mundo real continua não testado.
