"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Conta } from "@/components/app-shell";
import type { OfertaId } from "./planos";

// Sessão, saldo e plano num lugar só, pra Editor, Histórico e Configurações não
// repetirem a mesma dança de getUser + select + assinar + sair.
//
// O saldo é lido de users.creditos_saldo, a fonte da verdade desde a migration 02;
// quem escreve nele é sempre o servidor.

export function useConta() {
  const [user, setUser] = useState<User | null>(null);
  // Começa como "checando" só se há Supabase pra checar (evita setState síncrono no effect).
  const [checando, setChecando] = useState(() => !!supabase);
  const [conta, setConta] = useState<Conta | null>(null);
  const [releitura, setReleitura] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setChecando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("users")
      .select("creditos_saldo, plano, assinatura_status, assinatura_renova_em")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return;
        setConta({
          email: user.email ?? "",
          creditos: data.creditos_saldo,
          plano: data.plano,
          status: data.assinatura_status,
          renovaEm: data.assinatura_renova_em,
        });
      });
  }, [user, releitura]);

  const token = useCallback(async () => {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Sessão expirou. Entre de novo.");
    return t;
  }, []);

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
    setErro,
    token,
    recarregar,
    /** Sem argumento: Pro mensal (ou o portal, se já assina). Com oferta: a oferta. */
    assinar: (oferta: OfertaId = "pro_mensal") => assinar(oferta),
    sair,
  };
}
