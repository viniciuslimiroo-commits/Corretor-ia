// O RESUMO DA EDIÇÃO (lib/resumo-edicao.ts): o que o servidor aceita do navegador, e a conta
// que o editor faz antes de mandar (docs/planos/linha-do-tempo-spec.md, A7 e D10).
//
//   1. limparResumoEdicao: resumo bom passa igual; limites dos contadores e da geração;
//      data torta, sem fuso ou fora da janela [agora − 48h, agora + 5min] derruba o resumo;
//      chave e trilha desconhecidas somem; o resultado é estável (limpar duas vezes = uma);
//   2. a contagem da visita: começa zerada na geração 1, soma, e `aposGerar` zera e passa
//      pra geração seguinte -- e o que ela entrega passa inteiro pelo saneador;
//   3. pipelineInicial: sem resumo, o MESMO objeto de antes; com resumo, ele vai junto;
//   4. a ligação: a rota lê `corpo.resumo` pelo saneador e o editor manda `resumo`.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-resumo-edicao.ts

import fs from "node:fs";
import path from "node:path";
import { deepStrictEqual } from "node:assert";
import { CONTADOR_MAX, GERACAO_MAX, TRILHAS_RESUMO, criarContagemDaEdicao, limparResumoEdicao, type ResumoEdicao } from "../src/lib/resumo-edicao.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const igual = (a: unknown, b: unknown) => {
  try {
    deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    return true;
  } catch {
    return false;
  }
};

const AGORA = new Date("2026-09-17T15:00:00.000Z");
const H = 60 * 60 * 1000;
const bom: ResumoEdicao = {
  v: 1,
  abertoEm: "2026-09-17T14:12:30.250Z",
  geracao: 2,
  desfazer: 3,
  refazer: 1,
  edicoes: { cenas: { arraste: 2, botao: 5 }, musica: { arraste: 0, botao: 4 }, legendas: { arraste: 1, botao: 0 } },
  faixasAbertas: 1,
  aparosNaBorda: 0,
  previaSemSom: 2,
  dispositivo: "celular",
};
const com = (mudanca: Record<string, unknown>) => ({ ...bom, ...mudanca });

