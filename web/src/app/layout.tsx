import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Encena IA · o imóvel inteiro, pronto para anunciar", template: "%s · Encena IA" },
  description:
    "Inteligência artificial para imóveis: mobílie ambientes vazios, remova objetos, troque piso e parede, monte o vídeo, o tour 360°, a planta baixa e as medidas do terreno — e exporte no tamanho dos portais.",
  applicationName: "Encena IA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
