// O VÍDEO ABANDONADO TERMINA SOZINHO? E O CRÉDITO VOLTA SOZINHO?
//
// O cron (api/cron/videos-parados) existe porque até então quem empurrava o pipeline era a
// tela: fechar o navegador no meio de um tour deixava o vídeo parado em "gerando" pra sempre,
// com o crédito preso. O botão Retomar resolvia, mas exige que a pessoa volte e clique.
//
// Dois casos, e os dois mexem no banco DE VERDADE, porque o que eu quero provar é
// exatamente o efeito no banco:
//
//   A. um vídeo encalhado que ainda dá tempo de terminar -> o cron TERMINA ele;
//   B. um vídeo que passou do prazo -> o cron DESISTE e devolve o crédito.
//
// O B roda num usuário descartável criado aqui, pra um estorno de teste não cair no saldo
// de ninguém. O A roda na conta que tem fotos (só ela tem), com um espec SÓ DE FOTOS: não
// chama IA, não custa nada, e o que ele criar é apagado no fim pelo id.
//
// Tudo que este teste cria é listado na saída e apagado por id. Se ele morrer no meio, a
// lista impressa é o que ficou pra trás.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-cron-videos-parados.ts

import fs from "node:fs";
import { pipelineInicial } from "../src/lib/video-pipeline.ts";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ALVO = process.env.ALVO ?? "http://localhost:3000";
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const criados: string[] = [];
const rest = async (caminho: string, init: RequestInit = {}) => {
  const r = await fetch(`${SUPA}/rest/v1/${caminho}`, { ...init, headers: { ...admin, ...(init.headers ?? {}), Prefer: "return=representation" } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${caminho}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
};
const rodarCron = () => fetch(`${ALVO}/api/cron/videos-parados`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }).then(async (r) => ({ status: r.status, corpo: await r.json().catch(() => null) }));
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---- a porta está trancada? ----
  const semSegredo = await fetch(`${ALVO}/api/cron/videos-parados`);
  conferir(semSegredo.status === 401, "sem o segredo, 401", String(semSegredo.status));
  const segredoErrado = await fetch(`${ALVO}/api/cron/videos-parados`, { headers: { Authorization: "Bearer errado" } });
  conferir(segredoErrado.status === 401, "com segredo errado, 401", String(segredoErrado.status));

  // ================= B. passou do prazo: desiste e devolve o crédito =================
  //
  // Primeiro este, que é o caso que HOJE não acontece sem alguém abrir a página -- e que
  // deixa o cliente sem o vídeo e sem o crédito ao mesmo tempo.
  {
    const email = `cron-${Date.now()}@teste.encena.app.br`;
    const u = await fetch(`${SUPA}/auth/v1/admin/users`, { method: "POST", headers: admin, body: JSON.stringify({ email, password: `T${Date.now()}!ab`, email_confirm: true }) }).then((r) => r.json());
    const userId = u.id as string;
    criados.push(`usuário ${userId} (${email})`);

    const CUSTO = 2;
    const trintaMinAtras = new Date(Date.now() - 30 * 60000).toISOString();
    const espec = { formato: "9:16", cenas: [{ tipo: "foto", arquivo: "uploads/nao-existe.jpg", duracao: 3 }] };
    const [video] = await rest("videos", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, titulo: "teste cron (prazo)", formato: "9:16", status: "gerando", espec, pipeline: pipelineInicial(null), creditos_cobrados: CUSTO, criado_em: trintaMinAtras }),
    });
    criados.push(`vídeo ${video.id} (prazo)`);

    const r = await rodarCron();
    conferir(r.status === 200, "o cron respondeu 200", String(r.status));

    const [depois] = await rest(`videos?select=status,erro&id=eq.${video.id}`);
    conferir(depois.status === "falhou", "vídeo que passou do prazo virou 'falhou' SEM ninguém abrir a página", depois.status);
    conferir(/créditos voltaram/.test(depois.erro ?? ""), "e o motivo diz que o crédito voltou", String(depois.erro).slice(0, 70));

    // O estorno é o que importa de verdade: sem ele a pessoa pagou por nada.
    //
    // A referência mora DENTRO do `motivo` ("estorno_video:<id>"), não na coluna `job_id` --
    // que tem chave estrangeira pra `jobs` e um id de vídeo não é um id de job. Eu procurei
    // no lugar errado na primeira versão deste teste e quase reportei defeito que não existe.
    const ledger = await rest(`credit_ledger?select=delta,motivo&user_id=eq.${userId}`);
    const estorno = (ledger as { delta: number; motivo: string }[]).find((l) => l.motivo === `estorno_video:${video.id}`);
    conferir(!!estorno, "o crédito voltou pro cliente", estorno ? `${estorno.delta} em ${estorno.motivo.slice(0, 20)}…` : `nenhuma linha de estorno (extrato tem ${(ledger as unknown[]).length} linha(s))`);
    conferir(estorno?.delta === CUSTO, `voltaram os ${CUSTO} créditos cobrados`, String(estorno?.delta));

    // ---- e não estorna DUAS vezes se o cron rodar de novo ----
    //
    // É o erro clássico de rotina que roda a cada 5 minutos: cada passada devolve crédito de
    // novo e o cliente vira uma máquina de fazer crédito.
    await rodarCron();
    const ledger2 = await rest(`credit_ledger?select=delta,motivo&user_id=eq.${userId}`);
    const quantos = (ledger2 as { motivo: string }[]).filter((l) => l.motivo === `estorno_video:${video.id}`).length;
    conferir(quantos === 1, "rodando de novo, NÃO estorna outra vez", `${quantos} estorno(s)`);
  }

  // ================= A. ainda dá tempo: o cron termina o vídeo =================
  //
  // Espec só de fotos, da conta que tem fotos: não chama IA, não custa nada, e prova o que
  // ninguém tinha provado -- que um vídeo abandonado CHEGA AO FIM sozinho.
  {
    const prontos = await rest("videos?select=id,user_id,espec,formato&status=eq.concluido&order=criado_em.desc&limit=30");
    const modelo = (prontos as { id: string; user_id: string; espec: { cenas?: { tipo?: string }[] }; formato: string }[]).find(
      (v) => (v.espec?.cenas?.length ?? 0) > 0 && v.espec.cenas!.every((c) => c.tipo !== "animada")
    );
    if (!modelo) {
      conferir(true, "nenhum vídeo só-de-fotos pra copiar o espec: caso A pulado");
    } else {
      const [video] = await rest("videos", {
        method: "POST",
        body: JSON.stringify({ user_id: modelo.user_id, titulo: "teste cron (termina)", formato: modelo.formato, status: "gerando", espec: modelo.espec, pipeline: pipelineInicial(null), creditos_cobrados: 0, criado_em: new Date().toISOString() }),
      });
      criados.push(`vídeo ${video.id} (termina)`);
      console.log(`     (copiou o espec de ${modelo.id}, ${modelo.espec.cenas!.length} cenas de foto — zero IA, zero crédito)`);

      let estado = "gerando";
      let saida: string | null = null;
      for (let volta = 1; volta <= 4 && estado === "gerando"; volta++) {
        const r = await rodarCron();
        const atendido = (r.corpo?.atendidos ?? []).find((a: { id: string }) => a.id === video.id);
        const [agora] = await rest(`videos?select=status,output_path&id=eq.${video.id}`);
        estado = agora.status;
        saida = agora.output_path;
        console.log(`     volta ${volta}: ${atendido ? `${atendido.etapas} etapas, ${atendido.fim}` : "não foi atendido nesta volta"} · status ${estado}`);
        if (estado === "gerando") await esperar(2000);
      }
      conferir(estado === "concluido", "o vídeo abandonado CHEGOU AO FIM sem ninguém abrir a página", estado);
      conferir(!!saida, "e tem arquivo gravado", saida ?? "(sem arquivo)");
      if (saida) criados.push(`arquivo ${saida}`);
    }
  }

  // ---- devolve o que mexeu ----
  console.log("\no que este teste criou:");
  for (const c of criados) console.log(`  · ${c}`);
}

main()
  .catch((e) => {
    console.error("\nERRO:", e instanceof Error ? e.message : e);
    falhas++;
  })
  .finally(async () => {
    // Apaga SÓ pelo id do que este teste criou.
    console.log("\nlimpando:");
    for (const c of [...criados].reverse()) {
      try {
        if (c.startsWith("vídeo ")) {
          const id = c.split(" ")[1];
          await fetch(`${SUPA}/rest/v1/videos?id=eq.${id}`, { method: "DELETE", headers: admin });
          console.log(`  apagado ${c}`);
        } else if (c.startsWith("usuário ")) {
          const id = c.split(" ")[1];
          await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin });
          console.log(`  apagado ${c}`);
        } else if (c.startsWith("arquivo ")) {
          const caminho = c.slice("arquivo ".length);
          await fetch(`${SUPA}/storage/v1/object/resultados/${caminho}`, { method: "DELETE", headers: admin });
          console.log(`  apagado ${c}`);
        }
      } catch (e) {
        console.log(`  NÃO consegui apagar ${c}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exitCode = falhas === 0 ? 0 : 1;
  });
