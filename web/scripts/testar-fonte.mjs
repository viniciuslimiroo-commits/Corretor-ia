// Qual forma de passar `fontfile` pro drawtext o ffmpeg aceita no Windows (caminho com
// ':' e espaços)? Roda cada variante e mostra o aviso de fonte, se houver.
import { execFileSync } from "node:child_process";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const S = process.argv[2] || ".";
const fonte = path.resolve("assets/fontes/Geist-SemiBold.ttf");
const norm = fonte.replace(/\\/g, "/");
const variantes = {
  a_escapado: "fontfile=" + norm.replace(/:/g, "\\:").replace(/ /g, "\\ "),
  b_aspas: "fontfile='" + norm + "'",
  c_aspas_colon: "fontfile='" + norm.replace(/:/g, "\\:") + "'",
  d_relativo: "fontfile=assets/fontes/Geist-SemiBold.ttf",
  e_barra_dupla: "fontfile=" + norm.replace(/:/g, "\\\\:").replace(/ /g, "\\\\ "),
};
for (const [k, v] of Object.entries(variantes)) {
  let stderr = "";
  try {
    execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "warning", "-f", "lavfi", "-i", "color=c=black:s=320x120:d=1", "-vf", "drawtext=" + v + ":text=Teste:fontsize=40:fontcolor=white:x=10:y=40", "-frames:v", "1", path.join(S, "font-" + k + ".png")], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    stderr = String(e.stderr);
  }
  const avisos = stderr.split("\n").filter((l) => l && !/Fontconfig/.test(l)).join(" | ");
  console.log(k, "->", avisos.slice(0, 220) || "(sem aviso)");
}
