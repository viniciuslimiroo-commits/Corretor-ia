# Encena: should everything go on the timeline? Final recommendation

All three judges and the code review land on **option D**. Their totals: D 38, 38 and 42; B 31–36; A 23–24; C 23–26. The code review scored nothing but asked for B with changes that add up to D. I rechecked the key facts in the code at commit `087777b` and settled the points where they disagreed (table in section 2).

## 1. Is it correct to put everything on the timeline like CapCut?

**Partly. Copy what CapCut shows. Don't copy how loose it lets things be.**

- **In the complete editor (/editor/video): yes.**
  - Everything you add should show up as a bar at the bottom. That means music, voice, your selfie video (Você), captions, texts, stickers, GIFs and property pieces. You tap a bar to change it.
  - Instagram, CapCut, Canva (since October 2025) and iMovie all work this way.
  - Your agents already know it: Jetimob's blog sends them to CapCut and InShot.
  - A "complete" editor where you can't cut the music looks amateur.
- **Two CapCut habits would hurt an agent on a phone:**
  1. **Texts and stickers that float loose in time.** If you reorder photos, the price text would stay at second 5 while its photo moves somewhere else. On 3 of our 5 transitions, a loose text also renders broken (measured at 23, 11 and 26 dB). Professional phone editors keep these attached to their clip unless you say otherwise: Final Cut Pro for iPad and Premiere on iPhone both do.
  2. **Editing only by dragging thin bars with a finger.** Bars must be easy to tap, with big labeled buttons. Dragging is only a shortcut.
- **In the quick page (/videos): no timeline.** Real-estate video tools sell the opposite. MoveImóvel says: "Não tem timeline, não tem corte".
- **Don't build it all at once.** The first thing you see must be: "I pick a song, it appears below, I cut it, and I hear it." Today the preview is silent: Play only moves the cursor (`editor-video.tsx:1425-1452`).

## 2. Recommended option: D (the hybrid B, reordered and stricter)

### On the phone (375px)

**Timeline at rest, top to bottom**
- **Control row (44px):** Play, time, Desfazer, Refazer, Ajustar (fit the whole video) and Faixas.
- **Ruler (14px):** tapping here moves the cursor. It is the only tap that does.
- **Scene track (56px).**
  - The end screen becomes a block you can tap. Today it is a dead dashed block (`linha-do-tempo.tsx:403-413`).
  - Transition sounds are marks on the joins between photos, not blocks.
- **One lane per type, in a fixed order:** Você, Voz, Música, Textos, Adesivos (GIFs, Pexels clips and property pieces included), Legendas.
  - An empty lane is hidden.
  - A lane with content is **never hidden**. It shows as an 8px colored strip with its blocks in place, because you counted a hidden feature as missing (`backlog-pendencias.md:36-39`).
- **Which lane opens:** the lane of the open tab or the selected item grows to 44px, and only one at a time.
- **"Faixas" button:** opens every lane, using the panel's space.
  - Adobe Express removed a view like this, and users said editing became "practically impossible".
  - Once we ship it, we never remove it.
- **Scrolling and zoom:** the cursor stays fixed in the center and a sideways swipe scrolls time. Pinch zooms, and Ajustar does the same without a gesture. There is no zoom on the phone today (`linha-do-tempo.tsx:325-334`).
- **Height:** about 198px with one lane open, which is 60px more than today. The stage shrinks from 46vh (`editor-video.tsx:2390`) to about 39vh. A test at 375×812 checks that the stage, timeline and panel don't overlap, and you test on your iPhone.

**Adding something shows the result**
- Picking a song in Áudio adds a block the length of the video.
- It keeps today's fades: 1s in, 2s out (`video-ffmpeg.ts:909`).
- The Música lane opens, the block is selected, and a toast says "Música adicionada — toque para cortar".
- Every other thing you add works the same way.

**Tap**
- Tapping a block, or the item itself on the stage, **only selects it**. Today it also jumps the cursor (`linha-do-tempo.tsx:364-368`).
- Tapping empty space deselects.
- Tapping a collapsed strip only opens that lane, so a missed tap never changes anything.

