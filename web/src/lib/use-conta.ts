"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Conta } from "@/components/app-shell";
import type { OfertaId } from "./planos";

// Sessão, saldo e plano num lugar só, pra todas as telas logadas não repetirem a mesma
// dança de getUser + ler saldo + assinar + sair.
//
// O saldo vem de /api/conta (servidor), que sabe se a pessoa é membro de uma
// imobiliária: nesse caso o saldo, o plano e o status são os da imobiliária. Antes o
// navegador lia users.creditos_saldo direto; com conta de equipe isso deixou de bastar.

export function useConta() {
  const [user, setUser] = useState<User | null>(null);
  // Começa como "checando" só se há Supabase pra checar (evita setState síncrono no effect).
  const [checando, setChecando] = useState(() => !!supabase);
  const [conta, setConta] = useState<Conta | null>(null);
  const [releitura, setReleitura] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setChecando(false);
    });
    // Só troca o `user` quando a PESSOA muda, não a cada evento de sessão.
    //
    // Sem isso o app entra em laço: o efeito que lê /api/conta chama token(), token()
    // chama getSession(), getSession() dispara onAuthStateChange, o callback chamava
    // setUser com um OBJETO NOVO, a identidade mudava, o efeito rodava de novo. Medido
    // numa tela só: mais de oitocentas requisições a /api/conta e /api/books, e a conta
    // batendo no limite de autenticação do Supabase (foi o "Sessão inválida" que apareceu
    // no teste de produção). Comparar por id corta o ciclo sem mudar comportamento.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const novo = session?.user ?? null;
      setUser((atual) => (atual?.id === novo?.id ? atual : novo));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const token = useCallback(async () => {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Sessão expirou. Entre de novo.");
    return t;
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;
    let vivo = true;
    token()
      .then((t) => fetch("/api/conta", { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => {
        if (!vivo || d.error) return;
        setConta({
          email: d.email ?? user.email ?? "",
          creditos: d.creditos ?? 0,
          plano: d.plano ?? "gratis",
          status: d.status ?? null,
          renovaEm: d.renovaEm ?? null,
          tipo: d.tipo === "org" ? "org" : "user",
          org: d.org ?? null,
          marca: d.marca ?? null,
          crm: d.crm === true,
        });
        if (d.entrouEm) setAviso(`Você entrou na equipe de ${d.entrouEm}. Os créditos e a marca agora são da imobiliária.`);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user, releitura, token]);

  const recarregar = useCallback(() => setReleitura((n) => n + 1), []);

  async function assinar(oferta: OfertaId) {
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/assinar", {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ oferta }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Não consegui abrir o pagamento.");
      window.location.href = data.url; // página da Stripe: cartão é digitado lá, nunca aqui
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao abrir o pagamento.");
      setOcupado(false);
    }
  }

  async function sair() {
    await supabase?.auth.signOut();
  }

  return {
    user,
    checando,
    conta,
    ocupado,
    erro,
    aviso,
    setErro,
    token,
    recarregar,
    /** Sem argumento: Pro mensal (ou o portal, se já assina). Com oferta: a oferta. */
    assinar: (oferta: OfertaId = "pro_mensal") => assinar(oferta),
    sair,
  };
}