// ---------- 1. o saneador ----------
{
  const r = limparResumoEdicao(bom, AGORA);
  conferir(JSON.stringify(r) === JSON.stringify(bom), "resumo bom passa igual, na mesma ordem de chaves", JSON.stringify(r));
  conferir(igual(limparResumoEdicao(r, AGORA), r), "limpar o que já foi limpo não muda nada");

  // Limites dos contadores.
  const cont = (v: unknown) => limparResumoEdicao(com({ desfazer: v }), AGORA)?.desfazer;
  conferir(cont(-1) === 0, "contador negativo vira 0", String(cont(-1)));
  conferir(cont(CONTADOR_MAX) === CONTADOR_MAX && cont(CONTADOR_MAX + 1) === CONTADOR_MAX && cont(1e12) === CONTADOR_MAX, `contador para no teto de ${CONTADOR_MAX}`, String(cont(CONTADOR_MAX + 1)));
  conferir(cont(2.7) === 2, "contador com fração é truncado", String(cont(2.7)));
  conferir(cont("5") === 0 && cont(NaN) === 0 && cont(Infinity) === 0 && cont(null) === 0 && cont(undefined) === 0 && cont(true) === 0, "contador que não é número (texto, NaN, infinito, null, ausente, booleano) vira 0");
  const ed = limparResumoEdicao(com({ edicoes: { voz: { arraste: -4, botao: 250000 } } }), AGORA)?.edicoes;
  conferir(igual(ed, { voz: { arraste: 0, botao: CONTADOR_MAX } }), "contadores das trilhas seguem os mesmos limites", JSON.stringify(ed));
  const ger = (v: unknown) => limparResumoEdicao(com({ geracao: v }), AGORA)?.geracao;
  conferir(ger(0) === 1 && ger(-3) === 1 && ger(1) === 1, "geração abaixo de 1 vira 1", `${ger(0)} ${ger(-3)}`);
  conferir(ger(GERACAO_MAX) === GERACAO_MAX && ger(GERACAO_MAX + 1) === GERACAO_MAX, `geração para em ${GERACAO_MAX}`, String(ger(GERACAO_MAX + 1)));
  conferir(ger(undefined) === 1 && ger("3") === 1, "geração ausente ou texto vira 1");

  // Data de abertura.
  for (const [a, porque] of [
    ["ontem", "palavra"],
    ["2026-09-17", "só a data"],
    ["2026-09-17T14:00:00", "hora sem fuso"],
    ["2026-13-01T10:00:00Z", "mês 13"],
    ["2026-09-17T14:00:00Z lixo", "lixo depois da data"],
    ["", "vazia"],
  ] as const) {
    conferir(limparResumoEdicao(com({ abertoEm: a }), AGORA) === null, `abertoEm torto derruba o resumo: ${porque}`);
  }
  conferir(limparResumoEdicao(com({ abertoEm: AGORA.getTime() }), AGORA) === null && limparResumoEdicao(com({ abertoEm: undefined }), AGORA) === null, "abertoEm que não é texto (número, ausente) derruba o resumo");
  const fuso = limparResumoEdicao(com({ abertoEm: "2026-09-17T11:12:30-03:00" }), AGORA);
  conferir(fuso?.abertoEm === "2026-09-17T14:12:30.000Z", "data com fuso de Brasília é guardada em UTC", String(fuso?.abertoEm));

  // Janela [agora − 48h, agora + 5min], bordas incluídas.
  const em = (ms: number) => limparResumoEdicao(com({ abertoEm: new Date(AGORA.getTime() + ms).toISOString() }), AGORA);
  conferir(em(-48 * H) !== null, "aberto há exatamente 48h passa");
  conferir(em(-48 * H - 1000) === null, "aberto há 48h e 1s é recusado");
  conferir(em(5 * 60 * 1000) !== null, "aberto 5min no futuro (relógio adiantado) passa");
  conferir(em(5 * 60 * 1000 + 1000) === null, "aberto 5min e 1s no futuro é recusado");
  conferir(limparResumoEdicao(bom, new Date("não é data")) === null, "agora inválido não deixa passar nada");

  // Formato e chaves desconhecidas.
  for (const [b, porque] of [
    [undefined, "ausente"],
    [null, "null"],
    ["resumo", "texto"],
    [[bom], "lista"],
    [com({ v: 2 }), "versão 2"],
    [com({ v: "1" }), "versão em texto"],
    [{ ...bom, v: undefined }, "sem versão"],
  ] as const) {
    conferir(limparResumoEdicao(b, AGORA) === null, `resumo recusado: ${porque}`);
  }
  const estranho = limparResumoEdicao(
    { ...bom, senha: "x", espec: { musica: "calma" }, edicoes: { ...bom.edicoes, efeitos: { arraste: 9, botao: 9 }, textos: "muitas", voce: { arraste: 1, botao: 2, clique: 7 } }, dispositivo: "tablet" },
    AGORA
  );
  conferir(!!estranho && !("senha" in estranho) && !("espec" in estranho), "chave desconhecida no resumo some");
  conferir(igual(estranho?.edicoes, { cenas: { arraste: 2, botao: 5 }, voce: { arraste: 1, botao: 2 }, musica: { arraste: 0, botao: 4 }, legendas: { arraste: 1, botao: 0 } }), "trilha desconhecida some, trilha que não é objeto some, chave a mais na trilha some", JSON.stringify(estranho?.edicoes));
  conferir(estranho?.dispositivo === "desktop" && limparResumoEdicao(com({ dispositivo: undefined }), AGORA)?.dispositivo === "desktop", "dispositivo desconhecido ou ausente vira desktop");
  conferir(igual(limparResumoEdicao(com({ edicoes: [1, 2] }), AGORA)?.edicoes, {}), "edições que não são objeto viram vazio");
  conferir(Object.keys(limparResumoEdicao(com({ edicoes: { legendas: { arraste: 1 }, cenas: {} } }), AGORA)?.edicoes ?? {}).join() === "cenas,legendas", "trilhas saem na ordem fixa, não na do pedido");
}

// ---------- 2. a contagem da visita ----------
{
  const c = criarContagemDaEdicao();
  const aberto = new Date("2026-09-17T14:00:00.000Z");
  c.abrir(aberto);
  c.abrir(new Date("2026-09-17T14:30:00.000Z"));
  const r0 = c.resumo("desktop", AGORA);
  conferir(r0.abertoEm === aberto.toISOString(), "abrir duas vezes (efeito em dev) guarda a primeira hora", r0.abertoEm);
  conferir(r0.geracao === 1 && r0.desfazer === 0 && r0.refazer === 0 && igual(r0.edicoes, {}) && r0.faixasAbertas === 0 && r0.aparosNaBorda === 0 && r0.previaSemSom === 0, "começa na geração 1, tudo zerado (o 'antes' do P0)");
  conferir(igual(limparResumoEdicao(r0, AGORA), r0), "o resumo zerado passa inteiro pelo saneador");

  c.registrar("desfazer");
  c.registrar("desfazer");
  c.registrar("refazer");
  c.registrar("faixasAbertas");
  c.registrar("aparosNaBorda");
  c.registrar("previaSemSom");
  c.registrarEdicao("musica", "arraste");
  c.registrarEdicao("musica", "botao");
  c.registrarEdicao("musica", "botao");
  c.registrarEdicao("cenas", "arraste");
  const r1 = c.resumo("celular", AGORA);
  conferir(
    igual(r1, { v: 1, abertoEm: aberto.toISOString(), geracao: 1, desfazer: 2, refazer: 1, edicoes: { cenas: { arraste: 1, botao: 0 }, musica: { arraste: 1, botao: 2 } }, faixasAbertas: 1, aparosNaBorda: 1, previaSemSom: 1, dispositivo: "celular" }),
    "soma cada evento e cada edição por trilha e via",
    JSON.stringify(r1)
  );
  conferir(JSON.stringify(limparResumoEdicao(r1, AGORA)) === JSON.stringify(r1), "o resumo contado passa pelo saneador byte a byte");
  c.registrar("desfazer");
  conferir(r1.desfazer === 2 && r1.edicoes.musica?.botao === 2, "o resumo entregue é uma cópia: contar depois não muda o que foi mandado");

  c.aposGerar();
  const r2 = c.resumo("desktop", AGORA);
  conferir(r2.geracao === 2 && r2.desfazer === 0 && igual(r2.edicoes, {}) && r2.previaSemSom === 0 && r2.abertoEm === aberto.toISOString(), "depois de gerar: geração 2, contadores zerados, mesma hora de abertura", JSON.stringify(r2));

  const semAbrir = criarContagemDaEdicao().resumo("desktop", AGORA);
  conferir(semAbrir.abertoEm === AGORA.toISOString(), "resumo pedido antes da montagem usa a hora do pedido");
  const muitas = criarContagemDaEdicao();
  for (let i = 0; i < GERACAO_MAX + 5; i++) muitas.aposGerar();
  conferir(muitas.resumo("desktop", AGORA).geracao === GERACAO_MAX, `geração da contagem para em ${GERACAO_MAX}`);
  conferir(TRILHAS_RESUMO.length === 9, "nove trilhas no resumo");
}