**When an item is selected**
- The tab row becomes a 44px toolbar with text labels:
  - **Música:** Trecho da música (slide the song under the bar, like Instagram), Início aqui, Fim aqui, Dividir, Volume, Fade, Trocar, Apagar.
  - **Voz:** Início aqui, Fim aqui, Dividir, ±0,5s, Volume, Apagar.
  - **Você:** Início aqui, Fim aqui, ±0,5s, Volume. Format, corner and size stay in the panel.
  - **Legenda:** Início aqui, Fim aqui, ±0,1s, Editar texto, + trecho aqui, Apagar. There are no drag handles, because a 1–3s caption is only 30–90px wide at the 30px/s zoom (`editor-video.tsx:366`). That is too narrow for two 44px handles.
  - **Texto / Adesivo:** Editar, Animação, Foto anterior, Próxima foto, Duplicar, Apagar, with a chain icon. This also fixes the bug where the animation picker only reaches the last text (`.at(-1)`, `editor-video.tsx:1960-1963`).
  - **Cena:** today's tools (`linha-do-tempo.tsx:246-316`) plus Mover ← and Mover →.
- **Several texts on one photo** (up to 3 texts and 3 stickers each, `video.ts:797-800`): the photo shows one block with a number badge. Tapping it opens a list of 44px rows to pick one. Tapping the item on the stage selects it directly.

**Drag**
- Drag only moves a block that is already selected, or trims it with its handles. The handles respond to touch over at least 44px.
- Blocks snap to the cursor, scene edges and other blocks, and a guide line shows where.
- Under the hood: Pointer Events and `touch-action: pan-x`, replacing HTML5 `draggable` (`linha-do-tempo.tsx:360`).
- There is no hidden "press and hold to pick up". Press and hold opens the existing menu (`menu-contexto.tsx:70-77`), which offers the same actions as the toolbar.

**Feedback**
- Every trim, split or delete shows a toast with Desfazer. The editor has no undo today.
- No vibration: Safari on the iPhone can't do it.

**What stays in panels:** choosing and styling. That means the music library, generating or recording voice, text styles and effects, the sticker and GIF galleries, Você format and corner, generating captions, transitions, color, and the end-screen phrase. The panel decides **what** something is and how it looks; the timeline decides **when** and **for how long**. No panel control is removed, so there is always a tap-only way to do each thing.

### On desktop
- Same model with more room: every lane with content is open by default (28px lanes, 52px scenes, `plan:120`).
- You can drag blocks and handles with the mouse without selecting them first, and buttons show hover titles.
- Space, Delete, Ctrl+Z and Ctrl+Shift+Z come together with undo.
- Ctrl+B, Ctrl+D and Ctrl+wheel zoom come after you approve the phone version.

### /videos (quick page)
Nothing changes: 3 steps, no timeline, no mode switch.
- It already doesn't use the timeline: only `editor-video.tsx:64` imports it.
- It already sends any video with editor-only fields (`audios`, `versao:2`, `visuais`) to the complete editor (`video.ts:933-934`, `videos/page.tsx:646`).
- It already links to the editor (`:725`).
- The only work is regression tests, so the quick path never strips the new fields.

### Disagreements, settled with evidence

| Question | Positions | Decision | Evidence |
|---|---|---|---|
| What ships first | Engineering: first release only shows things, no server change; music comes second. The other three: audio with sound in the first release | Build it as internal deploys, but only **show you** once music plays with sound | You raised audio twice (`backlog:226-238`) and treat half-finished work as not done (`backlog:36-39`). Engineering's safe order is kept internally |
| Cutting AI voice | Engineering: AI voice can only be moved until you decide whether to charge again | **Already decided.** Once the voice is generated, it can be cut. Before that it is an estimated block that can't be cut (`plan:181`) | `backlog:228`: you already accepted reusing AI voice without charging again |
| Voice in the first delivery | Yes (corretor, mercado); only after a CORS check (engineering) | Yes, if the Supabase signed links send `Access-Control-Allow-Origin`, checked first. If they don't, music ships first, voice follows, and the preview says "prévia sem som desta voz" | `plan:185`, `plan:466` |
| Split or duplicate music | Split in (plan, corretor, mercado); both out (engineering) | Split and delete are **in**, because that is what "cortar áudio" means. Duplicate is out | Your words at `backlog:226`. The plan's per-item audio recipe already handles several pieces (`plan:156-158`) |
| Caption edges | Plan: drag them. Others: buttons | Buttons only | Captions are too narrow for handles; WCAG 2.5.7 requires a non-drag way |
| What a tap does | Plan: tap moves the cursor (`plan:96`) | Block = select; ruler = move cursor; empty space = deselect | The current select-plus-jump (`linha-do-tempo.tsx:364-368`) causes accidental jumps once there are many lanes |
| Sizes | Plan: 22px lanes, 20px handles, inner vertical scroll (`plan:122-125`) | 8px strips (tap only opens them), 44px open lane, handles responding over 44px or more, no inner scroll | Apple 44pt; WCAG 2.5.8 24px; Hoober 12mm at the bottom of the screen |
| Texts coming loose | Plan phase 4: trimming, moving or splitting an attached text detaches it (`plan:237`) | Never as a side effect. An explicit "Atravessar fotos" button, only if data asks for it | Seam breaks of 23/11/26 dB (`plan:15-21`); Final Cut Pro iPad and Premiere mobile keep overlays attached |
| Press and hold | Usability: hold to pick up. Engineering: keep the menu | No pick-up. Holding opens the existing menu, which mirrors the toolbar | NN/g: press-and-hold is not discoverable; `menu-contexto.tsx:70-77` |
| "Both pages share one component" | Memory note at `backlog:249-250` | **Out of date.** `editor-video.tsx` has no `modo` (only "cômodo" matches), and /videos doesn't import the timeline | Checked by grep at `087777b` |

