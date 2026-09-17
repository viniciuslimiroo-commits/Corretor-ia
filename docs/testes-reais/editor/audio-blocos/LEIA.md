# Áudio em trechos: o que ficou medido

Provas do pacote P2 da linha do tempo (`docs/planos/linha-do-tempo-spec.md`, seção B).
Tudo aqui sai de `web/scripts/testar-audio-blocos.ts`, que renderiza com fotos reais, a
música real do catálogo, o efeito real das viradas e a voz real gravada no celular
(`docs/testes-reais/voz/com-voz-propria.mp4`). Sem banco, sem storage, sem crédito.

Rodar de `web/`:

```
node --import ./scripts/ts-direto.mjs scripts/testar-audio-blocos.ts
```

- **`voz-real-em-dois-trechos.mp4`** — o vídeo pra OUVIR: música cortada no segundo 12 com
  fades, a mesma voz em dois trechos ([1s, 4,5s) e [6s, 10s)) e o som das viradas. É o caso
  que o editor vai produzir quando alguém cortar a voz na linha do tempo.
- **`voce-inicio-maior-que-zero.txt`** — o conserto B3 (o som do Você que entra depois do
  começo), com o número do comando novo, do antigo e do controle negativo.
- **`tempos.txt`** — quanto a montagem com trechos custa a mais que a de hoje, em TEMPO DE
  CPU (`-benchmark` do ffmpeg) com 1 e 2 linhas de trabalho. Relógio de parede não serve:
  nesta máquina a mesma comparação deu +37% e −25% em duas passadas seguidas.

**Binário de produção:** não verificado. A produção roda um ffmpeg 7.x ou master no Linux;
aqui há só o ffmpeg-static 6.1.1, e não há WSL nem Docker (decisão do P0: nada de baixar
binário). As composições que precisam ser remedidas lá estão listadas na spec, B1.
