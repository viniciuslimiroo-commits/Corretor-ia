"use client";

import { Icone } from "@/components/ui";

// O QUE TEM NA MESA DE EDIÇÃO, ao passar o mouse no botão que leva pra lá.
//
// Ele em 12/10/2026: "na mesa de edição a pessoa pode gravar vídeo dela falando também,
// queria que mostrasse ali de descrição os principais recursos da área".
//
// A linha do botão dizia "seus vídeos, sua voz ou música, cortar e pôr texto". Três
// problemas: "sua voz" se lê como MANDAR um arquivo de áudio, e não como gravar você
// falando ali mesmo; "cortar e pôr texto" é o que todo editor faz, então não diferencia
// nada; e quatro itens não dizem que ali atrás há onze painéis.
//
// Uma linha de botão não cabe a lista -- então a lista vem aqui, e a linha do botão fica
// com o que diferencia. No celular não há passar o mouse: lá a linha do botão é tudo que a
// pessoa lê, e por isso ela precisa funcionar sozinha.
//
// A ordem NÃO é a do trilho de ferramentas: é a do que convence. Você aparecer no vídeo é
// o que um corretor não consegue em lugar nenhum por esse preço; cortar vídeo ele já viu
// no CapCut.

const RECURSOS: { icone: string; titulo: string; texto: string }[] = [
  { icone: "equipe", titulo: "Você no vídeo", texto: "grave sua voz ou apareça falando, pela câmera do aparelho" },
  { icone: "legenda", titulo: "Legenda automática", texto: "o que você falou vira legenda sozinho" },
  { icone: "video", titulo: "Seus vídeos", texto: "clipes do celular entram junto com as fotos" },
  { icone: "som", titulo: "Música e efeitos", texto: "trilha pronta, ou o áudio que você mandar" },
  { icone: "elementos", titulo: "Ficha e selos", texto: "preço, quartos, área, “vendido”, setas e contato" },
  { icone: "ajustar", titulo: "Corte fino", texto: "cortar, mover, mudar a duração, filtros e transições" },
];

export default function MesaRecursos() {
  return (
    <div
      role="tooltip"
      data-mesa-recursos="1"
      // Escondida sem mouse pela mesma regra do `@media (hover: none)` em globals.css que
      // cuida da janelinha dos estilos -- ancorada neste `data-`.
      className="pointer-events-none absolute top-full right-0 z-30 mt-2 w-[280px]"
    >
      <div className="rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-xl">
        <p className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">O que tem lá dentro</p>
        <ul className="flex flex-col gap-2">
          {RECURSOS.map((r) => (
            <li key={r.titulo} className="flex items-start gap-2">
              <Icone nome={r.icone} className="mt-[1px] h-3.5 w-3.5 shrink-0 text-marca-indigo" />
              <span className="text-[11.5px] leading-tight">
                <strong className="font-semibold text-neutral-800">{r.titulo}</strong>
                <span className="block text-neutral-500">{r.texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