## 3. Changes to docs/planos/linha-do-tempo-faixas.md

| Plan phase | Change |
|---|---|
| **1** (shipped in 034b433) | Keep. |
| **2 + the audio part of 3** | **Merge into Delivery 1.** |
| **4** | **Split** into Release 2 and a gated Release 3. |
| **5** | **Keep for later.** |
| **§6 "Para o dono"** | Rewrite to match these releases. |

**Delivery 1 (plan phases 2 + 3 merged)**
- **Kept from phase 2:**
  - pure functions in `lib/linha-do-tempo.ts`, Pointer Events, `barra-da-selecao.tsx`, `usar-historico.ts`;
  - the Você sync fix (`apresentador-no-palco.tsx`);
  - the test that opening and saving without changes gives the same spec, on 30 examples;
  - the 375px overlap test.
- **Changed from phase 2:**
  - the sizes in the table above;
  - tap selects instead of moving the cursor;
  - Voz and Música are editable, not read-only (`plan:116`);
  - text blocks select the item instead of only opening its tab (`plan:114`);
  - captions are edited with buttons;
  - delete the "uma trilha só" comment (`linha-do-tempo.tsx:20-22`).
- **Kept from phase 3:**
  - the new `audios[]` + `versao:2` fields and the per-item audio branch in `argsAudioItens`, with the old branch left intact;
  - Web Audio preview, with the audio driving the clock instead of the 50ms timer;
  - static waveform peaks for the 15 songs, while voice shows as a plain bar;
  - the CORS check first;
  - `testar-saneador-linha.ts` and the `astats` sound test;
  - a test on your iPhone.
- **Dropped from phase 3:**
  - duplicating audio;
  - "+ Efeito aqui" and effects as editable blocks (they stay automatic marks on the joins);
  - `repetir` as its own control.

**Internal order, not shown to you as "done" until step 4**
1. A small measurement deploy (section 4) and the CORS check.
2. All lanes visible, select, toolbar, undo, and Você and caption timing. No server change.
3. Music with sound, with rendering.
4. Voice.

Estimate: about 4–5 phase-1-sized units. One unit is about 1.7h, estimated from commit 034b433, not measured.

**Release 2** (from phase 4, about 2 units): texts and stickers get a start and end **inside their photo**.
- Only an `enable` time window: no cutting between photos, no seam warning.
- Old videos render byte-identical.
- `limparTextos` and `limparElementos` (`video.ts:1075`, `:1000`) must keep the new fields, tested through the API.

**Release 3** (the rest of phase 4, gated):
- Crossing photos only through an "Atravessar fotos" button, replacing detach-on-trim (`plan:237`).
- Sub-lanes are dropped (`plan:243`).
- The seam warning uses plain words, not "Usar Dissolver nesta virada" (`plan:239`).
- Build it only if the measure in section 4 says so.

**Phase 5:** `tituloAte` and copy/paste stay later. The seam fix inside `montar` (`plan:279`) only makes sense if Release 3 exists.

**Scope guard:** the backlog now says "fases 2+3+4 juntas… todos como blocos" (`backlog:238-241`), and workflow wf_5d0ff20d-d74 is writing a spec for that. Specifying them together is fine; releasing them together is not. No `visuais` field goes in before Release 3.

**The first delivery you will see:** on your iPhone, in the complete editor:
- Pick a song, and a bar appears below, already selected.
- Choose the part of the song, cut the start and end, split it and delete a middle piece, add a fade, change the volume.
- Press Play and hear it in sync. The voice bar works the same way.
- Você and caption bars show where they start and end, with "Início aqui / Fim aqui".
- Texts and stickers appear as bars tied to their photo; tapping one selects it on the video.
- Undo works everywhere.
- /videos is exactly as today.