// ---------- 3. pipelineInicial ----------
{
  const { pipelineInicial } = await import("../src/lib/video-pipeline.ts");
  const antigo = { etapa: "cena", cenaAtual: 0, clipes: [], duracoes: [], temporarios: [], avisos: [], animada: null, narracaoPath: null, saldoAntes: 12.5, segundosDeRender: 0, animadasGratis: [1, 3] };
  conferir(JSON.stringify(pipelineInicial(12.5, [1, 3])) === JSON.stringify(antigo), "sem o terceiro argumento, o pipeline é o mesmo de antes (byte a byte)");
  conferir(JSON.stringify(pipelineInicial(12.5, [1, 3], {})) === JSON.stringify(antigo) && JSON.stringify(pipelineInicial(12.5, [1, 3], { resumoEdicao: null })) === JSON.stringify(antigo), "resumo ausente ou null não acrescenta chave");
  const r = limparResumoEdicao(bom, AGORA);
  const p = pipelineInicial(null, [], { avisos: ["Um trecho de áudio ficou de fora."], resumoEdicao: r });
  conferir(igual(p.resumoEdicao, bom) && igual(p.avisos, ["Um trecho de áudio ficou de fora."]) && p.etapa === "cena" && p.saldoAntes === null, "com resumo e avisos, os dois vão pro pipeline", JSON.stringify(p));
  conferir(!("narracaoEstornada" in p), "narracaoEstornada nasce ausente");
  const avisos = ["a"];
  const p2 = pipelineInicial(null, [], { avisos });
  p2.avisos.push("b");
  conferir(avisos.length === 1, "o pipeline não segura a lista de avisos de quem chamou");
}

// ---------- 4. a ligação ----------
{
  const rota = fs.readFileSync(path.join(RAIZ, "src", "app", "api", "video", "route.ts"), "utf8");
  // A leitura do `resumo` mudou de casa no P2: o arquivo de rota passou a exportar só os
  // handlers, e sanear o pedido (espec, dono, voz reaproveitada e resumo) virou
  // lib/pedido-video.ts, onde dá pra testar sem banco. A garantia é a mesma; o endereço, não.
  const pedido = fs.readFileSync(path.join(RAIZ, "src", "lib", "pedido-video.ts"), "utf8");
  conferir(/limparResumoEdicao\(c\.resumo, new Date\(\)\)/.test(pedido), "o preparo do pedido lê corpo.resumo pelo saneador, com a hora do servidor");
  conferir(/pipelineInicial\(saldoAntes, animadasGratis, \{ avisos, resumoEdicao: resumo \}\)/.test(rota), "a rota põe o resumo (e os avisos) no pipeline");
  const semComentarios = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  conferir(!/espec\s*[.[]\s*resumo/.test(semComentarios(rota) + semComentarios(pedido)), "o resumo não entra no espec");
  const exportados = [...rota.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((m) => m[1]);
  conferir(exportados.every((n) => ["GET", "POST", "maxDuration", "runtime", "dynamic"].includes(n)), "a rota só exporta handlers e configuração", exportados.join(","));
  const editor = fs.readFileSync(path.join(RAIZ, "src", "components", "editor", "editor-video.tsx"), "utf8");
  conferir(/resumo: resumoEdicao\.resumo\(\)/.test(editor), "o editor manda o resumo no corpo do gerar");
  conferir(/if \(!r\.ok\) throw [^\n]*\n\s*resumoEdicao\.aposGerar\(\);/.test(editor), "o editor chama aposGerar logo depois do pedido aceito");
  conferir(/useResumoEdicao\(celular\)/.test(editor), "o editor usa useResumoEdicao(celular)");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
