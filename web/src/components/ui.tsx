"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

// Peças pequenas da interface, no padrão da marca. Nada de biblioteca: Tailwind e
// as cores marca-* definidas em globals.css. Manter poucas variantes e usar sempre
// as mesmas é o que faz a tela parecer uma coisa só.

type Variante = "primaria" | "secundaria" | "discreta" | "perigo";

export function Botao({
  variante = "primaria",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; children: ReactNode }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const estilos: Record<Variante, string> = {
    primaria: "bg-marca-coral text-white hover:bg-marca-coral-escuro shadow-sm",
    secundaria: "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50",
    discreta: "text-neutral-600 hover:bg-neutral-100",
    perigo: "text-red-600 hover:bg-red-50",
  };
  return (
    <button className={`${base} ${estilos[variante]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  ativo,
  children,
  onClick,
  title,
}: {
  ativo: boolean;
  children: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={ativo}
      className={
        "rounded-full border px-3 py-1.5 text-sm transition " +
        (ativo
          ? "border-marca-indigo bg-marca-indigo text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400")
      }
    >
      {children}
    </button>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{children}</p>;
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "erro" | "ok" | "atencao"; children: ReactNode }) {
  const cores = {
    info: "border-marca-teal/40 bg-marca-teal/10 text-marca-indigo",
    ok: "border-marca-teal/40 bg-marca-teal/10 text-marca-indigo",
    erro: "border-red-200 bg-red-50 text-red-700",
    atencao: "border-amber-200 bg-amber-50 text-amber-800",
  } as const;
  return <div className={`rounded-lg border px-3 py-2.5 text-sm ${cores[tipo]}`}>{children}</div>;
}

// Ícones de linha, 24px, um por ação. Desenhados aqui pra não depender de pacote e pra
// ter o mesmo peso de traço em todos.
const traco = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function Icone({ nome, className = "h-5 w-5" }: { nome: string; className?: string }) {
  const p = { className, viewBox: "0 0 24 24", ...traco } as const;
  switch (nome) {
    case "mobiliar": // sofá
      return (
        <svg {...p}>
          <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
          <path d="M3 13a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4H3z" />
          <path d="M5 17v2M19 17v2" />
        </svg>
      );
    case "renovar": // rolo de tinta
      return (
        <svg {...p}>
          <rect x="4" y="4" width="12" height="6" rx="1.5" />
          <path d="M16 7h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-8v3" />
          <rect x="10" y="15" width="2" height="5" rx="1" />
        </svg>
      );
    case "esvaziar": // vassoura
      return (
        <svg {...p}>
          <path d="M14 4l6 6" />
          <path d="M12 6l-8 8 4 4 8-8" />
          <path d="M6 14l4 4" />
        </svg>
      );
    case "remover_objeto": // borracha
      return (
        <svg {...p}>
          <path d="M20 20H9" />
          <path d="M5 14l7-7a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L14 19H9l-4-4z" />
          <path d="M9 10l5 5" />
        </svg>
      );
    case "mudar_piso": // ladrilhos
      return (
        <svg {...p}>
          <path d="M3 12h18M12 3v18M3 7.5h18M3 16.5h18" />
        </svg>
      );
    case "mudar_parede": // tijolos
      return (
        <svg {...p}>
          <path d="M3 5h18v14H3z" />
          <path d="M3 10h18M3 15h18M8 5v5M13 10v5M8 15v4M16 5v5" />
        </svg>
      );
    case "melhorar": // sol
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      );
    case "converter_hd":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9v6M7 12h3M10 9v6M14 9v6h2a3 3 0 0 0 0-6z" />
        </svg>
      );
    case "trocar_ceu": // nuvem e sol
      return (
        <svg {...p}>
          <path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.6 11.1 3.5 3.5 0 0 0 7 18z" />
        </svg>
      );
    case "editar_prompt": // lápis
      return (
        <svg {...p}>
          <path d="M4 20l4-1 10-10-3-3L5 16z" />
          <path d="M13 7l3 3" />
        </svg>
      );
    case "historico":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "configuracoes":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case "download":
      return (
        <svg {...p}>
          <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
        </svg>
      );
    case "foto":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5-7 7" />
        </svg>
      );
    default:
      return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}