## 4. Risks and how we measure success

**Risks and mitigations**

| Risk | Mitigation |
|---|---|
| No sound on iOS, or blocked by CORS | CORS check first; Web Audio GainNode, since iOS ignores `element.volume`; unlock audio on the Play tap; "prévia sem som" message instead of silence; your iPhone test |
| Scroll, drag and tap fighting each other | Drag only on selected items, `pan-x`, undo plus toast; watch the undo-rate measure below |
| The field whitelist dropping new fields (lost every text model on 16/09, `backlog:128-132`) | Idempotence test through the API, a list of fields that must survive, snapshots of old specs |
| Final assembly (`montar`) running out of time: 280s ffmpeg limit (`video-pipeline.ts:609`) inside the 300s route (`api/video/[id]/route.ts:13`), and it can't resume | Only audio inputs are added; filter graph goes to a file above 20KB; compare 12-scene `pipeline.tempos.montar` before and after |
| `editor-video.tsx` is 3003 lines and other sessions edit it | Logic in `lib/linha-do-tempo.ts` and new components, small commits |
| You find "attached" isn't CapCut | Release 2 timing inside the photo; a visible "Atravessar fotos" button if Release 3 happens |

**What we can actually collect.** The project has no analytics library (none in `package.json`), so no third-party tracking is assumed.

*Available today from the `videos` table:*
- `espec` holds the saved video spec, so we can see whether `audios` is present, the music start offset, trims and splits.
- `status` and `erro` give failures.
- `criado_em` and `concluido_em` give render time.
- `pipeline.tempos` gives time per step (`video-pipeline.ts:241-242`).
- `pipeline.avisos` gives warnings.
- Running `precisaDoEditor(espec)` on old rows sorts past videos into quick versus complete.

