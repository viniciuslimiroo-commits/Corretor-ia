=== SPEC CORRIGIDA ===

# Encena implementation spec (corrected): Delivery 1 (everything inserted shows up on the timeline) and Release 2 (text and sticker windows)

**Basis**
- **Code pin:** `1c4a98c`. It differs from `087777b` only in `docs/marca/**` and `web/public/kit-instagram/**`, so the refs hold. Re-check refs at every rebase (obs 0062).
- **Order of precedence:** `docs/planos/linha-do-tempo-decisao.md` wins, then this spec, then `docs/planos/linha-do-tempo-faixas.md`. The decision doc is untracked: commit it before the wave.
- **Evidence marks:**
  - (V) checked in code.
  - (M) measured with ffmpeg-static 6.1.1. Sources: `proto-audio5b.mjs`, `proto-audio3.mjs`, and a review re-run of the presenter `-ss` bug and `aloop`→`adelay`.
  - (R) from a report, not re-run.
- **Nothing written:** no repo edits, no database writes, no API calls.

**Abbreviations** (under `web/src/`)
- EV `components/editor/editor-video.tsx` · LT `components/editor/linha-do-tempo.tsx` (old; deleted by P7a) · LF `components/editor/faixas/linha-de-faixas.tsx` (new)
- AP `components/editor/apresentador-no-palco.tsx` · BA `components/editor/biblioteca-audio.tsx` · MC `components/editor/menu-contexto.tsx`
- GT `components/editor/galeria-texto.tsx` · GE `components/editor/galeria-elementos.tsx` · ENP `components/editor/elementos-no-palco.tsx` · UI `components/ui.tsx`
- V `lib/video.ts` · FF `lib/video-ffmpeg.ts` · VP `lib/video-pipeline.ts` · FFR `lib/ffmpeg.ts`
- TAS `lib/texto-arte-servidor.ts` · ES `lib/elementos-servidor.ts` · EL `lib/elementos.ts` · MS `lib/movimento-servidor.ts`
- PV `lib/pedido-video.ts` (new)
- R `app/api/video/route.ts` · RID `app/api/video/[id]/route.ts` · UPL `app/api/video/upload/route.ts` · VPG `app/videos/page.tsx`
- CA `web/scripts/fixtures/casos-de-args.ts` · GAF `web/scripts/gravar-args-fixtures.ts` · TR `web/scripts/testar-relogio.ts`

## 0. Rules every package follows
1. **Hooks and the React Compiler lint.**
   - Exported hooks are named `use*`, even in `usar-*.ts` files (`useMenuContexto` MC:38, `useConta` EV:6).
   - No ref reads during render, and that includes `useSyncExternalStore` snapshot closures. Keep mutable stores in objects created by `useState(() => criar())`.
   - No synchronous `setState` in effects; use the `Promise.resolve().then` pattern (EV:611-614).
   - No `Date.now()` or `Math.random()` in render. Pure libraries receive id generators as parameters.
2. **Test runner.** `node --import ./scripts/ts-direto.mjs scripts/<x>.ts`, run from `web/`.
   - Media: real photos `docs/testes-reais/*-depois.jpg`, real catalog audio (`public/musica`, `public/efeitos`) and the real voice in `docs/testes-reais/voz/com-voz-propria.mp4`.
   - A 1 kHz tone only as an extra measuring signal, never instead of real audio.
   - Crops measured in rgb24; frame identity by `framemd5` (obs 0074, 0080).
3. **No new Next APIs.**
   - Dev harnesses are `app/dev/*/page.tsx` server components that call `notFound()` in production (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`).
   - Anyone touching route config reads `.../03-file-conventions/02-route-segment-config/maxDuration.md` first.
   - Route files export only HTTP handlers and segment config (R:14,44; RID:13,20,161). Any logic that needs a test lives in `lib/`.
4. **Safety in tests.**
   - Never write to the database, never call paid APIs, never call `gerar`, `/api/video/legendas` or `/api/video/roteiro`. A GET on an unfinished video advances its pipeline (RID:9-13, 145).
   - Uploads to storage (`/api/video/upload` then `uploadToSignedUrl`, EV:741-750) are production writes: only with the owner's explicit go-ahead.
   - Agents never type credentials. Browser flows on signed-in pages run only in a session the owner opened himself; otherwise use the dev harnesses.
   - A full end-to-end run through the API needs the owner's go-ahead (0 credits: no animated scene, no AI voice).
5. **Merge and deploy units.**
   - When an invariant is loosened in one file and enforced in another, both sides ship in one PR and one deploy, with a test that runs both (E0).
   - A rewritten component is created in a new file; the package that switches the import deletes the old one.
   - Edits to existing shared components are additive: without the new props, rendering and behavior stay exactly as today.

---

## A. Data model

### A1. Types, in V (P1)
```ts
export type FonteAudio =
  | { tipo: "musica"; id: Exclude<MusicaId, "nenhuma"> }
  | { tipo: "voz" }; // the espec.narracao file: recorded, uploaded, or AI (reused or still to generate)

export type ItemAudio = {
  id: string;            // /^[a-z0-9]{8}$/, stable. Items derived from old specs: "musica00", "voz00000"
  fonte: FonteAudio;
  noVideo: number;       // 0 .. total−audioMin; 0.01 steps
  corteArquivo: number;  // 0 .. corteAudioMax; 0.01 steps
  duracao?: number;      // ABSENT = to the end (music with laco: end of video; music without laco: end of file; voice: end of file). Present: audioMin .. corteAudioMax
  volume: number;        // music 0..1, voice 0..2; 0.01 steps
  fadeEntrada: number;   // 0..fadeMax
  fadeSaida: number;     // 0..fadeMax
  laco?: boolean;        // music only, and always present on music after the sanitizer
};
// Narracao (V:635-646): no new key.
//  - arquivo is also accepted for origem "ia" when it matches
//    /^uploads\/[0-9a-f-]{36}\/voz-[0-9a-f-]{36}\.mp3$/ (TTS output, VP:517): reuse, no TTS, no credit. Merge unit U1.
//  - In versao 2, inicio and volume are ABSENT.
// EspecVideo (V:729-760), after capaMontada:
  versao?: 2;            // present exactly when audios is present
  audios?: ItemAudio[];  // when present, ALL music and voice timing lives here: musica "nenhuma",
                         // musicaVolume = LIMITES.musicaVolumePadrao, narracao without inicio/volume. efeitoSonoro unaffected.
// Catalogs: web/src/lib/segundos-do-catalogo.ts (generated, owned by P4) exports
//   SEGUNDOS_MUSICA, SEGUNDOS_EFEITO. MUSICAS (V:560) and EFEITOS_SONOROS (V:596) entries += segundos: number | null.
//   First values: songs 45.00 (probed); effects per the report (brilho 2.912, clique 2.005, impacto 2.912,
//   passagem 2.603, sino 2.859, toque 2.005), regenerated from sample counts.
// LIMITES (V:778-815) += audiosMax 16, musicaPedacosMax 8, vozPedacosMax 8, audioMin 0.3, fadeMax 5,
//   corteAudioMax 600, janelaMin 0.5 (R2)
// limparEspec (V:1170) returns
//   { espec; erro: null; avisos: string[] } | { espec: null; erro: string; avisos?: undefined }
// PipelineVideo (VP:50-75) += resumoEdicao?: ResumoEdicao | null; narracaoEstornada?: boolean
// R2 fields, declared now, not read or sanitized until R2. TextoCena (V:226-245) and ElementoCena (V:461+) +=
  de?: number;   // second of the SCENE CLIP where the item appears; absent = 0
  ate?: number;  // second of the scene clip where it disappears; absent = the scene's duration
// No `visuais` before Release 3.
```

### A2. `limparAudios(bruto, total, temNarracao): { audios; avisos; erro }` (V, exported)
- **Input.** Anything that isn't an array gives `{ audios: [], avisos: [], erro: null }`.
- **Per element, in input order (index `i`):**
  - **Source.** Music with `MUSICA_POR_ID[id]?.arquivo` gives `{tipo:"musica", id}`; `"voz"` gives `{tipo:"voz"}`. Anything else is dropped with the aviso "Um trecho de áudio de tipo desconhecido foi ignorado."
  - **Voice without narration.** Dropped with "Um trecho de voz foi ignorado: o vídeo não tem narração."
  - **`id`.** Kept if it matches the regex and is unused; otherwise `"a"+String(i).padStart(7,"0")`, incremented until unique. A valid id is never reassigned.
  - **`noVideo`** = `numeroEntre(v, 0, total) ?? 0` (V:958-962). If `noVideo > total − audioMin`: dropped with "Um trecho de áudio começava depois do fim do vídeo e ficou de fora."
  - **`corteArquivo`** = `numeroEntre(v, 0, corteAudioMax) ?? 0`.
  - **`duracao`** = `null`/`undefined` → undefined; otherwise `numeroEntre(v, audioMin, corteAudioMax)`.
  - **`volume`.** Music `numeroEntre(v,0,1) ?? musicaVolumePadrao`; voice `numeroEntre(v,0,2) ?? 1`.
  - **Fades.** `numeroEntre(f,0,fadeMax) ?? 0`. If `duracao` is set and `fi+fo > duracao`, scale both by `duracao/(fi+fo)` and round each down to 0.01.
  - **`laco`.** Music `b.laco !== false`; the key is omitted on voice.
  - **Key order:** `{id, fonte, noVideo, corteArquivo, duracao?, volume, fadeEntrada, fadeSaida, laco?}`. Absent keys are omitted, never set to `undefined`.
- **Counts, after drops.** More than 8 music items: error "No máximo 8 trechos de música."; more than 8 voice: "No máximo 8 trechos de voz."; more than 16 total: "No máximo 16 trechos de áudio."
- **Sort:** by `noVideo`, then music before voice, then `id` (stable).

### A3. Canonical form (P1, shared by sanitizer and editor)
```ts
export function itensDeAudioDoEspec(e: EspecVideo): ItemAudio[]
//  e.audios → copy.
//  Otherwise: musica with a file → {id:"musica00", fonte, noVideo:0, corteArquivo:0, volume: e.musicaVolume ?? 0.8,
//    fadeEntrada:1, fadeSaida:2, laco:true} (FF:794, FF:907-911);
//  narracao → {id:"voz00000", fonte:{tipo:"voz"}, noVideo: inicio ?? 0.7, corteArquivo:0, volume: volume ?? 1,
//    fadeEntrada:0, fadeSaida:0} (FF:909-921)
export const VOZ_PADRAO: ItemAudio; // {id:"voz00000", voz, noVideo:0.7, corte 0, volume 1, fades 0}
export function canonizarAudio(o: { itens: ItemAudio[]; narracao: Narracao | null; musicaVolume: number }):
  { musica: MusicaId; musicaVolume: number; narracao: Narracao | null; audios?: ItemAudio[]; versao?: 2 }
```

**How `canonizarAudio` decides**
- **Setup.** `n = narracao`. If `n` is null, voice items are ignored. If `n` is set with zero voice items, `n = null`. This is a defensive path only: the editor never produces it (C `apagar`). `M` = music items, `Z` = voice items.
- **Old shape (legado) when all hold:**
  - `M.length ≤ 1`, and if one: `noVideo 0`, `corteArquivo 0`, `duracao` undefined, `laco !== false`, fades exactly 1/2, `0 ≤ volume ≤ 1`.
  - `Z.length ≤ 1`, and if one: `corteArquivo 0`, `duracao` undefined, fades 0, `0 ≤ noVideo ≤ 10`, `Math.round(noVideo·10)/10 === noVideo`, `0.2 ≤ volume ≤ 2`.
- **Old-shape output:** `musica = M[0]?.fonte.id ?? "nenhuma"`; `musicaVolume = M[0]?.volume ?? o.musicaVolume`; `narracao = n && {...base(n), volume: Z[0].volume, inicio: Z[0].noVideo}`.
- **Otherwise (versao 2):** `musica "nenhuma"`, `musicaVolume = musicaVolumePadrao`, `narracao = n && base(n)`, `audios = [...M, ...Z]` sorted as in A2, `versao 2`.
- **`base(n)` key order:** AI `{origem, roteiro, voz, arquivo?}`; recorded or uploaded `{origem, arquivo}`. These match V:1245/1249, with `volume`/`inicio` appended in the old shape.

### A4. `limparEspec` changes (V:1170-1282)
1. **Scenes:** unchanged in Delivery 1.
2. **AI narration (V:1243-1245), part of merge unit U1:** `arquivo` = regex match or undefined; `narracao = { origem, roteiro, voz, ...(arquivo ? {arquivo} : {}), ...comum }`. Stored rows never carry an AI `arquivo`, so existing rows sanitize identically.
3. **Only when `Array.isArray(b.audios)`:**
   - `r = relogioDoEspec({cenas, transicao: ehTransicao(b.transicao), telaFinal: b.telaFinal !== false})` (V:920).
   - `limparAudios(b.audios, r.total, !!narracao)`; return its error if any.
   - If narration exists and there are no voice items: `narracao = null` plus the aviso "A narração estava ligada, mas sem trecho de voz na linha do tempo: o vídeo sai sem voz."
   - `c = canonizarAudio(...)`; overwrite `musica`, `musicaVolume`, `narracao`. `b.versao` is never read.
4. **Return value.** The literal at V:1258-1279 stays character-identical. Append `...(c?.audios ? {audios: c.audios, versao: 2 as const} : {})` after `efeitoSonoro`, and return `avisos`.
5. **Guarantee.** For any input without `audios` and without an AI `arquivo`, `JSON.stringify(espec)` equals the frozen snapshot.

### A5. Invariants
Tested in `testar-saneador-linha.ts` (P1), `testar-linha-gestos.ts` (P3) and `testar-pedido-video.ts` (P2).
- `igual(a,b)` = `deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))`.
- `S = limparEspec(F).espec` for each fixture `F` in `scripts/fixtures/especs-linha.ts` (≥ 30, see F1).

| # | Invariant |
|---|---|
| I1 idempotence | `igual(limparEspec(S).espec, S)` |
| I2 round trip | `igual(limparEspec(especDoEstado(S, estadoDoEspec(S))).espec, S)` |
| I3 canonicity | if `S.audios` exists, `!ehAudioLegado(S.audios)`; every old-equivalent v2 fixture collapses |
| I4 old byte-identity | every fixture without `audios`: `JSON.stringify(S) === especs-saneadas-antes.json[nome]` |
| I5 surviving fields | every `ItemAudio` key survives I1; AI `arquivo` survives; R2 `de`/`ate` survive |
| I6 reuse only when unchanged | AI `arquivo` is added only when `roteiro` and `voz` are unchanged (`narracaoComReuso`) |
| I7 what you see is what renders | for 2000 random gesture sequences, the blocks' `de`/`ate` after save + sanitize + reopen equal the blocks before save (±0.01 s; Você ±0.1 s) |
| I8 through the request path | every fixture passed through `prepararPedidoDeVideo` (PV) with stubbed dependencies returns the same `espec` as `limparEspec` (decision:147, 176) |

### A6. Release 2 sanitizer
1. **Scene duration first.** In the scene loop (V:1178-1225), hoist `const duracao = Number.isFinite(duracaoNum) ? Math.min(Math.max(Math.round(duracaoNum), LIMITES.duracaoMin), teto) : padrao;` and use it at `duracao:` (V:1210): same value, same key order.
2. **New signatures.** `limparTextos(bruto, duracao)` (V:1075) and `limparElementos(bruto, duracao)` (V:1000). Each output object appends `...limparJanela(x.de, x.ate, duracao)` as its **last** spread: after `visual` (V:1095); after `movimento` in the adesivo branch (V:1018); after `clipe` in the Pexels branch (V:1035-1037); after `movimento` in the model branch (V:1069).
3. **`limparJanela`:**
   ```ts
   function limparJanela(de: unknown, ate: unknown, dur: number): { de?: number; ate?: number } {
     const a = numeroEntre(de, 0, dur), b = numeroEntre(ate, 0, dur);
     let ini = a !== undefined && a > 0 ? a : 0;
     let fim = b !== undefined && b < dur ? b : dur;
     if (fim - ini < LIMITES.janelaMin) {
       if (ini + LIMITES.janelaMin <= dur) fim = Math.round((ini + LIMITES.janelaMin) * 100) / 100;
       else { ini = Math.round((dur - LIMITES.janelaMin) * 100) / 100; fim = dur; }
     }
     return { ...(ini > 0 ? { de: ini } : {}), ...(fim < dur ? { ate: fim } : {}) };
   }
   ```
   A full-scene window is always absent: that is the canonical form, and what keeps old output identical.
4. **Scene legend** (`Cena.legenda`): no window in R2.

### A7. Editing summary (`lib/resumo-edicao.ts`, P0)
```ts
export type TrilhaResumo = "cenas"|"telaFinal"|"voce"|"voz"|"musica"|"textos"|"titulo"|"adesivos"|"legendas";
export type ResumoEdicao = { v: 1; abertoEm: string; geracao: number; desfazer: number; refazer: number;
  edicoes: Partial<Record<TrilhaResumo, { arraste: number; botao: number }>>; faixasAbertas: number;
  aparosNaBorda: number; previaSemSom: number; dispositivo: "celular" | "desktop" };
