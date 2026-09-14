// Configura o e-mail de login do Supabase (SMTP da Resend + textos em português).
//
//   node scripts/configurar-email.mjs            -> confere e aplica
//   node scripts/configurar-email.mjs --ver      -> só mostra como está hoje
//
// Precisa de RESEND_API_KEY no web/.env.local. Só isso: o resto é fixo.
//
// POR QUE ISSO É OBRIGATÓRIO, e não um refinamento:
// o serviço de e-mail embutido do Supabase manda 2 e-mails por HORA no projeto inteiro
// -- o terceiro corretor que tentar entrar não recebe link nenhum. E esse teto não é
// ajustável: a API responde 401 "Custom SMTP required to configure RATE_LIMIT_EMAIL_SENT".
// O painel também não deixa. O único jeito de subir o limite é ter SMTP próprio.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SO_VER = process.argv.includes("--ver");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const pat = env.SUPABASE_ACCESS_TOKEN;
const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL;
if (!pat || !supaUrl) {
  console.error("Falta SUPABASE_ACCESS_TOKEN ou NEXT_PUBLIC_SUPABASE_URL no web/.env.local.");
  process.exit(1);
}
const ref = new URL(supaUrl).hostname.split(".")[0];
const API = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

async function lerConfig() {
  const r = await fetch(API, { headers: { Authorization: `Bearer ${pat}` } });
  if (!r.ok) throw new Error(`GET config/auth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ---------------------------------------------------------------- só olhar
async function mostrar() {
  const c = await lerConfig();
  const linhas = [
    ["remetente", c.smtp_admin_email ? `${c.smtp_sender_name} <${c.smtp_admin_email}>` : "— (usando o e-mail embutido do Supabase)"],
    ["servidor", c.smtp_host ? `${c.smtp_host}:${c.smtp_port}` : "—"],
    ["e-mails por hora", String(c.rate_limit_email_sent) + (c.rate_limit_email_sent <= 4 ? "  <- teto do e-mail embutido, trava o login" : "")],
    ["intervalo pro mesmo endereço", `${c.smtp_max_frequency}s`],
    ["assunto do link", c.mailer_subjects_magic_link],
    ["assunto da confirmação", c.mailer_subjects_confirmation],
    ["tamanho do código", `${c.mailer_otp_length} dígitos`],
    ["link expira em", `${Math.round(c.mailer_otp_exp / 60)} min`],
  ];
  const l = Math.max(...linhas.map(([k]) => k.length));
  console.log(linhas.map(([k, v]) => `  ${k.padEnd(l)}  ${v}`).join("\n"));
}

// ---------------------------------------------------------------- a chave
const chave = env.RESEND_API_KEY;

// ---------------------------------------------------- de qual endereço mandar
//
// A Resend só entrega de um domínio verificado. Enquanto encena.app.br não estiver
// verificado, dá pra usar o domínio de teste dela -- mas ele só entrega no e-mail do
// dono da conta Resend. Serve pra você entrar pelo celular hoje; não serve pra cliente.
async function remetente() {
  const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${chave}` } });
  if (r.status === 401) throw new Error("A RESEND_API_KEY foi recusada pela Resend. Gere outra com Full access.");
  if (!r.ok) throw new Error(`Resend /domains ${r.status}`);
  const { data = [] } = await r.json();
  const verificado = data.find((d) => d.status === "verified");
  if (verificado) return { email: `login@${verificado.name}`, aviso: null };

  const pendente = data.find((d) => d.status !== "verified");
  return {
    email: "onboarding@resend.dev",
    aviso: pendente
      ? `O domínio ${pendente.name} está "${pendente.status}" na Resend -- os registros DNS ainda não bateram. Até lá o e-mail sai de onboarding@resend.dev, que SÓ entrega no endereço dono da conta Resend.`
      : "Nenhum domínio verificado na Resend. Usando onboarding@resend.dev, que SÓ entrega no endereço dono da conta Resend. Pra mandar pros corretores, adicione encena.app.br em Resend -> Domains.",
  };
}

// ---------------------------------------------------------------- os textos
//
// HTML de e-mail é HTML de 2005: estilo na tag, tabela no lugar de flex, nada de
// variável CSS. Cliente de e-mail que engole flexbox é exceção, não regra.
const INDIGO = "#0f2d5b";
const CORAL = "#f06b4f";