*Needs a small change, shipped **before** step 2 so we have a "before" number:* the editor sends a short summary with each generate request, stored in `pipeline` (not in `espec`, so the whitelist can't drop it and renders stay identical). It holds:
- `abertoEm`, the time the editor opened;
- undo and redo counts;
- edits per lane type, split into drag versus button;
- how often "Faixas" was opened;
- how often a trim stopped at a scene edge;
- how often the preview fell back to silent.

| Metric | Source | Reading |
|---|---|---|
| % of complete-editor videos with music or voice edited (offset, trim, split) | `espec.audios` | Is the main request used? If under 5% after 4 weeks, stop audio extras (waveforms for voice, several songs) |
| Median time from opening the editor to generating, before vs after | `abertoEm` → `criado_em` | Must not get worse by more than about 20%. That threshold is a guardrail I propose, not a benchmark |
| Undos per video; share of edits by drag vs button | summary | A jump in undo rate right after drags means accidental touches on the phone |
| Render failure rate and `tempos.montar` p95, with vs without `audios` | `status`, `erro`, `pipeline.tempos` | p95 must stay well under 280s |
| Silent-preview fallbacks | summary | Above 0 on iOS means the audio fix failed |
| Quick vs complete share of videos | `precisaDoEditor(espec)` | /videos must not lose usage |
| **Release 3 gate:** text and sticker trims that stop at a scene edge | summary | Build "Atravessar fotos" only if this is above 20% of text trims across 30 or more videos in 2 weeks (same style as `plan:279`) |
| Your approval on your iPhone | you | Required before "pronto" (`backlog:35`) |

We can't measure time per gesture, rage taps or session replays, so we won't promise them.

## 5. Evidence

Marks used below: **(V)** I verified it in code at `087777b` or in the docs. **(O)** the judges say they opened the page themselves. **(D)** it comes from the research notes and was not reopened.

| Claim | Source |
|---|---|
| The timeline is one track on purpose; music, voice and captions are panel settings | `linha-do-tempo.tsx:20-22` (V) |
| The preview is silent; Play is a 50ms timer | `editor-video.tsx:1425-1452`, no `AudioContext` (V) |
| Tapping a scene selects it and moves the cursor; HTML5 `draggable` | `linha-do-tempo.tsx:360-368` (V) |
| The animation picker only reaches the last text | `editor-video.tsx:1960-1963` (V) |
| Music always starts at 0, fade 1s in / 2s out | `video-ffmpeg.ts:909` (V) |
| 3 texts and 3 stickers per scene | `video.ts:797-800` (V) |
| /videos doesn't use the timeline and routes editor-only specs to the editor | `editor-video.tsx:64` is the only importer; `video.ts:933-934`; `videos/page.tsx:646,725` (V) |
| The memory note about a shared component is out of date | `backlog:249-250` vs grep for `modo` (V) |
| You already approved AI voice reuse without charging again | `backlog:228` (V) |
| Plan: audio read-only in phase 2, 22px lanes and 20px handles, detach on trim, sub-lanes | `plan:116,122,125,237,243` (V) |
| Seam breaks at 23/11/26 dB on Deslizar/Aproximar/Desfoque | `plan:15-21` (V) |
| 280s ffmpeg budget and 300s route | `video-pipeline.ts:439,609`; `api/video/[id]/route.ts:13` (V) |
| No product analytics; data lives in `videos.espec`, `pipeline`, `criado_em`, `concluido_em` | `package.json`; `supabase/migration-09-videos.sql:11-29`; `api/video/route.ts:96-110` (V) |
| Your requests: everything on the timeline, audio, "não só botões", quick vs complete | `backlog:226-238, 51, 247-248` (V) |
| Instagram Reels puts clips, audio, stickers and text on one screen (2023) | https://about.fb.com/news/2023/04/instagram-reels-trending-audio-and-gifts-updates/ (D) |
| Final Cut Pro iPad connected clips stay attached | https://support.apple.com/guide/final-cut-pro-ipad/connect-clips-deve869fd97f/ipados (D) |
| Premiere iPhone overlays stay linked to their clip | https://helpx.adobe.com/premiere/mobile/manage-clips/move-clips-from-main-track-to-overlay-track.html (D) |
| CapCut: tap a clip to get the bottom toolbar | https://www.capcut.com/resource/extract-audio-from-video (D) |
| iMovie music fills the whole movie by default | https://support.apple.com/guide/imovie-iphone/add-music-and-soundtracks-kna257fc2a9/ios (D) |
| Removing Adobe Express's all-layers view made editing "practically impossible" | https://community.adobe.com/questions-329/how-to-show-all-layers-view-in-the-adobe-express-video-timeline-1224272 (O) |
| Mobile timeline design: wider handle hit areas, snapping, gesture conflicts | https://img.ly/blog/designing-a-timeline-for-mobile-video-editing/ (O) |
| Realtor tools sell "no timeline" | https://moveimovel.com.br/ (O); https://www.reel-e.ai/blog/real-estate-video-templates (D) |
| Brazilian real-estate CRM blog recommends CapCut and InShot | https://www.jetimob.com/blog/editores-video-corretor-imovel/ (D) |
| Canva switched to a multi-track timeline in October 2025 | https://www.canva.com/help/creating-and-editing-videos/ (search summary only; the page returned 403) |
| Minimum touch size 44pt | https://developer.apple.com/design/human-interface-guidelines/buttons (D) |
| Minimum 24px (AA); every drag needs a non-drag alternative | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html, https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html (D) |
| Touch targets at the bottom of the screen need about 12mm | https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/ (D) |
| Press-and-hold is not discoverable | https://www.nngroup.com/articles/contextual-menus/ (D) |
| iOS ignores `element.volume` set from JavaScript | https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html (O, archived doc) |
| No web vibration on the iPhone | https://caniuse.com/vibration (D) |

Files:
- C:\Users\Vinicius Cardoso Lim\Desktop\Saas Ia de Corretor e imobiliária\docs\planos\linha-do-tempo-faixas.md
- C:\Users\Vinicius Cardoso Lim\Desktop\Saas Ia de Corretor e imobiliária\web\src\components\editor\linha-do-tempo.tsx
- C:\Users\Vinicius Cardoso Lim\Desktop\Saas Ia de Corretor e imobiliária\web\src\components\editor\editor-video.tsx
- C:\Users\Vinicius Cardoso Lim\Desktop\Saas Ia de Corretor e imobiliária\web\src\lib\video.ts
- C:\Users\Vinicius Cardoso Lim\.claude\projects\C--Users-Vinicius-Cardoso-Lim-Desktop-Saas-Ia-de-Corretor-e-imobili-ria\memory\backlog-pendencias.md (lines 249-250 are out of date and need fixing)

Task observer: nothing logged. What I found here is project facts (the stale memory note, and the AI-voice decision already made at `backlog:228`), not skill issues. I applied open observation 0003 (paths with spaces). The review has never run and 80 observations are open; I did not start it because this is a subagent.