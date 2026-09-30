// A TELA DA MARCA D'ÁGUA no editor de vídeo, no navegador, com a conta real.
//
// Existe porque o motor (scripts/testar-marca-dagua.ts) já estava provado com render de
// verdade e a TELA não: compilava, passava no lint e entrava no build -- nenhuma dessas
// coisas prova que um botão liga o que deve ligar. Aqui alguém clica.
//
// Não gera vídeo e não gasta crédito: só mexe nos controles e lê o estado da tela.
//
//   BASE=http://localhost:3000 node scripts/conferir-marca-dagua-na-tela.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-marca-dagua-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// Sessão por magiclink de admin: nenhuma senha em lugar nenhum, igual aos outros conferir-*.
const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

// Tem logo nesta conta? A tela tem DOIS caminhos e só um deles existe por vez.
const marca = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((r) => r.json());
const tinhaLogo = !!marca.logoUrl;

// SEM LOGO, o caminho que importa não existe na tela -- e foi assim que a primeira rodada
// terminou: quatro conferências no caminho vazio e nenhuma no cheio.
//
// Então o teste SOBE um logo de teste e o APAGA no fim, sempre (o `finally` lá embaixo).
// É a regra do projeto para teste que escreve no banco dele: devolver o que mexeu. Só sobe
// quando a conta não tinha logo nenhum -- se tivesse, escrever por cima apagaria o logo de
// verdade da pessoa, e nenhum teste vale isso.
let subiLogo = false;
if (!tinhaLogo) {
  const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 20, g: 45, b: 91, alpha: 1 } } })
    .composite([{ input: Buffer.from(`<svg width="300" height="120"><text x="150" y="76" font-family="sans-serif" font-size="46" font-weight="bold" fill="#f06b4f" text-anchor="middle">TESTE</text></svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("logo", new Blob([png], { type: "image/png" }), "logo-de-teste.png");
  const r = await fetch(`${BASE}/api/marca`, { method: "POST", headers: { Authorization: `Bearer ${access_token}` }, body: form });
  subiLogo = r.ok;
  if (!subiLogo) console.log(`  (não consegui subir o logo de teste: ${(await r.text()).slice(0, 120)})`);
}
const TEM_LOGO = tinhaLogo || subiLogo;
console.log(`conta: ${CONTA} · logo: ${tinhaLogo ? "dela, de verdade" : subiLogo ? "DE TESTE, subido agora e apagado no fim" : "nenhum"}\n`);

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });" });
const shot = async (nome) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), Buffer.from(data, "base64"));
};
const erroNaTela = () => c.avaliar("(() => { const p = document.querySelector('nextjs-portal'); const t = p?.shadowRoot?.textContent ?? ''; return /Unhandled|Runtime Error|Error:/.test(t) ? t.slice(0, 300) : ''; })()");
const clicarTexto = async (t, sel = "button") => {
  const r = await c.avaliar(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent !== null).find(e => e.innerText.trim().split('\\n')[0].trim() === ${JSON.stringify(t)}); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);
  if (r) await esperar(300);
  return r;
};
/**
 * O interruptor da marca d'água, pelo TEXTO DELE PRÓPRIO.
 *
 * A primeira versão deste teste casava o texto do ANCESTRAL (`closest('div')`), e o
 * ancestral é a seção inteira -- que tem outros interruptores dentro. Clicava no primeiro
 * botão da seção, o clique "funcionava", e o teste acusava a tela de não abrir os
 * controles. A tela estava certa; a mira é que estava errada.
 */
const INTERRUPTOR = `[...document.querySelectorAll('button[role=switch]')].filter(e => e.offsetParent).find(e => /Logo durante o v\\u00eddeo todo/i.test(e.innerText))`;
const estadoDoInterruptor = () => c.avaliar(`(() => { const b = ${INTERRUPTOR}; return b ? b.getAttribute('aria-checked') : null; })()`);
const acionarInterruptor = () => c.avaliar(`(() => { const b = ${INTERRUPTOR}; if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`);

/** A caixinha da prévia: onde o logo está dentro dela, em fração de 0 a 1. */
const posicaoDaPrevia = () =>
  c.avaliar(`(() => {
    const img = [...document.querySelectorAll('img')].find(i => i.parentElement && getComputedStyle(i).position === 'absolute' && i.parentElement.clientWidth < 200 && i.parentElement.clientWidth > 80);
    if (!img) return null;
    const pai = img.parentElement.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    return {
      cx: (r.left + r.width / 2 - pai.left) / pai.width,
      cy: (r.top + r.height / 2 - pai.top) / pai.height,
      larguraFrac: r.width / pai.width,
      opacidade: Number(getComputedStyle(img).opacity),
    };
  })()`);

try {
  await c.abrir(`${BASE}/login`, { largura: 1280, altura: 900 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { largura: 1280, altura: 900, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(1200);
  conferir(!(await erroNaTela()), "o editor abre sem erro de execução", (await erroNaTela()).slice(0, 80));

  // A seção mora no painel de Ajustes. Procura em todas as abas: o nome delas já mudou uma
  // vez ("Formato" e "Marca" viraram "Ajustes"), e um teste preso ao nome quebra junto.
  let achou = (await c.avaliar("document.body.innerText")).includes("Marca d'água");
  if (!achou) {
    const abas = await c.avaliar("[...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.innerText.trim().split('\\n')[0]).filter(t => t.length > 2 && t.length < 16)");
    for (const aba of [...new Set(abas)]) {
      await clicarTexto(aba);
      await esperar(400);
      if ((await c.avaliar("document.body.innerText")).includes("Marca d'água")) {
        achou = true;
        console.log(`     (a seção está na aba "${aba}")`);
        break;
      }
    }
  }
  conferir(achou, "a seção “Marca d'água” existe na tela");
  await shot("01-secao");

  if (!achou) throw new Error("sem a seção não há o que conferir adiante");

  const textoDaTela = await c.avaliar("document.body.innerText");

  if (!TEM_LOGO) {
    // O caminho de quem ainda não subiu logo: a tela não pode oferecer um botão que só
    // produziria um aviso depois de montar o vídeo inteiro.
    conferir(/Minha marca/i.test(textoDaTela), "sem logo, a tela manda enviar o logo em Minha marca");
    conferir(!(await clicarTexto("Logo durante o vídeo todo", "button,label,div")), "sem logo, o botão de ligar NÃO é oferecido");
    console.log("\n  A conta de teste não tem logo: o caminho COM logo não pôde ser exercido aqui.");
    console.log("  Suba um logo em /marca nessa conta e rode de novo para cobrir o resto.");
  } else {
    conferir(/Logo durante o v[íi]deo todo/i.test(textoDaTela), "com logo, a tela oferece ligar a marca d'água");

    // ---- ligar ----
    conferir((await estadoDoInterruptor()) === "false", "o interruptor existe e começa DESLIGADO", `aria-checked=${await estadoDoInterruptor()}`);
    const ligou = await acionarInterruptor();
    await esperar(600);
    conferir(ligou, "o interruptor aceita o clique");
    conferir((await estadoDoInterruptor()) === "true", "e o estado dele virou LIGADO", `aria-checked=${await estadoDoInterruptor()}`);

    const depois = await c.avaliar("document.body.innerText");
    conferir(/Canto/.test(depois) && /Tamanho/.test(depois), "ligado, aparecem os controles de canto e tamanho");
    conferir(/Transpar[êe]ncia/i.test(depois), "ligado, aparece o controle de transparência");
    conferir(/Como vai ficar/i.test(depois), "ligado, aparece a prévia");
    await shot("02-ligado");

    // ---- a prévia obedece ao canto ----
    const inicial = await posicaoDaPrevia();
    conferir(!!inicial, "a prévia desenha o logo de verdade", inicial ? `x=${inicial.cx.toFixed(2)} y=${inicial.cy.toFixed(2)}` : "não achei a imagem");
    if (inicial) {
      conferir(inicial.cx > 0.5 && inicial.cy > 0.5, "começa no canto inferior direito, como o padrão diz", `x=${inicial.cx.toFixed(2)} y=${inicial.cy.toFixed(2)}`);

      await clicarTexto("Cima · esquerda");
      await esperar(400);
      const cima = await posicaoDaPrevia();
      conferir(cima && cima.cx < 0.5 && cima.cy < 0.5, "escolher “Cima · esquerda” MOVE o logo na prévia", cima ? `x=${cima.cx.toFixed(2)} y=${cima.cy.toFixed(2)}` : "sumiu");
      await shot("03-canto-oposto");

      // ---- e ao tamanho ----
      const antesG = (await posicaoDaPrevia())?.larguraFrac ?? 0;
      await clicarTexto("Grande");
      await esperar(400);
      const grande = (await posicaoDaPrevia())?.larguraFrac ?? 0;
      conferir(grande > antesG, "“Grande” aumenta o logo na prévia", `${(antesG * 100).toFixed(0)}% → ${(grande * 100).toFixed(0)}% da largura`);
      await clicarTexto("Discreta");
      await esperar(400);
      const discreta = (await posicaoDaPrevia())?.larguraFrac ?? 0;
      conferir(discreta < grande, "“Discreta” diminui", `${(grande * 100).toFixed(0)}% → ${(discreta * 100).toFixed(0)}%`);
      // As frações do catálogo são 10 / 16 / 24: a prévia tem que bater com o que o ffmpeg
      // vai fazer, senão ela mente.
      conferir(Math.abs(discreta - 0.1) < 0.03, "a prévia usa a MESMA fração do catálogo (discreta = 10%)", `${(discreta * 100).toFixed(1)}%`);

      // ---- e à transparência ----
      const opAntes = (await posicaoDaPrevia())?.opacidade ?? 0;
      const mexeu = await c.avaliar(`(() => {
        const i = [...document.querySelectorAll('input[type=range]')].filter(e => e.offsetParent).find(e => /Transpar/i.test(e.closest('div')?.innerText ?? '') || e.getAttribute('aria-label')?.match(/Transpar/i));
        if (!i) return false;
        i.scrollIntoView({ block: 'center' });
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(i, '0.3');
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await esperar(400);
      const opDepois = (await posicaoDaPrevia())?.opacidade ?? 0;
      conferir(mexeu, "o deslizante de transparência existe e aceita mudança");
      conferir(opDepois < opAntes, "baixar a transparência deixa a prévia mais fraca", `${opAntes.toFixed(2)} → ${opDepois.toFixed(2)}`);
      await shot("04-transparente");
    }

    // ---- desligar volta ao que era ----
    await acionarInterruptor();
    await esperar(500);
    conferir((await estadoDoInterruptor()) === "false", "o interruptor volta a DESLIGADO");
    const desligado = await c.avaliar("document.body.innerText");
    conferir(!/Como vai ficar/i.test(desligado), "desligar some com os controles e a prévia");
  }

  conferir(!(await erroNaTela()), "nenhum erro de execução no fim", (await erroNaTela()).slice(0, 120));
  await shot("05-fim");
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 160));
} finally {
  await c.fechar?.();
  // DEVOLVE O QUE MEXEU. No `finally` porque um teste que falha no meio é justamente o
  // caso em que o lixo fica pra trás -- e aqui o lixo seria um logo de teste carimbando
  // as fotos de verdade dele.
  if (subiLogo) {
    const r = await fetch(`${BASE}/api/marca`, { method: "DELETE", headers: { Authorization: `Bearer ${access_token}` } });
    const conf = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
    conferir(r.ok && !conf.logoUrl, "o logo de teste foi APAGADO e a conta voltou como estava", conf.logoUrl ? "AINDA TEM LOGO" : "sem logo, como antes");
  }
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