const molde = (titulo, frase, rotuloBotao, pe) =>
  `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border-radius:14px;padding:32px;">
      <tr><td>
        <div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;color:${INDIGO};">Encena</div>
        <div style="font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:#8a8a8a;margin-top:2px;">Inteligência artificial para imóveis</div>

        <h1 style="font-size:19px;color:#1a1a1a;margin:26px 0 8px;font-weight:600;">${titulo}</h1>
        <p style="font-size:15px;line-height:1.55;color:#4a4a4a;margin:0 0 22px;">${frase}</p>

        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:${CORAL};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:9px;">${rotuloBotao}</a>

        <p style="font-size:13px;line-height:1.5;color:#7a7a7a;margin:24px 0 6px;">O botão não abriu? Digite este código na tela de entrada:</p>
        <div style="font-size:26px;letter-spacing:5px;font-weight:700;color:${INDIGO};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{{ .Token }}</div>

        <hr style="border:none;border-top:1px solid #ececec;margin:26px 0 14px;" />
        <p style="font-size:12px;line-height:1.5;color:#9a9a9a;margin:0;">${pe}</p>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#a5a5a5;margin-top:14px;">Encena &middot; encena.app.br</div>
  </td></tr>
</table>`.trim();

const PE_PADRAO =
  "O link e o código valem por 1 hora e servem uma vez só. Se não foi você que pediu, pode ignorar este e-mail — ninguém entra sem ele.";

const TEXTOS = {
  mailer_subjects_magic_link: "Seu link de acesso à Encena",
  mailer_templates_magic_link_content: molde("Entrar na Encena", "É só clicar no botão abaixo. Não tem senha pra lembrar.", "Entrar na Encena", PE_PADRAO),

  mailer_subjects_confirmation: "Confirme seu e-mail na Encena",
  mailer_templates_confirmation_content: molde("Confirme seu e-mail", "Falta um clique pra sua conta ficar pronta.", "Confirmar meu e-mail", PE_PADRAO),

  mailer_subjects_recovery: "Criar uma senha nova na Encena",
  mailer_templates_recovery_content: molde(
    "Criar uma senha nova",
    "Pediram uma senha nova pra esta conta. Clique abaixo pra escolher a sua.",
    "Escolher senha nova",
    "O link vale por 1 hora. Se não foi você que pediu, ignore este e-mail: sua senha atual continua valendo."
  ),

  mailer_subjects_invite: "Você foi convidado para a Encena",
  mailer_templates_invite_content: molde("Você foi convidado", "Abriram uma conta da Encena pra você. Clique pra entrar pela primeira vez.", "Entrar na Encena", PE_PADRAO),

  mailer_subjects_email_change: "Confirme seu novo e-mail na Encena",
  mailer_templates_email_change_content: molde(
    "Confirme o novo e-mail",
    "Confirme {{ .NewEmail }} pra passar a usar este endereço na sua conta.",
    "Confirmar novo e-mail",
    "Se não foi você que pediu, ignore: o e-mail da conta não muda sem este clique."
  ),
};

// ---------------------------------------------------------------- aplicar
async function aplicar() {
  if (!chave) {
    console.error(
      [
        "Falta RESEND_API_KEY no web/.env.local.",
        "",
        "1. https://resend.com -> criar conta (grátis, 3.000 e-mails/mês)",
        "2. API Keys -> Create API Key -> permissão Full access",
        "3. Cole no web/.env.local:   RESEND_API_KEY=re_...",
        "",
        "Não precisa me mandar a chave. Depois de colar, rode este script de novo.",
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  const { email: de, aviso } = await remetente();

  const corpo = {
    smtp_admin_email: de,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: chave,
    smtp_sender_name: "Encena",
    // 2/hora era o teto do e-mail embutido. 100/hora com SMTP próprio: uma imobiliária
    // inteira entrando na segunda de manhã cabe, e continua longe do limite da Resend.
    rate_limit_email_sent: 100,
    ...TEXTOS,
  };

  const r = await fetch(API, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    console.error(`PATCH config/auth ${r.status}: ${(await r.text()).slice(0, 400)}`);
    process.exitCode = 1;
    return;
  }

  console.log("E-mail de login configurado.");
  console.log(`  remetente         Encena <${de}>`);
  console.log("  servidor          smtp.resend.com:465");
  console.log("  e-mails por hora  100  (era 2)");
  console.log("  textos            português, com código de 8 dígitos como plano B");
  if (aviso) console.log(`\nATENÇÃO: ${aviso}`);
}

// `process.exit()` no meio de um fetch derruba o Node no Windows com um assert do libuv
// ("!(handle->flags & UV_HANDLE_CLOSING)"). Então nada de exit: cada caminho devolve, e
// o processo termina sozinho quando os sockets fecham.
try {
  await (SO_VER ? mostrar() : aplicar());
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