export function limparResumoEdicao(bruto: unknown, agora: Date): ResumoEdicao | null
// abertoEm must fall in [agora−48h, agora+5min], else null. Counters are integers 0..100000;
// geracao 1..1000; unknown lanes dropped; dispositivo defaults to "desktop".
```
- Stored as `pipeline.resumoEdicao`, never in `espec`.
- Counters cover the period since the previous successful POST in the same editor visit; `geracao` numbers the POSTs in that visit.

---

## B. Server

### B1. Per-item audio chain (FF, exported; P2)
The recipe is exactly the one in `proto-audio5b.mjs` (M):
- Positions OK on wav, mp3 and webm/opus.
- No energy outside the window, except webm leaking at most 0.012 amplitude within 7 ms of the edge.
- The review also measured on 6.1.1: `aloop` then `adelay=3000:all=1` starts at 3.00 s, alone and inside `amix`.
```ts
export type AudioNaMontagem = { arquivo: string; tipo: "musica" | "voz"; noVideo: number; corte: number; dur: number;
  volume: number; fadeEntrada: number; fadeSaida: number; laco: boolean };
export function cadeiaDeAudio(entrada: string, a: Omit<AudioNaMontagem, "arquivo" | "tipo">, total: number, saida: string): string {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const N = r2(a.noVideo), C = r2(a.corte), D = r2(a.dur), T = r2(total);
  const f: string[] = [];
  if (a.laco) f.push("aloop=loop=-1:size=2147483647");
  const S = r2(N - C);
  if (S > 0) f.push(`adelay=${Math.round(S * 1000)}:all=1`);
  else if (S < 0) f.push(`atrim=start=${(-S).toFixed(2)}`, "asetpts=PTS-STARTPTS");
  if (a.fadeEntrada > 0) f.push(`afade=t=in:st=${N.toFixed(2)}:d=${a.fadeEntrada.toFixed(2)}`);
  else if (C > 0) f.push(`afade=t=in:st=${N.toFixed(2)}:d=0.001`);
  const fim = r2(N + D);
  if (a.fadeSaida > 0) f.push(`afade=t=out:st=${(fim - a.fadeSaida).toFixed(2)}:d=${a.fadeSaida.toFixed(2)}`);
  else if (fim < T) f.push(`afade=t=out:st=${(fim - 0.001).toFixed(3)}:d=0.001`);
  if (a.volume !== 1) f.push(`volume=${a.volume.toFixed(2)}`);
  f.push("apad", `atrim=0:${T.toFixed(2)}`);
  return `[${entrada}]${f.join(",")}[${saida}]`;
}
```
- **Forbidden (measured failures, obs 0081/0082):** `-stream_loop` or `-ss`/`-t` on item inputs; `atrim` followed by `adelay`; `aresample`/`aformat`, silent base inputs, any channel or rate normalization.
- **Re-measure on the production binary** every composition used (`aloop`→`adelay`, `aloop`→`atrim`, `adelay`→`afade` gate): P2 test 5.

### B2. `argsMontagem` (FF:757-991)
- **Options** (FF:757-782) gain `audios?: AudioNaMontagem[]`. When set (v2 branch), `musica`, `narracao`, `musicaVolume`, `vozVolume` and `vozInicio` are ignored.
- **Inputs, in order:**
  1. clips (FF:789)
  2. `if (!o.audios)`: music (FF:793-796) and narration (FF:797-800), unchanged
  3. effect (FF:803-807)
  4. presenter video (FF:812-817). Right after it, compute `volApre` and `temVozApre` (same expressions as FF:916-917; strings unchanged).
  5. `if (o.audios)`: one `-i a.arquivo` per item, in order → `idxItens[j]`
  6. separate presenter audio: `if (temVozApre && (o.audios || (apre.inicio ?? 0) > 0))`, add `-i apre.arquivoLocal` → `idxApreAudio`
- **v2 audio graph** (replaces FF:907-947 only when `o.audios` is set):
  - For each item `j`: `cadeiaDeAudio(`${idxItens[j]}:a`, a, total, `ai${j}`)`, pushed into `musicas` or `vozes` by type.
  - If `temVozApre`: `cadeiaDeAudio(`${idxApreAudio}:a`, {noVideo: apreEntra, corte: apre.inicio ?? 0, dur: apreDuracao, volume: volApre, fades 0, laco false}, total, "aapre")`, pushed into `vozes`.
  - A bus with one input is `[L0]anull[nome]`; more is `amix=inputs=k:duration=first:dropout_transition=0:normalize=0[nome]`. Build `[m]` from `musicas` and `[nar]` from `vozes`.
  - Both present: `[nar]asplit=2[nar1][gatilho]`; `[m][gatilho]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=350:makeup=1[mduck]` (the FF:941 string); `[mduck][nar1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`. Only music → `[m]anull[aout]`; only voice → `[nar]anull[aout]`.
  - `temBase = musicas.length + vozes.length > 0`. In the old branch `temBase = idxMusica >= 0 || temVoz`, which produces the same strings.
- **Transition sounds:** FF:949-978 unchanged except `idxMusica >= 0 || temVoz` → `temBase` (FF:974-975), and FF:980 `temAudio = temBase || viradas.length > 0`. FF:981-990 unchanged.
- **Measured (M):** an old spec converted to items differs from the old branch by at most 0.10 dB per 0.25 s window, with 5.3 dB ducking in both. New cases:
  - music cut at 10 s, placed at 2 s for 7 s with fades 1/2: −91 dB before 2 s;
  - voice split into [3,5) and [6,8): tone only inside;
  - click peak at 4.041 s against 4.024 s expected.

### B3. Presenter audio fix (P2; merge unit U2)
- **Bug, re-measured in review on 6.1.1 with `com-voz-propria.mp4`:** `-ss 1.00 -t 5.20 -i` plus `adelay=6800|6800` (FF:815, FF:926) outputs the audio at 0.00–5.20 s (per-0.25 s RMS −41…−20 dB, silence from 5.25 s). The same command with `inicio 0` lands at 6.8 s. The separate-input chain `adelay=5800:all=1,afade in st=6.80 d=0.001,afade out st=11.999 d=0.001` starts in the 6.75 s window and ends at 12.0 s.
- **Old branch:** `if ((apre.inicio ?? 0) > 0)`, `[voz1]` comes from `cadeiaDeAudio(`${idxApreAudio}:a`, …, "voz1")`. Otherwise FF:926 stays byte-identical.
- **Scope:** only presenters with `inicio > 0` and an audio track change when regenerated.
- **Deploy order:** B3 must be live **before** P7a exposes Você "Início aqui".
- **Fixture handling:** `montagem_voce_circulo_entra_tarde` (CA:54-65, `inicio 1`, `temAudio: true`) gains a conserto. P2 extends TR's undo (TR:96-107): remove the last `"-i","/t/apre.mp4"` pair from AFTER; delete the `;[N:a]…[voz1]` segment from BEFORE and AFTER; the rest must be equal, and AFTER must differ from BEFORE.
- **Guard script:** `scripts/testar-consertos-montagem.ts` stays green.

### B4. Graph to a file above 20 KB (FFR:32-45, P2)
- In `rodarFfmpeg`: if the value after `-filter_complex` is over 20,000 characters, write it to `os.tmpdir()/encena-grafo-<uuid>.txt`.
- Replace the pair with `["-/filter_complex", arquivo]` when ffmpeg's major version is ≥ 7, otherwise `["-filter_complex_script", arquivo]`. Delete the file in `finally`.
- `versaoDoFfmpeg()` runs `-version` once and caches it: `/ffmpeg version n?(\d+)\./` gives the major; `/version N-/` counts as 99; anything else counts as 6.
- Production may be 7.x (johnvansickle release) or master (BtbN fallback), depending on which download succeeded at build (`scripts/ffmpeg-linux.mjs:20-22`). Builders are unchanged, so fixtures are unchanged.

### B5. Resolver (`lib/audio-montagem.ts`, P2)
```ts
export function resolverAudiosDaMontagem(o: { itens: ItemAudio[]; total: number /* real, VP:566-568 */;
  caminhoDaMusica: (id) => string | null; caminhoDaVoz: string | null }):
  { audios: AudioNaMontagem[]; avisos: string[]; vozDescartada: boolean }
```
For each item:
- **Paths.** Music with no path: dropped, with "A trilha {rotulo} não foi encontrada no servidor; o trecho saiu sem música." (once per id). Voice with `caminhoDaVoz === null`: dropped silently (VP:520-523 already warns).
- **Start.** `N = min(noVideo, total)`. If `N > total − audioMin`: dropped with the out-of-video aviso.
- **Duration.** `seg` = `SEGUNDOS_MUSICA[id]` for music; `C` = `corteArquivo`.
  - `D = duracao ?? (musica ? (laco ? total−N : seg−C) : total−N)`
  - `D = min(D, total−N)`
  - if music and not `laco`: `D = min(D, seg−C)`
  - If `D < audioMin`: dropped with "Um trecho de áudio ficou curto demais e saiu."
- **Fades.** If `fi+fo > D`, scale both (round down to 0.01).
- **Loop flag sent to ffmpeg:** `laco = musica && laco !== false && C + D > seg − 0.01`. `aloop` buffers about 35 MB per 45 s at 96 kHz stereo, so it is emitted only when needed.
- **Output:** same order as the input. A voice `C` beyond the file length is silent by construction (`apad`).
- **`vozDescartada`** = there were voice items and none survived.

### B6. Pipeline (VP, P2)
- **Narration (VP:495), merge unit U1:** the condition becomes `if (espec.narracao?.arquivo)`, for any origin. It sets `p.narracaoPath = arquivo`, never adds it to `temporarios`, skips TTS and saves `montar`. VP:500-525 unchanged.
- **Montar (VP:531-623) with `espec.audios`:**
  - Skip the music lookup (VP:539-548); keep the effect lookup (VP:549-555).
  - Download the narration only if `p.narracaoPath` exists and there is ≥ 1 voice item; presenter handling unchanged (VP:572-584).
  - Call the resolver with `total` (VP:568), `caminhoDaMusica` via `existsSync(public/musica/<arquivo>)`, `caminhoDaVoz`. Push its avisos.
  - **Refund:** if `vozDescartada && vozDeIA(espec.narracao) && !espec.narracao.arquivo && p.narracaoPath && !p.narracaoEstornada`, add the aviso "A voz ficou toda depois do fim do vídeo; o crédito da narração voltou.", call `creditar(db, contaDoVideo, userId, CREDITOS.narracao, "estorno_narracao", video.id)` and set `p.narracaoEstornada = true`. This happens when the end screen isn't rendered (VP:586) and the real length is shorter than the sanitizer's.
  - `argsMontagem({...same, audios, musica: undefined, narracao: undefined, musicaVolume: undefined, vozVolume: undefined, vozInicio: undefined})` with the 280 s timeout (VP:609).
- **Without `audios`:** byte-identical path. `progressoDe` (VP:138-160) and the `finalizar` hand-off (VP:621) unchanged.

### B7. POST `/api/video` (R, P2; reuse parts in merge unit U1)
1. **New `lib/pedido-video.ts` (PV):**
   ```ts
   export async function prepararPedidoDeVideo(corpo: unknown, userId: string, deps: {
     jobsDoUsuario(ids: string[]): Promise<{id;status;input_path;output_path}[]>; existeNoBucket(pasta: string, nome: string): Promise<boolean> })
     : Promise<{ ok: true; espec: EspecVideo; avisos: string[]; resumo: ResumoEdicao | null } | { ok: false; status: 400 | 409; error: string; codigo?: string }>
   export async function validarNarracaoReaproveitada(espec, userId, existe): Promise<null | { status; error; codigo? }>
   ```
   `prepararPedidoDeVideo` does, in order: `limparEspec`; the ownership checks moved verbatim from R:63-85; the reuse check; `limparResumoEdicao(corpo.resumo, new Date())`. R keeps only `GET`/`POST` exports and calls PV, then runs R:55-61 (property) and R:87-129 as today.
2. **Reuse check** (AI `narracao` with `arquivo`):
   - **Name:** must match `^uploads/${userId}/voz-[0-9a-f-]{36}\.mp3$`, else 400 "Narração reaproveitada não reconhecida."
   - **Existence:** `db.storage.from(BUCKET_RESULTADOS).list(`uploads/${userId}`, { limit: 1, search: nome })` with an exact name match (pattern VP:131-133).
   - **Missing:** 409 `{ error: "A narração de IA guardada não foi encontrada. Gerar de novo grava a voz outra vez (1 crédito).", codigo: "voz_reaproveitada_ausente" }`. Never change the cost silently. Runs before the cost calculation (R:90-92).
3. `pipelineInicial(saldoAntes, animadasGratis, { avisos, resumoEdicao })` (signature from P0).
4. The response (R:129) gains `avisos`.
5. Audio items carry no paths.

### B8. Cost (V:826-830; merge unit U1)
- `custoDoVideo = base + animadas×2 + (vozDeIA(n) && !n?.arquivo ? 1 : 0)`.
- EV:525 and VPG:294 use the same function; VPG never sends an AI `arquivo` (VPG:261-269).
- Refunds: TTS failure (VP:520-523) and B6.
- DELETE never removes `uploads/…/voz-*.mp3` (RID:170-172; `narracaoPath` is not in `temporarios`, VP:513-519).

### B9. Guarantees
- **Specs without `audios`:**
  - identical sanitizer output (I4);
  - identical `argsMontagem` for every case in `args-antes.json` and `args-fase3-antes.json`, except the presenter `inicio > 0` consertos checked by chain removal;
  - identical scene commands.
- **R2 with no `de`/`ate`:** identical scene commands (B10).

### B10. Release 2: per-item enable window (R2-A)
```ts
function janelaDoItem(de: number | undefined, ate: number | undefined, duracao: number) {
  if (de === undefined && ate === undefined) return null;
  const q = (s: number) => Math.round(s * FPS) / FPS;              // FPS = 24 (V:868)
  const ini = q(de ?? 0), fim = Math.min(duracao, q(ate ?? duracao));
  const meio = 1 / (2 * FPS);
  const partes = [...(ini > 0 ? [`gte(t\\,${(ini - meio).toFixed(4)})`] : []), ...(fim < duracao ? [`lt(t\\,${(fim - meio).toFixed(4)})`] : [])];
  return { ini, fim, enable: partes.join("*"), tl: ini > 0 ? `(t-${ini.toFixed(4)})` : "t", duracaoItem: fim - ini };
}
```
- **`filtrosDeTexto` (FF:284-365):**
  - `j === null` → current path, byte-identical.
  - Otherwise: `chegada=(1-min(${tl}/0.5\\,1))`, `surgir=gte(${tl}\\,0.5)`, `no_fim=gte(${tl}\\,${(duracaoItem*0.62).toFixed(2)})`, `piscar=lt(mod(${tl}\\,0.7)\\,0.35)`, `enable = [j.enable, enableDaAnimacao].filter(Boolean).join("*")`.
  - Stacking level = smallest level not used by an earlier same-position item whose `[ini,fim)` overlaps; with no windows everything overlaps, so today's count.
- **`sobreporPecas` (FF:232-282):**
  - `ArteNaCena` (FF:172-186) gains `de?`/`ate?`; `pecasDaCena` (FF:192-197) passes them through.
  - Same expressions with `ESC` (FF:20).
  - Loop inputs with `j.ini > 0` get the prefix `settb=1/600,setpts=PTS+${ini}/TB`:
    - GIF: `[idx:v]settb=…,setpts=…,scale=…:flags=lanczos,format=rgba[ga i]`
    - sequence or video: `[idx:v]settb=…,setpts=…[pa i]`
  - Keep `:shortest=1` and `-t`.
  - (R) 50/50 identical frames for GIF, 25 fps sequence and 30 fps mp4. Pexels clips are 30 fps (`pexels-servidor.ts:110`); the test asserts `FPS_MOVIMENTO` divides 600.
- **Clip-scene time origin:** in `argsCenaClipe` (FF:575-597), `argsCenaAntesDepois` and `argsCena360`, when any item in the scene has a window, insert `setpts=PTS-STARTPTS` as the first filter of the scene video chain (before `setpts=PTS/vel`, FF:580). With no windows, byte-identical.
- **Rasterizers pass the window through:** TAS:67 push; ES:97-112 (both `desenhadas` and the returned map); MS:48-56 already spreads.
- **Time-aware stacking** in `lugaresDoTexto` (FF:151-164), `posicionarPecas` (EL:535) and the EV stage text layout.
- **Unchanged:** the pipeline's use of `textosDaCena` (VP:272, 277); Pexels, `montar` and cost.

---

## C. Pure library: `lib/linha-do-tempo.ts` (P3)
No React, DOM or fetch. Imports only `./video` and `./segundos-do-catalogo`.
```ts
export const ORDEM_DAS_FAIXAS = ["voce","voz","musica","textos","adesivos","legendas"] as const;
export type FaixaId = (typeof ORDEM_DAS_FAIXAS)[number]; export type TrilhaId = "cenas" | FaixaId;
export type RefItem = | {faixa:"cenas";chave:string} | {faixa:"telaFinal"} | {faixa:"voce"} | {faixa:"voz";id:string}
  | {faixa:"musica";id:string} | {faixa:"textos";chave:string;indice:number /* −1 = cena.legenda */} | {faixa:"titulo"}
  | {faixa:"adesivos";chave:string;indice:number} | {faixa:"legendas";indice:number /* trechos always sorted */};
export type CenaBase = Cena & { chave: string };
export type EstadoLinha<C extends CenaBase = CenaBase> = { cenas: C[]; transicao: TransicaoId; telaFinal: boolean; titulo: string;
  audios: ItemAudio[]; narracao: Narracao | null; musicaVolume: number; efeitoSonoro: EfeitoSonoroId;
  apresentador: Apresentador | null; legendas: Legendas | null };
export type Medidas = { segundosDaVoz: number | null; vozEstimada: boolean; segundosEstimadosDaVoz: number /* roteiro.length/15 */; segundosDoVoce: number | null };
export type Ctx<C extends CenaBase = CenaBase> = { estado: EstadoLinha<C>; relogio: RelogioDoVideo; medidas: Medidas };
export type Opcoes = { pontos: number[]; limiarSeg: number; novoId: () => string };
export type Gesto = {tipo:"mover";delta:number}|{tipo:"aparaInicio";para:number}|{tipo:"aparaFim";para:number}
  |{tipo:"deslizarTrecho";delta:number}|{tipo:"reordenar";paraIndice:number};
export type ResultadoGesto<C> = { estado: EstadoLinha<C>; selecao: RefItem|null; de: number; ate: number; corte?: number;
  guia: number|null; parouNaBorda: boolean; mudou: boolean; narracaoDesligada?: boolean };
export type BlocoLinha = { ref: RefItem; trilha: TrilhaId; de: number; ate: number; rotulo: string; preso?: true; contagem?: number;
  itens?: RefItem[]; fina?: true; estimado?: true; foraDoVideo?: true; semSom?: true; alcas: {inicio:boolean;fim:boolean}; movel: boolean;
  onda?: {musica; corte: number; duracao: number; laco: boolean}; fades?: {entrada:number; saida:number} };
export type FaixasDaLinha = { trilhas: Record<TrilhaId, BlocoLinha[]>; marcasDeEfeito: number[]; total: number };
```
Every function is generic over `C` and only ever spreads existing scene objects (`{...cena, …}`), so editor-only scene fields (EV:1212-1224) survive. Test: an extra field survives every operation.

**Functions**
- **`audiosEfetivos(audios, narracao)`:** narration null → voice items removed; narration set with no voice items → `VOZ_PADRAO` appended. Derived, never stored.
- **`estadoDoEspec(e, chaves?)`, `especDoEstado(base, s)`:** as before. `especDoEstado` = `{...omit(base,"audios","versao"), cenas: s.cenas.map(({chave, ...c}) => c without editor-only fields), transicao, telaFinal, titulo, efeitoSonoro, apresentador, legendas, ...canonizarAudio({itens: audiosEfetivos(s.audios, s.narracao), narracao: s.narracao, musicaVolume})}`. The fields to strip are the explicit list of `Cena` keys from V.
- **`narracaoComReuso(n, guardada)`:** adds `arquivo` only for AI narration with the same `roteiro` and `voz`.
- **`normalizarLegendas(l)`:** stable sort by `inicio`, then `fim`; used on every legend entry path (EV:819-823, 1845, 1853).
- **`blocosDoEstado(ctx)`:**

| Lane | Blocks |
|---|---|
| cenas | `[clipes[k].inicio, clipes[k+1]?.inicio ?? total]`; end screen is its own block over `[clipes[n].inicio, total]` |
| marcas | `efeitoSonoro !== "nenhum" ? relogio.emendas.map(e => e.de) : []` (server uses unrounded offsets, FF:956-962; ≤ 1 frame apart) |
| voce | `disp = (segundosDoVoce ?? inicio+8) − inicio`, `dur = min(duracao ?? disp, disp, total−entra)`; `estimado` when duration unknown; both handles; movable |
| voz | per item of `audiosEfetivos`: `len = vozEstimada ? estimated : segundosDaVoz`; `D = duracao ?? (len != null ? len−C : 5)`; `ate = min(total, N+D)`; `estimado` when estimated or `len` null; handles only when not estimated; `foraDoVideo` when `N ≥ total−audioMin` |
| musica | `D = duracao ?? (laco ? total−N : seg−C)`; `ate = min(total, N+D)`; waveform and fades |
| textos | one block per scene with a legend or texts: `preso`, `contagem`, `itens` (legend first); title as a thin band `[0, telaFinalEntra ? total−4+ultimaEmenda : total]` (VP:585-586) |
| adesivos | same as textos |
| legendas | `[inicio, min(fim, total)]`, movable, no handles |

- **`limitesDoItem`, `pontosDeEncaixe(ctx, excluir, cursor)`, `encaixar(t, pontos, limiar)`:** as before. Blocks in the same lane can't overlap; legends may.
- **`aplicarGesto(ctx, ref, gesto, opcoes)`:** always applies to the state at gesture start (total delta, no drift); snaps the nearer edge.
  - **Music and voice:**
    - `mover`: `N' = clamp(N+δ, max(prevEnd,0), min(nextStart,total) − (ate−N))`.
    - `aparaInicio(para)`: `N' = clamp(para, max(prevEnd, N−C), ate−audioMin)`, `C' = C + (N'−N)`, `D' = ate−N'`; `parouNaBorda` when clamped at `N−C`.
    - `aparaFim(para)`: `fimMax = min(nextStart, total, laco ? ∞ : N+seg−C)` (voice `N+len−C`; refused when `len` is unknown); `ate' = clamp(para, N+audioMin, fimMax)`. `duracao` becomes `undefined` when `ate' === total && laco`, or when `ate' === N+seg−C` for non-looping music, or `ate' === N+len−C` for voice.
    - `deslizarTrecho` (music): `C' = clamp(C−δ, 0, laco ? seg−0.01 : seg−D)`; `N` and `D` unchanged.
  - **Você** (0.1 rounding, V:1107-1119):
    - `mover`: `entra' = clamp(entra+δ, 0, min(120, total−1))`.
    - `aparaInicio`: `inicio' = clamp(inicio+δ, 0, 60)`, `entra' = entra + (inicio'−inicio)`, `duracao' = duracao − (entra'−entra)` when set; keep `dur ≥ 1`.
    - `aparaFim`: `duracao' = clamp(para−entra, 1, min(60, disp))`; `undefined` when `para ≥ entra+disp`.
  - **Legends** (0.01 rounding): `mover` shifts both edges within `[0,total]`; `aparaInicio` `clamp(para, 0, fim−0.2)`; `aparaFim` `clamp(para, inicio+0.2, total)`. All return the new index after re-sorting.
  - **Scenes:** `reordenar` = the EV:1013-1021 splice.
  - **Texts, stickers, title, end screen:** no gestures in Delivery 1.
  - **R2:** text and sticker trims in clip-local `[0, duracao]`, canonicalized by `limparJanela`; `parouNaBorda` at 0 or at `duracao`.
- **`dividirNoTempo(ctx, ref, t, novoId)`:** requires `N+audioMin ≤ t ≤ ate−audioMin`, not estimated, under the piece limit.
  - Left piece: `duracao = t−N`, `fadeSaida 0`.
  - Right piece: `id = novoId()`, `noVideo = t`, `corte = C+(t−N)`, `duracao` = the original's (or undefined), `fadeEntrada 0`, keeps `fadeSaida`, `volume`, `laco`.
  - Selection moves to the right piece.
- **`apagar(ctx, ref)` → `{ estado, selecao: null, legendasApagadas, narracaoDesligada }`:**
  - Music item: removed.
  - Voice item: removed along with every legend piece entirely inside `[N, ate)`. If it was the last voice item: `narracao = null` and `narracaoDesligada = true` (EV maps to `setNarrar(false)`, keeping roteiro and file for undo).
  - Você: `apresentador = null`. Legend piece: removed; `null` when none remain (EV:905-911). Text: `indice −1` sets `legenda ""`, else removed (EV:957-959). Sticker: removed (EV:988-990). Title: `""`. Scene: removed (EV:926-929). End screen: `telaFinal = false`.
- **`botaoInicioAqui`, `botaoFimAqui`, `botaoDeslocar`:** `aplicarGesto` wrappers without snapping.
- **`moverParaFoto(ctx, ref, ±1)`:** free-position rule from EV:948-949; errors "A foto seguinte já tem 3 textos" / "…3 elementos" (V:798-800); a scene legend moves only into an empty target legend.
- **`duplicarNaFoto(ctx, ref)`** (EV:1350, EV:975-983); **`moverLegendasComVoz`** (midpoint inside the window); **`legendasDaTranscricao`** (maps file time to video time per piece, replacing EV:819-823).
- **`faixaAberta`:** selection's lane, then `FAIXA_DA_ABA[aba]` if it has content, then the last strip opened, then the first lane with content. `FAIXA_DA_ABA = { audio:"musica", legendas: voice items ? "voz" : "legendas", voce:"voce", texto:"textos", elementos:"adesivos" }` (tabs EV:248-261).
- **`zoomParaAjustar(total, px)`** = `clamp((px−32)/total, 4, 120)`.
- **`acoesDaSelecao(ctx, ref, t, gerando)`:** `AcaoBarra = {id; rotulo; icone; ativo; motivo?; perigo?}`. Every action that changes state is inactive while `gerando`, with the reason "Espere o vídeo terminar de gerar" (as LT:261-316).
- **`realinharSelecao(ctx, selecao)`:** drops or re-indexes refs. Audio, Você and legend timing never move when scenes change; items past a shorter total are flagged `foraDoVideo`, never mutated. R2: `clampJanelasDaCena` in the same step as a scene-duration change.

---

## D. UI

### D1. Components and interfaces
- **LF `components/editor/faixas/linha-de-faixas.tsx`** (P5, new file; LT stays untouched until P7a switches EV:64 and deletes LT):
```ts
export type RelogioDaPrevia = { agora(): number; assinar(fn: (t: number) => void): () => void };
export type PropsLinhaDeFaixas = { faixas: FaixasDaLinha; total: number; relogio: RelogioDaPrevia; tempo: number /* throttled 100 ms */;
  tocando: boolean; zoom: number; selecao: RefItem|null; faixaAberta: FaixaId|null; todasAbertas: boolean; podeDesfazer: boolean;
  podeRefazer: boolean; gerando: boolean; celular: boolean; picos: Partial<Record<MusicaId,{porSeg;max;picos:Uint8Array;segundos}>>;
  miniaturas: Record<string,string|null>; capa: string|null; semSom: Set<string>;
  simularGesto(ref, g): ResultadoGesto<any>; aoConfirmarGesto(ref, g): void; aoTocar(tocar: boolean): void /* reaches preview SYNCHRONOUSLY */;
  aoBuscar(t, origem: "regua"|"rolagem"|"arraste"): void; aoZoom(px): void; aoAjustar(): void; aoAlternarFaixas(): void; aoAbrirFaixa(f): void;
  aoSelecionar(ref|null): void; aoAbrirLista(grupo: BlocoLinha): void; aoMenu(ref, x, y): void; aoDesfazer(): void; aoRefazer(): void;
  aoSoltarFoto(chaveAlvo: string|null, ev: React.DragEvent): void /* desktop drag from Mídia, EV:1001-1009 */ };
```
- **Sub-components** in `faixas/`: `controles.tsx`, `regua.tsx`, `trilha-de-cenas.tsx`, `faixa.tsx`, `bloco.tsx`, `forma-de-onda.tsx`; hooks `usar-gestos.ts` (`useGestosDaLinha`) and `usar-rolagem.ts` (`useRolagemCentrada`). Dev harness `app/dev/linha-do-tempo/page.tsx` with P3 fixture states and `/exemplos/*.jpg`.
- **P6 new components:**
  - `barra-da-selecao.tsx` `{ titulo; preso?; acoes: AcaoBarra[]; aoAcao(id); aoFechar(); subBarra? }`: 44 px; a sub-bar replaces the action row; inputs inside use `text-base` (16 px, no iOS focus zoom).
  - `aviso-desfazer.tsx` `useAvisos(): { avisar(texto, {desfazer?, ms?}); elemento }`: fixed, centered, `bottom: calc(var(--altura-linha) + 8px)`, 44 px, max-width 343, 4 s, Desfazer button 44×44.
  - `lista-da-foto.tsx`: 44 px rows, max 3 visible (164 px), inner scroll, fixed above the timeline.
  - `legenda-no-palco.tsx` `{ legendas; tempo; alturaPalco; apresentadorNoPe; selecionado?; aoSelecionar(i) }`: geometry FF:379-404 (3.4 % of H; bottom 14 %, 36 % with rodapé; black@0.6 box or border; 86 % width; `posicao` centro).
  - `usar-historico.ts`:
    ```ts
    export function useHistorico<D>(doc: D, restaurar: (d: D) => void, o?: { limite?: 50; juntarMs?: 600 }):
      { desfazer(): boolean; refazer(): boolean; podeDesfazer: boolean; podeRefazer: boolean; novoPasso(): void; limpar(): void; contagem() }
    ```
    - The store is `useState(() => criarPilha<D>())` (a plain object with `assinar`/`versao`), read through `useSyncExternalStore`; no refs.
    - Effect on `[doc]`: if `pilha.restaurando`, baseline = doc and clear the flag; else if outside the burst window or after `novoPasso`, push the baseline onto undo, clear redo, baseline = doc.
    - `restaurar` is skipped (and the snapshot discarded) when the snapshot is shallow-equal per field to the current doc, so the flag can't stick.
    - `doc` must be memoized. The pure reducer `historicoPuro` is exported for Node tests.
- **P6 edits to existing files (all additive; missing new props = today's behavior):**
  - **AP:** optional `tempo`, `tocando`, `selecionado`, `aoSelecionar`, `aoMedirDuracao`. When `tempo` is provided: `muted playsInline` without `autoPlay loop`; visible only inside `[entra, entra+dur)` or as a 40 % ghost when selected; resync when `|currentTime − (inicio + t − entra)| > 0.15`; paused → `pause()` + seek (100 ms throttle); `onLoadedMetadata` also reports `duration` (AP:125-128). When absent: AP:119-124 as today.
  - **GT (57-84):** optional `aba`, `aoMudarAba`, `indiceAlvo`. Without `indiceAlvo`, `.at(-1)` wiring (EV:1959-1963) keeps working.
  - **GE (135+):** optional `selecionado`.
  - **ENP (37-56):** optional `selecionado`, `aoSelecionar`; tap selects; long press keeps the MC trigger.
  - **UI Icone (UI:184):** append `pausa`, `desfazer`, `refazer`, `ajustar`, `faixas`, `volume`, `fade`, `trecho`, `inicio_aqui`, `fim_aqui`, `seta_esq`, `seta_dir`, `microfone`, `legenda` (`link` already exists).
- **P4 files:**
  - `usar-previa-de-audio.ts`:
    ```ts
    export type FontePrevia = { chave: string; url: string; bytes?: number };
    export type ItemPrevia = { id; fonte: FontePrevia; barramento: "musica"|"voz"; noVideo; corte; dur; volume; fadeEntrada; fadeSaida; laco: boolean;
      modo?: "buffer" | "elemento" };
    export function usePreviaDeAudio(o: { itens: ItemPrevia[]; marcas: MarcaPrevia[]; total: number; aoTerminar(): void;
      aoSemSom(motivo: "contexto"|"decodificar"|"elemento", chave?: string): void }):
      { relogio; tocando; tocar(t); pausar(); buscar(t); duracaoDe(chave); estadoDaFonte(chave); preparar(fontes); semSom };
    ```
  - `lib/previa-audio.ts`: `agendaDaPrevia(itens, t0, dur)` — offset is `laco ? off % dur : off`; a non-looping entry with `off ≥ dur` is omitted. Also `ganhoNoTempo`, `janelasDeVoz`.
  - `lib/picos-audio.ts`: `decodificarPicos`, `picosDoBuffer`, `caminhoDaOnda`.
- **`components/editor/usar-resumo-edicao.ts`** (P0 creates, P7 wires): `useResumoEdicao(celular): { registrar(e); registrarEdicao(t, via); resumo(): ResumoEdicao; aposGerar(): void }`. `abertoEm` is set in a mount effect; `aposGerar` resets counters and increments `geracao`.

### D2. Pixel budget
**Phone.** CSS variables live on the editor root (EV:1491, `.editor-escuro`), written by a ResizeObserver effect in EV:
- `--altura-linha` = LF height.
- `--altura-fileira` = 68.5 px (tabs) or 44 px (toolbar).
- `--painel-min` = 96 px normally, 0 in Faixas mode.
- `--altura-palco = min(39svh, calc(100svh − 57px − var(--altura-fileira) − var(--altura-linha) − var(--painel-min)))`.

| Block | Rule | px at 375×812 |
|---|---|---|
| header | EV:1493 unchanged | 57 |
| stage section | EV:2390 `max-md:h-[46vh]` → `max-md:h-[var(--altura-palco)]` | 316.7 at rest; 308.5 in Faixas mode (6 lanes) |
| tab row / toolbar | EV:1514 unchanged / `h-11` in the same `order-2` slot | 68.5 / 44 |
| panel | flex remainder (EV:1537); `max-md:hidden` in Faixas mode | 171.8 / 196.3 |
| timeline, no lanes | control 44 + ruler 14 + scenes 56 | 114 |
| timeline, n lanes | 114 + 44 + 8·(n−1) | 198 at n = 6 |
| Faixas mode | 114 + 44·n, **no inner scroll**; the stage shrinks instead | 378 at n = 6 |

- **At 375×667:** stage `min(260.1, 247.5)` = 247.5; panel 96 at rest; Faixas mode leaves a 163.5 px stage.
- **Inside the stage section:**
  - The card becomes a `div` with Cartao's classes (UI:162-164) minus `p-5`, plus `p-2 sm:p-4`. The `p-3` at EV:2466 never applied (obs 0076).
  - The frame (EV:2486) gets `width: min(100%, calc((var(--altura-palco) − 42px) * ${PROPORCAO_NUM[formato]}))`, `aspectRatio`, class `max-md:h-auto`.
  - The caption line (EV:2641-2643) becomes `max-md:hidden`.
  - The `erro` and `editandoDe` banners (EV:2391-2404) render at most one line with `max-md:truncate`.
- **Desktop (1280×800, 1440×900):**
  - Timeline = control 40 + ruler 16 + scenes 52 + 28·n + 2·(n−1); lanes with content open by default (286 px at n = 6).
  - The stage frame gets `md:max-h-[calc(100dvh − var(--altura-linha) − 57px − 90px)] md:w-auto` with the aspect ratio; it must be fully visible without scrolling the section.
  - Lane labels in a sticky 72 px column; the toolbar renders in the control row between the time and Ajustar (labels at ≥ lg, icons with `title` at md).
- **Control row (phone):** `flex items-center gap-0 px-2`: Play, time, Desfazer, Refazer, Ajustar, Faixas.
  - Time: `w-[112px] text-[11px] tabular-nums`, format `m:ss.d/m:ss.d` when total < 600 s.
  - Budget 16 + 5×44 + 112 = 348 ≤ 375. The harness measures the real Geist width (obs 60).
- **Touch targets:** all ≥ 44×44: control buttons, toolbar buttons (`min-w-14 h-11`), toast actions, list rows, handle hit zones. Documented exceptions: the 14 px ruler and the 8 px strips.

### D3. How lanes look
- **Order:** scenes, Você, Voz, Música, Textos, Adesivos, Legendas. Empty lanes aren't rendered.
- **8 px strip:** blocks drawn as 6 px bars in the lane color; tapping it only opens that lane. Open lane: 44 px on phone (28 desktop), blocks 40 px (24) with a 2 px inset.
- **Block content:**
  - Icon and label when width ≥ 48 px.
  - Selected: 2 px coral border, plus handles when `alcas` allows.
  - **Handle hit zone is always 44 px:** inner part = `min(22, largura/2)`, outer part = `44 − inner`, extending outside the block. Handles sit above neighbouring blocks while selected. A selected block under 44 px has no body drag; it moves with buttons.
  - `estimado`: hatched with "≈". `foraDoVideo`: red hatch with the title "Depois do fim do vídeo — sai fora". `semSom`: muted-speaker icon.
- **Music waveform** (`forma-de-onda.tsx`): one SVG per block, `viewBox="${corte*20} 0 ${dur*20} 255"`, `preserveAspectRatio="none"`; the path covers `ceil((corte+dur)/segundos)` loop turns, memoized per (musica, voltas); width `calc(var(--pxs) * dur)`; fades as shaded triangles.
- **Voice and Você:** plain bar.
- **Scene track:** thumbnails, number, ★ capa, ✨ animated (LT:383-388); effect marks as 2 px ticks with a small sound icon; the end screen block is tappable (replaces LT:403-413).
- **Textos / Adesivos:** one block per photo with the chain icon and a count badge; the title is a 10 px band at the top of Textos.
- **Playhead:** phone = fixed at center, `pointer-events: none`; desktop = moves (LT:425-429).
- **Colors:** P5 appends `--faixa-voce`, `--faixa-voz`, `--faixa-musica`, `--faixa-textos`, `--faixa-adesivos`, `--faixa-legendas`, `--linha-guia` under `.editor-escuro` in `app/globals.css` (append-only block), contrast ≥ 3:1.
- **LF root:** `-webkit-touch-callout: none; user-select: none; -webkit-user-select: none`.
- **Gone** in LF: the "uma trilha só" comment (LT:20-22) and the icon-only `Ferramenta` bar (LT:47-74, 245-317); scene tools move into the toolbar.

### D4. Interaction model (P5 gestures, P7 wiring)
**Scrolling (phone)**
- Scroller `overflow-x: auto`, `padding-inline: 50%`, content width `total·zoom`, `t = scrollLeft / zoom`.
- **User scroll is detected by intent, not a flag:** `usuarioRolando = true` on pointerdown, touchstart or wheel inside the scroller; it clears 150 ms after the last scroll event following pointerup/touchend.
- Scroll events while `usuarioRolando` call `aoBuscar(t, "rolagem")` (50 ms throttle) and pause playback. All other scroll events are ignored.
- During playback the scroll follows `relogio.assinar` inside rAF as a DOM write, and only when not `usuarioRolando`.

**Touch actions:** scroller and unselected blocks `pan-x`; selected block body and handles `none`.

**Pointer Events**
- 6 px threshold (like AP:102), `setPointerCapture`.
- Body drag → `mover` (or `deslizarTrecho` in Trecho mode); handles → `aparaInicio`/`aparaFim` with `para = aresta0 + δs`, where `δs = (δpx + auto-scroll offset) / zoom`.
- Every move calls `simularGesto` and draws a ghost (DOM transform) plus the dashed `--linha-guia` when `guia !== null`. Snap threshold 10 px.
- `pointerup` → `aoConfirmarGesto`; `pointercancel` drops the ghost. Auto-scroll 8 px/frame within 32 px of an edge.
- **A second pointer or a 2-touch `touchstart` cancels any active drag or hold** (ghost dropped) and enters pinch.
- Only selected blocks drag on touch. Mouse (`pointerType === "mouse"`) selects on pointerdown and drags immediately.
- Scenes: dragging the selected scene block reorders it; HTML5 `draggable` goes away (LT:360); the library drop target stays (`onDragOver`/`onDrop` → `aoSoltarFoto`, LT:362-363).

**Taps** (pointerup, movement < 6 px, < 450 ms)

| Target | Result |
|---|---|
| block | `aoSelecionar(ref)`; the cursor does not move (removes LT:364-368) |
| group with `contagem > 1` | `aoAbrirLista` |
| strip | open that lane |
| empty lane or scene background | `aoSelecionar(null)` |
| ruler | move the cursor (phone: animated scroll to center t; desktop: the LT:182-189 math) |

**Hold:** 450 ms without moving → `aoMenu(ref, x, y)`; EV opens `menu.abrir` (MC:55) with items mirroring `acoesDaSelecao`. No hold-to-pick-up.

**Pinch:** native `touchstart`/`touchmove` `{passive:false}` on the scroller; with 2 touches `preventDefault` and `zoom = clamp(z0·dist/dist0, 4, 120)` via rAF, keeping the time under the playhead. Also `gesturestart`/`gesturechange` `preventDefault` (Safari). Ajustar = `aoZoom(zoomParaAjustar(total, clientWidth))`.

**Desktop keyboard:** ignored when focus is in `input`, `textarea`, `select`, `button` or `[contenteditable]`. Space = play/pause (`preventDefault`); Delete/Backspace = `apagar(selecao)`; Ctrl+Z undo; Ctrl+Shift+Z / Ctrl+Y redo. Ctrl+B, Ctrl+D and Ctrl+wheel wait for owner approval.

### D5. Toolbar per type
Every trim, split or delete: `historico.novoPasso()`, then the action, then a toast with Desfazer, then `registrarEdicao(trilha, "botao")`. Mutating actions are inactive while `gerando`.
- **Música:**
  - **Trecho da música** → sub-bar "Arraste a onda para escolher o trecho" with "◀ 1s" / "1s ▶" / "Pronto"; while open, body drag = `deslizarTrecho`.
  - **Início aqui** (reasons "Leve o cursor para dentro da música" / "A música começa aqui"), **Fim aqui**.
  - **Dividir** ("Leve o cursor para dentro do trecho").
  - **Volume** → 0–100 % slider with a 44 px thumb area.
  - **Fade** → Entrada/Saída sliders 0–5 s, step 0.1, sum ≤ duration.
  - **Trocar** → `setAba("audio")` and remember `trocarAlvo`.
  - **Apagar.**
- **Voz:**
  - Início aqui, Fim aqui, Dividir; all disabled while estimated ("Gere o vídeo uma vez para cortar a voz de IA").
  - −0,5s / +0,5s; legends inside follow, toast "Legendas acompanharam a voz".
  - Volume 0–200 %.
  - Apagar: deletes legends inside the window. When it was the last piece, narration turns off. Toast "Voz apagada · N legendas junto" (+ " · narração desligada").
- **Você:** Início aqui, Fim aqui, −0,5s/+0,5s, Volume 0–200 % (step 0.1). Format, corner and size stay in the panel (EV:2097-2121) and the AP inline bar.
- **Legenda** (no handles): Início aqui, Fim aqui, −0,1s/+0,1s; Editar texto (inline 16 px input writing through `mudarTrecho`, EV:902-904); "+ trecho aqui" (`[t, min(t+2, next.inicio, total)]` when t is outside any piece, then Editar texto); Apagar.
- **Texto** (indice ≥ 0): Editar (select the scene, `setEditando`, EV:356); Animação (`setAba("texto")`, GT `aba="animacao"`, `indiceAlvo`); Foto anterior / Próxima foto; Duplicar; Apagar; chain icon in the title.
- **Scene legend** (indice −1): Editar, Foto anterior/Próxima foto, Apagar. Animação disabled: "Legenda da foto não tem animação".
- **Adesivo:** Editar (`setAba("elementos")`, GE `selecionado`); Animação; Foto anterior, Próxima foto, Duplicar, Apagar; chain icon.
- **Título:** Editar título (`setAba("texto")` + `setEditandoTitulo(true)`, EV:357); Apagar.
- **Cena:** Dividir, Aparar início, Aparar fim (EV:1266-1310), Girar, Espelhar, Congelar (EV:1401-1416), Velocidade (sub-bar chips 0,5x/1x/1,5x/2x), Duplicar, Apagar (EV:926-936), Mover ← / Mover → (EV:916-925), Capa. Enable rules and reasons carry over from LT:246-316.
- **Tela final:** Frase → `setAba("texto")` scrolled to the call-to-action field (EV:2004-2017); Tirar → `setTelaFinal(false)`.
- **Leftmost pinned:** 44 px ✕ that deselects. The rest scrolls horizontally when it doesn't fit.

### D6. What each insert does (P7)

| Insert | Result |
|---|---|
| Song picked in BA (EV:1653) | See the song rules below. BA's `escolhida` = the selected music item's id, else the first music item's, else `"nenhuma"`. |
| "Sem música" | Remove every music item; toast "Música tirada — Desfazer". |
| Recorded or uploaded voice (EV:750-751) | No voice items: add `VOZ_PADRAO`, select it, open Voz, toast "Voz adicionada — toque para cortar". Voice items present: collapse to one `{noVideo: primeiro.noVideo, corte 0, duracao undefined, volume: primeiro.volume, fades 0}`, toast "Voz trocada — Desfazer". |
| AI script reaches 10 characters with narration on | Estimated voice block (derived); one toast per session "Voz de IA na linha do tempo — dá pra cortar depois de gerar". |
| Generation completes (`gerar`, EV:1091) | Extend the response type (EV:1074) with `edicao`. If the sent narration was AI and `dd.edicao.vozArquivo` exists: `vozIaGuardada = {caminho, roteiro: the sent roteiro, voz}`, `setVozArquivo({caminho, url: dd.edicao.vozUrl, nome: "Narração de IA deste vídeo"})`, then `useResumoEdicao.aposGerar()`. Voice becomes cuttable right away, and "Fazer também em" (EV:2439) reuses it for free. |
| POST 409 `voz_reaproveitada_ausente` | Clear `vozIaGuardada`, collapse voice items as above; toast with the error text and the new cost; no automatic retry. |
| Script or AI voice changes after generation | Reuse is invalid; collapse voice items; toast "O texto mudou: a voz será gravada de novo e os cortes da voz foram desfeitos — Desfazer". |
| Você recorded or uploaded (EV:891-893) | Select `{voce}`, open the lane, toast "Você adicionado — toque para ajustar início e fim". |
| Legends generated, imported or manual (EV:819-823, 1845, 1853) | `normalizarLegendas`; open Legendas; select the first new piece; toast "N legendas na linha do tempo". Generated legends go through `legendasDaTranscricao`. |
| Text added (EV:1951-1958, 1368-1384) | Goes to `cenaAlvo`; select it, open Textos, toast "Texto na foto N". |
| Element added (EV:2058) | Goes to `cenaAlvo`; select it, open Adesivos, toast "Adesivo na foto N". |
| Transition sound (EV:1655) | Marks appear; toast "Som nas viradas — aparece nas emendas". |
| Scene added | Select the new scene; toast "Foto N na linha do tempo". |
| Template applied (EV:494-510) | One undo step; its song is applied like a library pick with no selection. |

**Song pick rules**
- A music item is selected: swap its source, toast "Música trocada — Desfazer".
- No music items: add `{id: novoId(), fonte, noVideo 0, corte 0, laco true, volume: musicaVolume, fadeEntrada 1, fadeSaida 2}`; select it, open Música, toast "Música adicionada — toque para cortar" with Desfazer.
- Music items exist but none is selected: swap the source on all of them, toast "Música trocada — Desfazer".

`cenaAlvo` = the scene of the selected scene-bound item or selected scene, else the scene under the playhead, else the `textoPendente` flow (EV:606-615).

### D7. History
- **`doc`** (`useMemo`): `{cenas, audios, apresentador, legendas, telaFinal, chamada, efeitoSonoro, transicao, musicaVolume, titulo, preco, local, narrar, origemVoz, roteiro, voz, vozArquivo, vozIaGuardada, capa, filtro, intensidadeFiltro, ajustesVideo, capaMontada, formato}`.
- **Not in `doc`:** time, selection, tab, zoom, result.
- **Restore** calls all setters in one handler, then `setSelecao(realinharSelecao(…))`.
- **Blob URLs** are never revoked while history references them.
- **Limits:** 50 steps; slider and typing bursts merge after 600 ms idle.
- **`limpar()`** runs in `editarVideo` (EV:1125) and `comecarDoZero` (EV:1170).
- **Controls:** Desfazer/Refazer in the control row and Ctrl+Z, each counted via `registrar`.

### D8. Web Audio preview (P4 engine, P7 wiring)
**CORS** (R; P0 re-checks it as the gate before step 3)
- Signed Supabase URLs and the Pexels CDN answer with `Access-Control-Allow-Origin: *`, so there is no proxy.
- `fetch(url, {mode:"cors", credentials:"omit"})` → `arrayBuffer` → `decodeAudioData`; buffers cached by `chave` (bucket path); eager `preparar`. URLs expire after 3600 s (`supabase-server.ts:19`, used at `armazenamento.ts:66`).
- Fresh recordings use their blob URL.
- If CORS fails for voice: music ships first, and voice blocks show `semSom` with "Prévia sem som desta voz".

**Catalog files for the browser**
- Server files in `public/musica` and `public/efeitos` stay untouched (96 kHz AAC, probed).
- `scripts/preparar-previa-catalogo.mjs` writes 48 kHz copies to `public/musica/previa/` and `public/efeitos/previa/` (`-ar 48000 -c:a aac -b:a 128k`). The browser preview uses them; waveform peaks and `segundos` come from the server files.
- Gate: duration equal ±0.01 s; peak correlation against the server file > 0.97.
- No edits to `gerar-musicas.mjs` or `gerar-efeitos-sonoros.mjs`.

**Você audio**
- Size from Content-Length (HEAD on the signed URL) or `Blob.size`. ≤ 25 MB: fetch and decode (`modo "buffer"`).
- Otherwise `modo "elemento"`: a hidden `<video crossOrigin="anonymous" playsInline preload="auto">` → `MediaElementAudioSourceNode` → GainNode → voice bus, resynced to the clock when drift > 0.15 s.
- If it throws, or an AnalyserNode reads RMS 0 for 1 s while playing inside the window: `aoSemSom("elemento")`, block `semSom`, toast "Prévia sem o som do Você".
- The AP `<video>` stays muted.

**Context and unlock**
- One lazy `AudioContext`; decoding is allowed while suspended.
- `tocar(t)`'s first synchronous statement is `ctx.resume()`, reached synchronously from the Play `onClick` or the Space keydown.
- `navigator.audioSession.type = "playback"` when available.

**Scheduling**
- `base = ctx.currentTime + 0.05`; for each `agendaDaPrevia` entry: `AudioBufferSourceNode` (loop only when `laco`) → GainNode (`setValueAtTime` + `linearRampToValueAtTime` fades) → bus.
- `start(base + atraso, offset)` and always `stop(base + atraso + duracao)`.
- Buses:
  - music → `duckGain` (0.54 ≈ −5.3 dB during `janelasDeVoz`, voice and Você windows; 5 ms attack, 350 ms release) → destination;
  - voice → destination;
  - transition marks are one-shot sources at gain 0.8 (FF:966).
- Gain only via GainNode (iOS ignores `element.volume`).
- Documented approximation: window ducking vs the server's sidechain.

**Clock**
- `latencia = clamp(ctx.outputLatency || ctx.baseLatency || 0, 0, 0.5)`; `relogio.agora() = t0 + (ctx.currentTime − base) − latencia` while running.
- UI in rAF while visible; a 250 ms interval handles the end while hidden. At `total`: stop all, `tocando = false`, `aoTerminar`. Replay from the end restarts at 0 (EV:2984).
- EV `tempo` subscribes at a 100 ms throttle, replacing the EV:1425-1452 loop.
- **Seek and edits while playing:** stop and reschedule (60 ms debounce while scrubbing, 100 ms after edits).

**Other players**
- On `tocar`: dispatch `window` event `"encena:parar-audio"`; BA pauses its player (BA:89-114); EV pauses the voice `<audio>` (EV:1797) and the Você `<video>` (EV:2096).
- BA's `ouvir` dispatches `"encena:parar-previa"`, which pauses the timeline preview.

**Fallbacks**
- Context not `running` 300 ms after resume, or creation fails: a `performance.now()` clock with the same interface; toast "Prévia sem som — toque em Play de novo"; `aoSemSom("contexto")`.
- One decode fails: that item goes silent, its block gets `semSom`.
- `statechange` to `interrupted`/`suspended` while playing: pause and keep the time.

**Waveform peaks:** `scripts/gerar-picos-audio.ts` writes `public/musica/picos.json` = `{ v:1, porSeg:20, faixas: { [id]: { segundos, max, picos: base64 Uint8 of round(255·min(1, max(|L|,|R|))) per 50 ms } } }`. Decoded at 48 kHz (8 kHz flattens high sounds, R). About 19 KB. It also regenerates `lib/segundos-do-catalogo.ts`.

### D9. Stage by time (P7, with P6 components)
- **Scene on stage:** `indiceNoPalco = tocando ? indiceDoCabecote : (scene-bound selection ? that scene : indiceDoCabecote)`, replacing EV:1479. The end-screen period keeps the last scene (EV:1461-1465).
- **Legends:** `LegendaNoPalco` shows the active piece.
- **Você:** AP only inside its window, synced to the clock.
- **Taps on stage items:**
  - text (EV:2595, 2607): the first tap selects; a tap on the already-selected text opens inline edit;
  - element, Você, legend: select.
- **Selected item:** 2 px dashed coral outline (AP:115 style). Title pill unchanged (EV:2510-2544).

### D10. Summary wiring
- **P0 ships first:** `abertoEm`, `dispositivo` and `geracao` in the `gerar` body (`{ imovelId, espec, resumo }`, EV:1062), counters at zero, as the "before" baseline.
- **P7 increments:**
  - `desfazer`/`refazer`;
  - `registrarEdicao(trilha, "arraste")` in `aoConfirmarGesto` when `mudou`;
  - `registrarEdicao(trilha, "botao")` on state-changing toolbar actions;
  - `faixas` when Faixas opens every lane;
  - `semSom` on every fallback toast;
  - `aparoNaBorda` in R2.
- **Not counted:** panel sliders. `aposGerar()` after each successful POST.

### D11. Release 2 UI (R2-C)
- **Group block:** each item's window becomes a 10 px sub-bar inside the 44 px lane (up to 4 rows).
- **Selecting an item:**
  - its window becomes the selected block, with handles constrained to its photo (clip-local `[0, duracao]` mapped via `clipes[k].inicio`);
  - the toolbar adds Início aqui, Fim aqui and "Foto inteira";
  - clamped trims increment `aparosNaBorda`.
- **Stage:** shows a text or element only while `tempo − clipes[k].inicio ∈ [de ?? 0, ate ?? duracao)`, with time-aware stacking.
- **Scene split** (EV:1266-1284): items entirely inside one half go to it with shifted windows; crossing items go to both halves, clamped; windowless items behave as today.
- **Scene trim** (EV:1292-1310) and duration changes run `clampJanelasDaCena` in the same undo step.
- **Scene legend:** stays whole-photo; Início aqui disabled with "A legenda da foto vale a foto inteira; use um texto".

---

## E. Work packages

### E0. Merge and deploy units (rule 0.5)
- **U0:** P0 merged and deployed before everything.
- **U1 (money):** A4.2 (AI `arquivo` in V), B8 (cost in V), B6 narration skip (VP:495), B7 (PV + R), and tests F4 + `testar-narracao-reaproveitada.ts`. One PR, one deploy. P1 writes the V parts on a branch; P2 writes the rest; they merge together.
- **U2 (Você audio):** B3 deployed before P7a.
- **U3 (timeline swap):** P5 (LF new files) and P6 (additive edits) merge anytime and render nothing new until P7a, which switches EV:64 to LF and deletes LT.
- **U4 (audio server):** B1, B2, B4, B5, B6 montar may deploy dark only together with U1, since nothing sends `audios` yet.

### P0: Measurement and guards (sequential, deployed first)
**Creates:**
- `scripts/fixtures/casos-de-args-fase3.ts`:
  - narration + presenter audio at `inicio` 0 and 2.5;
  - effect + music; effect + narration; narration only; everything;
  - 16 `sobreporPecas` cases (static PNG × 8 animations, GIF, sequence, Pexels video, before/after at index 2);
  - `filtrosDeTexto` × each animation;
  - clip-scene text cases.
- `scripts/fixtures/args-fase3-antes.json` (recorded at HEAD), `scripts/gravar-especs-fixtures.ts`, `scripts/fixtures/especs-saneadas-antes.json` (300 seeded specs in the TR:31-35 style + the F1 hand fixtures).
- `scripts/conferir-cors-audio.mjs` (read-only list, sign, fetch with Origin; never prints keys).
- `lib/resumo-edicao.ts`, `components/editor/usar-resumo-edicao.ts`, `scripts/testar-resumo-edicao.ts`.
- `scripts/sondar-ambiente.mjs`: records `wsl --status`, `docker --version` and the local ffmpeg version. At review time: no WSL, no Docker.

**Edits:**
- GAF: `--casos <modulo> --saida <arquivo>` (default unchanged).
- `scripts/testar-video-audio.mjs:24`: music through `MUSICAS` + `public/musica` (obs 0083; today it points at `assets/musica`).
- VP: `PipelineVideo.resumoEdicao`, `narracaoEstornada`; `pipelineInicial(saldoAntes, animadasGratis = [], extra = {})`.
- R: read `corpo.resumo` via `limparResumoEdicao` (moves into PV in P2).
- EV: `useResumoEdicao` at mount; send `resumo` (≤ 10 lines).

**Production binary decision:** since WSL and Docker are absent, the owner either approves a download (file name, source URL and size stated) of a win64 build of the same major as production into scratch, outside the repo, or P2 test 5 is recorded as "not verified on the production binary" and F6's owner-approved POST becomes the production proof.

**Tests:** the fixture recorder refuses to overwrite; resumo bounds, bad ISO, unknown keys; CORS GET, Range and OPTIONS on one mp3 and one mp4.

**Done when:** deployed, and one editor-generated row shows `pipeline.resumoEdicao.abertoEm`, checked read-only by the owner.

### P1: Contract and sanitizer
- **Edits:** V only (A4.2 and B8 on the U1 branch).
- **Creates:** `scripts/testar-saneador-linha.ts`, `scripts/fixtures/especs-linha.ts`.
- **Provides:** A1–A6, B8 (U1).
- **Consumes:** `lib/segundos-do-catalogo.ts` (P4, lands first at hour 0).
- **Tests:**
  - I1–I5 on the fixtures; 50 random v2 specs idempotent;
  - AI `arquivo` kept only on the regex path;
  - cost: AI without file 1, AI with file 0, recorded voice 0;
  - over-limit errors; old-equivalent v2 collapses;
  - `precisaDoEditor` true for v2 (V:934);
  - `testar-video-audio.mjs`, `testar-video-edicao.mjs` and TR still pass.
- **Done when:** all green, and I4 holds byte-for-byte against P0's snapshot.

### P2: Server render and request path
- **Edits:** FF (B1–B3, B10 in R2), VP (B6), FFR (B4), R (B7, handlers only), TR (B3 undo); V lines 826-830 and 1243-1245 only via the U1 merge with P1.
- **Creates:**
  - `lib/audio-montagem.ts`, `lib/pedido-video.ts`;
  - `scripts/testar-montagem-audio.ts`, `scripts/testar-audio-blocos.ts`, `scripts/testar-pedido-video.ts` (I8, reuse 400/409, ownership, stubbed dependencies), `scripts/testar-narracao-reaproveitada.ts` (cost 0 ⇒ pipeline narration step skips TTS, stubbed db and fal);
  - `docs/testes-reais/editor/audio-blocos/`.
- **Tests:**
  1. **Args:** `args-antes.json` and `args-fase3-antes.json` identical except the presenter `inicio > 0` consertos (chain removal); `cena_*` identical.
  2. **Resolver:** missing file, out of video, loop only when needed, fade scaling, real-total clamp, `vozDescartada`.
  3. **Local render, no database.** `limparEspec` → resolver → `argsMontagem` → ffmpeg with 3 real photos (`01..03-mobiliar-depois.jpg`) through `argsCenaFoto`, real `calma`/`clique`, the real voice (`-vn -c:a copy` from `com-voz-propria.mp4`) and a 1 kHz tone as the measuring signal. 0.25 s windows of `aresample=48000,astats=metadata=1:reset=12000`. Checks:
     - (a) music `{corte 10, noVideo 2, dur 7, fades 1/2}`: < −50 dBFS before 2.0 s, rising 2–3 s, falling 7–9 s, < −50 after 9.25 s;
     - (a′) looping music moved to `noVideo 3, corte 0` (`aloop`→`adelay`): < −50 before 3.0 s, present from the 3.00 window;
     - (b) tone voice split [3,5) and [6,8): 1 kHz > −35 inside, < −50 outside, one window of margin (webm ±10 ms);
     - (c) ducking ≥ 4 dB and within ±0.5 dB of the old branch;
     - (d) old spec, old branch vs converted v2: every window within 0.5 dB;
     - (e) transition click peak within ±0.05 s of join + in-file peak offset;
     - (f) presenter conserto `entra 6.8, inicio 1`: onset 6.8 ± 0.02, and the **old** command must fail the same check (review measured the old one at 0.00 s);
     - (g) the real-voice version written for listening. Onset detection ignores onsets inside fade ramps.
  4. **Graph to file:** 120 legend pieces + 16 items give a graph over 20 KB; the render succeeds.
  5. **Production binary:** repeat 3 and 4 with `FFMPEG_PATH` per P0's decision, or record it as not verified.
  6. **Timing:** a 12-scene spec's `montar` time with and without `audios`, same machine, limited to 1 and 2 cores (obs 0064), within +15 %.
- **Done when:** all pass; U1 and U2 respected.

### P3: Pure timeline library
- **Creates:** `lib/linha-do-tempo.ts`, `scripts/testar-linha-gestos.ts`.
- **Consumes:** P1 types (stubs until P1 lands).
- **Tests:**
  - I2, I6, I7 on P1's fixtures;
  - gesture tables per type (move, snapping, neighbour clamps, `duracao: undefined` restores including non-looping music, slip limits, Você 0.1 rounding and 1–60/0–60/0–120 bounds, legend re-indexing);
  - `dividirNoTempo` coverage with an injected `novoId`;
  - `apagar` of voice removes legends inside; last voice ⇒ `narracao null`;
  - extra scene fields survive every operation;
  - `legendasDaTranscricao` with 2 pieces; `moverParaFoto` limits;
  - `acoesDaSelecao` at 6 cursor positions per type plus `gerando`;
  - `faixaAberta`, `zoomParaAjustar`, `normalizarLegendas`;
  - property test: 2000 random sequences with no same-lane overlap, inside `[0,total]`, sanitizer idempotent.

### P4: Audio preview, peaks and catalog copies
- **Creates:**
  - `lib/segundos-do-catalogo.ts` (hour 0), `lib/previa-audio.ts`, `lib/picos-audio.ts`;
  - `components/editor/usar-previa-de-audio.ts`;
  - `scripts/gerar-picos-audio.ts`, `public/musica/picos.json`;
  - `scripts/preparar-previa-catalogo.mjs`, `public/musica/previa/*.m4a`, `public/efeitos/previa/*.m4a`;
  - `scripts/testar-previa-audio.ts`, `app/dev/previa-audio/page.tsx` (+ client component).
- **Edits:** BA (stop and reverse events).
- **Tests:**
  - `agendaDaPrevia`: offsets modulo only when looping, non-looping `off ≥ dur` omitted, gain at fade midpoints, t0 inside a fade, merged ducking windows;
  - peaks: brilho max > 60, sino = 255, correlation > 0.97;
  - `segundos` = sample count ±0.01; preview-copy gate;
  - harness at 375×812 (Chrome): `ctx.state === "running"` after Play; AnalyserNode RMS ≈ 0 at t = 1 and above threshold at t = 5 for music [2,9); after seek to 6, position = `corte + (t − noVideo)` ±0.1; a bad URL shows the fallback and increments the counter; latency subtraction applied; Você > 25 MB uses element mode.

### P5: Lanes component (new files only)
- **Creates:** LF + `components/editor/faixas/*`, `app/dev/linha-do-tempo/page.tsx`.
- **Edits:** `app/globals.css` (append-only token block).
- **Tests** in the harness at 375×812, 375×667 and 1280×800 with real thumbnails:
  - heights 198 (6 lanes, one open), 114 (none), 378 (Faixas);
  - control row fits (≤ 375, measured Geist), buttons ≥ 44×44 and non-overlapping; handle hit zones = 44 including on a 30 px block;
  - simulated touch: swipe on an unselected block scrolls without moving it; swipe on a selected block moves it; tap selects without moving time; empty tap deselects; strip tap opens its lane; ruler moves time; 450 ms hold calls `aoMenu`; a second finger cancels a drag; programmatic scroll during playback never pauses; user swipe during playback pauses;
  - pinch changes `--pxs` and keeps the playhead time; Ajustar fits; snap guide within 10 px;
  - `document.documentElement.scrollWidth === 375`.

### P6: Toolbar, history, toasts, stage pieces
- **Creates:** `barra-da-selecao.tsx`, `aviso-desfazer.tsx`, `lista-da-foto.tsx`, `legenda-no-palco.tsx`, `usar-historico.ts`, `scripts/testar-historico.ts`, `app/dev/barra-da-selecao/page.tsx`.
- **Edits (additive):** AP, GT, GE, ENP, UI icons.
- **Tests:**
  - `historicoPuro`: 600 ms coalescing, `novoPasso`, limit 50, redo cleared, restore doesn't push, no-op restore doesn't stick, `limpar`;
  - harness at 375: toolbar buttons 44 tall and ≥ 56 wide, no overlap; horizontal scroll with ✕ pinned; sub-bar input font 16 px; toast above a mock timeline without overlap; list rows 44;
  - AP only inside its window, `currentTime` within 0.15 s of a simulated clock;
  - GT animation applies to `indiceAlvo`;
  - **old-prop rendering:** AP, GT, GE and ENP rendered with today's EV props match today's DOM snapshot.

### P7: Integration (EV only; one engineer; three sequential PRs)
**7a (step 2; requires U2 live)**
- `selecionada` (EV:292) → `selecao: RefItem | null`, all uses adapted (EV:609, 928, 1479, 2973).
- `cenaAtual`, `indiceNoPalco`; switch EV:64 to LF and delete LT.
- `blocosDoEstado` from a `Ctx` over the existing states (audio from `itensDeAudioDoEspec`); v2-only audio actions disabled with "Chega na próxima etapa".
- The toolbar replaces the nav on phone (EV:1514).
- History (+ `limpar`); toasts; D6 inserts for Você, legends (normalized), texts, stickers, scenes; stage (D9).
- D2 variables and classes; `data-area` on header (EV:1493), nav/toolbar, panel (EV:1537), stage section (EV:2390) and LF root; keyboard.
- The old play loop stays, with a `performance.now()` clock behind the same interface.

**7b (step 3; after U0, U1, U4 and P4 are deployed)**
- `audios` state replaces `musica`/`vozInicio`/`vozVolume` (EV:295, 326-327); `musicaVolume` (EV:328) stays as the new-song volume.
- Initial `[musica calma, default]`; `comecarDoZero` resets it (fixes the missing music reset, EV:1170-1194) and clears history.
- The espec memo (EV:423-456) uses `...canonizarAudio({itens: audiosEfetivos(audios, narracaoBase), narracao: narracaoBase, musicaVolume})`.
- The Áudio tab slider (EV:1659-1662) edits the selected music item, or all music items, plus `musicaVolume`.
- BA picks per D6; Trocar wired; `usePreviaDeAudio` replaces EV:1425-1452; `tempo` throttled; other players paused.
- Waveforms; music toolbar fully enabled; `editarVideo` (EV:1125-1168) → `setAudios(itensDeAudioDoEspec(e))`; `aplicarTemplate` (EV:494) per D6.

**7c (step 4)**
- Voice items; `vozIaGuardada` from `editarVideo` (EV:1152) and from generation completion; `narracaoComReuso`.
- Voice tab sliders (EV:1924-1928): volume applies to all voice items; "Começa em" shifts every voice item, legends follow.
- `gerarLegendas` uses `legendasDaTranscricao`; voice and Você preview items; collapse on re-record or script change.
- Last-voice delete turns narration off; voice toolbar fully enabled.
- POST `avisos` shown as a toast; the 409 handled.
- Update `docs/planos/linha-do-tempo-faixas.md` §6 with a link to this spec.

**Tests:** section F, after each PR.

### Release 2 packages (after Delivery 1 is approved on the iPhone)
- **R2-A server (P2's engineer):** FF (B10, including the clip-scene origin), TAS, ES, EL. Creates `scripts/testar-janelas-cena.ts`:
  1. P0's args fixtures identical without windows, including clip scenes.
  2. Local render of a real photo, 6 s scene, with: a plain text `subir` [2.0, 4.5); an effect text `surgir` [1.5, 5); a GIF [3.0, 6); a movement sequence [2.4, 5.2). Frame by frame with `framemd5` over the item crop in rgb24:
     - frames before the window equal a render without the item;
     - frame `round(de·24)` differs; frame `round(ate·24)` equals the no-item render;
     - fractional (3.41) and exact (3.5) edges;
     - `no_fim` at `de + 0.62·(ate−de)` ±1 frame;
     - loop phase equals a reference render of the item alone starting at `de`.
  3. A real phone clip scene (`inicio 1`, `velocidade 1.5`) with a text at [1.0, 2.5): same edge checks.
  4. Production binary per P0's decision.
  5. Time-aware stacking: two same-position texts [0,2) and [3,6) share a level; overlapping ones stack.
- **R2-B contract and library (P1 and P3 engineers):** V (A6); `linha-do-tempo.ts` R2 gestures, `clampJanelasDaCena`, split rules. Tests: I5 for `de`/`ate` through `limparEspec` **and through `prepararPedidoDeVideo`** (I8), idempotent, byte-identical without windows; clip-local gesture tables.
- **R2-C UI (P7 engineer):** EV, LF sub-bars, P6 reasons; D11; browser checks at 375.

---

## F. Test plan and compatibility guards

### F1. Fixtures (`especs-linha.ts`, ≥ 30)
**Old specs:**
- music only; "nenhuma" with `musicaVolume` 0.3;
- AI voice `inicio` 0 / 3.3 / 10; AI voice without `origem` (V:1236);
- recorded voice volume 0.2 and 2; uploaded voice with `musicaVolume` 0.8333 (unrounded, V:1230);
- presenter: rodapé `inicio` 0; círculo `entra` 6.8 `inicio` 1 without `duracao`; `duracao` 5;
- 40 legends; `efeitoSonoro` clique with no music or voice; `telaFinal` false;
- 12 scenes with mixed transitions; texts with `arte`/`movimento`/`visual`; elements (adesivo, GIF, Pexels, ficha); a clip scene with `inicio` and `velocidade`;
- the quick-page shape (VPG:253-279).

**v2 specs:**
- music trimmed; split into 3 with the middle deleted; slipped (`corte` 12); `laco` false; looping music moved to `noVideo` 3;
- voice split into 2; voice + music + presenter `inicio` 2.5;
- AI with reuse `arquivo`; AI estimated moved to 12.3;
- old-equivalent (collapses); invalid ids; voice without narration; narration without voice; over limits; item past the end.

**R2:** windows inside the scene, clamps, `janelaMin`.

### F2. Byte-identity guards (every PR of P1, P2, R2-A)
- TR passes.
- `testar-montagem-audio.ts`: `args-antes.json` + `args-fase3-antes.json` identical except the listed consertos.
- `testar-saneador-linha.ts` I4.
- `testar-pedido-video.ts` I8.
- R2-A #1.
- Existing scripts stay green: `testar-video-edicao.mjs`, `testar-video-audio.mjs` (now runnable), `testar-elementos.ts`, `testar-efeitos-texto.ts`, `testar-movimentos.ts`, `testar-pexels.ts` (sanitizer parts only), `testar-consertos-montagem.ts`, `testar-biblioteca-audio.ts`.

### F3. Quick page `/videos` unchanged (`scripts/testar-pagina-rapida.ts`, P7)
1. VPG contains none of `audios`, `versao`, `LinhaDoTempo`, `linha-de-faixas`, `usePreviaDeAudio`.
2. The quick-page fixture gets no `audios`/`versao`, and `precisaDoEditor` is false.
3. `precisaDoEditor` is true for every v2 fixture and for `apresentador`/`legendas` specs (V:933-953).
4. Browser at 375×812 on `/videos`: no `[data-area="linha"]`, same 3-step flow, `scrollWidth === 375`.

### F4. Money and file guards
- `custoDoVideo` table (U1).
- `validarNarracaoReaproveitada` in PV with a stubbed `existe`: foreign user → 400; missing file → 409 `voz_reaproveitada_ausente`, cost unchanged.
- `testar-narracao-reaproveitada.ts`: AI + `arquivo` ⇒ the narration step never calls fal and sets `narracaoPath = arquivo`.
- B6 refund runs once (`narracaoEstornada` guard).
- DELETE never touches `voz-` files (static assertion on RID:170-172 plus a `limparTemporarios` input test).

### F5. Browser at 375×812, 375×667 and 1280×800 (P7, after each PR)
**Preconditions**
- Run against `next dev` in a Browser pane session **the owner signed in to himself**; agents never type credentials.
- Steps 7 and 8 upload to production storage: run only with the owner's explicit go-ahead. Otherwise run them in `app/dev/editor-audio/page.tsx`, a harness that feeds local blobs and stubs `/api/video/upload`.

**Layout checks** (`scripts/navegador/conferir-sobreposicao.js`)
- For every visible pair of `[data-area]` elements: `a.bottom ≤ b.top + 0.5` or the reverse (obs 0059); last `bottom ≤ innerHeight`.
- `documentElement.scrollWidth === clientWidth`.
- Every `[data-alvo-toque]` ≥ 44×44 except `[data-excecao="faixa-fina|regua"]`.
- The stage frame is fully inside the stage section.
- No element with `overflow-y: auto|scroll` inside `[data-area="linha"]` has `scrollHeight > clientHeight` (no inner scroll).
- States: nothing selected; music selected; Faixas open; 6 lanes; Volume sub-bar; list sheet; toast; `editandoDe` banner.

**Flows** (real photos from Mídia or `/exemplos/*.jpg`)
1. Pick a song → full-length block, selected, lane open, toast; `data-de=0`, `data-ate=total`.
2. Cursor at 5, Início aqui → `corte 5`, `noVideo 5`; undo restores `duracao` absent.
3. Split at 10, delete the right piece, undo, redo.
4. Trecho da música ▶ 1s three times → `corte +3`.
5. Fade 0.5 / 1.5.
6. Play: dev-only `window.__encenaPrevia.agora()` advances; AnalyserNode RMS > 0 (Chrome).
7. Record a voice (fake mic flag) → voice block; ±0,5s moves legends; delete the only voice piece → narration off; undo → back.
8. Você upload of `com-voz-propria.mp4`: Início aqui at 5 → `entra 5`, `inicio 5`; Fim aqui at 9 → `duracao 4`.
9. Select a legend: +0,1s shifts it; Editar texto (focus doesn't zoom).
10. Text on photo 2 → Próxima foto → photo 3; tapping the stage text selects it.
11. `window.__encenaEspec()` (dev only) → `limparEspec` in Node → idempotent.
12. `/videos?editar=<editor video>` ends at `/editor/video?editar=` (VPG:645).
13. Generate completion (owner go-ahead, 0 credits, no AI voice) → `resumo.geracao` increments and counters reset.

### F6. Render proof without the API
- The JSON from F5 steps 1–9 goes through the P2 local pipeline with real photos. Checks:
  - music only where edited (astats); voice pieces present;
  - Você SSIM ≥ 0.9 at 5.5 s vs source 5.5 s and at 8.5 s vs 8.5 s; absent at 4.8 s and 9.2 s; its **audio** onset at 5.0 ± 0.02 s;
  - legend band present at the moved time and absent 0.2 s after its end (rgb24 crop brightness).
- With the owner's go-ahead: one 0-credit `POST /api/video` from the editor confirms `pipeline.avisos`, `resumoEdicao`, and serves as the production-binary proof when P0 couldn't verify locally.

### F7. Owner's iPhone (required before "pronto")
- Silent switch on and off; Low Power Mode; lock and unlock mid-play (pauses); Bluetooth headphones (voice/legend sync visibly aligned).
- Voice recorded on the iPhone (mp4/aac) and earlier on desktop Chrome (webm/opus); below iOS 18.4 the "prévia sem som desta voz" fallback is expected.
- Você from a large phone video (element mode).
- Pinch zoom, a second finger during a drag, dragging a selected block, the fixed playhead while scrolling, one-handed toolbar reach, text input without zoom.

---

## G. Risks, sequencing, non-goals

### G1. Sequencing (development parallel, deploys gated)
1. **Step 1 (U0 / P0):** summary baseline, CORS re-check, environment probe, guards and fixtures. Deploy.
2. **Wave:** P1–P6 in parallel. U1+U4 deploy together when green (dark: nothing sends `audios`). U2 (B3) deploys before 7a. P5/P6 merge additively.
3. **Step 2 (P7a):** lanes, select, toolbar, undo, Você and legend timing. Internal deploy; not shown to the owner.
4. **Step 3 (P7b):** music with sound + render. First showing to the owner, labelled "prévia", only after the F5 music flows, F6 and the P4 harness pass.
5. **Step 4 (P7c):** voice. "Pronto" only after F7.
6. **Release 2:** after approval (~2 units).
7. **Release 3:** only if `aparosNaBorda` > 20 % of text trims across ≥ 30 videos in 2 weeks (decision §4).

### G2. Risks and mitigations

| Risk | Mitigation |
|---|---|
| No sound on iOS (autoplay, silent switch, suspended context, Opus < 18.4) | Resume on the Play tap; `audioSession`; `statechange` pause; silent fallback + counter; iPhone checklist |
| Preview doesn't match render (window ducking vs sidechain; unrounded join times FF:956; Bluetooth latency) | Documented; measured duck used as gain; `outputLatency` subtracted; one-frame tolerance |
| Big decodes on phones (96 kHz catalog, large Você videos) | 48 kHz browser copies; eager decode cached by path; Você > 25 MB via media element; `aloop` only when needed |
| `montar` near 280 s / 300 s (VP:609, RID:13) | Only audio inputs added; graph to file; local timing check (P2 test 6); watch `tempos.montar` p95 |
| Whitelist drops new fields (the 16/09 loss) | I4/I5/I8, avisos instead of silent drops, snapshot recorded at HEAD |
| Canonicalization hides an edit | Exact rules without tolerance; I2/I3/I7; property test |
| Free TTS or silent charge around reuse | U1 atomic; 409 instead of a surprise charge; B6 refund guard |
| `main` broken between parallel merges | New file for LF; additive P6 edits; old-prop snapshots; P7a owns the swap |
| Presenter audio fix changes old videos | Only `inicio > 0` with an audio track; conserto fixture; deployed before Você trims are exposed |
| Production ffmpeg ≠ 6.1.1 (`-/filter_complex`, compositions) | Version-aware runner; P0 binary decision; F6 production proof |
| Scroll vs drag vs pinch conflicts; accidental edits | Drag only when selected, `pan-x`, intent-based scroll detection, second pointer cancels, undo + toast, undo rate in the summary |
| EV is 3003 lines and edited by other sessions | Logic in lib and components; P7 sole EV editor during the wave; refs pinned to `1c4a98c` and re-checked at rebase |
| Small targets (8 px strips, 14 px ruler) | Harmless mis-taps; "Faixas" button; documented exception |
| Safari with visible bars shrinks the layout | `--altura-palco` formula; 375×667 checks; no inner scroll |
| Legends following voice moves surprise people | Toast + undo; only on move and delete, never on trims |
| Webm edge leak (≤ 0.012 within 7 ms, M) | Below one frame; accepted |
| Tests needing auth, uploads or Linux binaries | Owner-signed-in sessions; uploads only with go-ahead or harness stubs; P0 binary decision |

### G3. Non-goals for Delivery 1
- Duplicating audio; effect blocks and "+ Efeito aqui"; a separate "repetir" control.
- User-uploaded music; a second voice recording (a new one replaces the old); speed or pitch; volume keyframes.
- Splitting Você; clip-scene audio; voice waveform; a limiter.
- Text and sticker windows (Release 2); crossing photos and `visuais` (Release 3); `tituloAte`.
- Scene edge handles; multi-select; copy/paste; lane lock or hide.
- Vibration; desktop Ctrl+B, Ctrl+D, Ctrl+wheel.
- Changing the MediaRecorder container preference.
- Any change to `/videos`, to the scene builders, or to the server catalog audio files.

### G4. Non-goals for Release 2
- Windows crossing photos; seam warnings; scene-legend windows.
- Loop phase beyond the measured `settb`/`setpts` start shift.
- Pexels cache changes.

Task observer: I logged 0085, about a money or security invariant split across packages that can deploy separately. File: `C:/Users/Vinicius Cardoso Lim/.claude/task-observer/skill-observations/observation-log/0085-invariante-de-dinheiro-dividido-entre-pacotes-paralelos-abre-janela-no-deploy.md`. The observation backlog has never been reviewed (85 open), and I didn't start a review because this is a subagent run.

Files:
- `C:\Users\Vinicius Cardoso Lim\Desktop\Saas Ia de Corretor e imobiliária\docs\planos\linha-do-tempo-decisao.md`
- `C:\Users\Vinicius Cardoso Lim\Desktop\Saas Ia de Corretor e imobiliária\docs\planos\linha-do-tempo-faixas.md`
- `C:\Users\VINICI~1\AppData\Local\Temp\claude\C--Users-Vinicius-Cardoso-Lim-Desktop-Saas-Ia-de-Corretor-e-imobili-ria\bcc95411-7e3b-4ea0-a1ff-ec779053b717\scratchpad\rev-b3\` (review measurements)