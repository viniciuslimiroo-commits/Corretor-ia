import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { IdiomaProvider } from "@/i18n/cliente";
import { GeracaoProvider } from "@/components/geracao-em-andamento";
import { COOKIE_IDIOMA, ehIdioma, idiomaDoNavegador, langHtml } from "@/i18n/idiomas";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Encena.ai · o imóvel inteiro, pronto para anunciar", template: "%s · Encena.ai" },
  description:
    "Da foto ao anúncio, com a sua marca: mobílie ambientes vazios, remova objetos, troque piso e parede, monte o vídeo, o tour 360°, a planta baixa e as medidas do terreno — e exporte no tamanho dos portais.",
  applicationName: "Encena.ai",
};

// O idioma é decidido AQUI, no servidor, e desce por prop. Ler o cookie só no navegador
// faria a página nascer em português e trocar pra espanhol um quadro depois -- e o React
// chama isso de hydration mismatch. Ler `cookies()` torna o layout dinâmico; o app já é
// dinâmico na prática (tudo por trás de login carrega dados no cliente), então o custo é
// zero e o ganho é a tela certa no primeiro pixel.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const doCookie = (await cookies()).get(COOKIE_IDIOMA)?.value;
  const idioma = ehIdioma(doCookie) ? doCookie : idiomaDoNavegador((await headers()).get("accept-language"));

  return (
    <html lang={langHtml(idioma)} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <IdiomaProvider inicial={idioma}>
          <GeracaoProvider>{children}</GeracaoProvider>
        </IdiomaProvider>
      </body>
    </html>
  );
}
