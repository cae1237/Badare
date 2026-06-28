/* ============================================================
   Badare CRM — Camada de Dados (Data Access Layer)
   ------------------------------------------------------------
   Abstrai a origem dos dados. Dois modos automáticos:
   • "supabase" — se config.js tiver URL + chave válidas
   • "local"    — caso contrário (localStorage, semeado com data.js)

   A interface é a mesma nos dois modos, então a tela de inserção
   não muda quando você plugar o Supabase.
   ============================================================ */
window.BadareDB = (function () {
  const SEED = window.BADARE_DATA || { atendimentos: [], entregas: [] };
  const cfg = window.BADARE_CONFIG || {};
  // limpa espaços/quebras acidentais coladas junto das credenciais
  const url = (cfg.supabaseUrl || "").trim();
  const key = (cfg.supabaseKey || "").trim();

  // motivo exato caso NÃO entre em modo nuvem (ajuda a diagnosticar)
  let reason = "";
  if (!url && !key) reason = "config.js está sem URL e sem chave (modo local).";
  else if (!url) reason = "config.js está sem a supabaseUrl.";
  else if (!key) reason = "config.js está sem a supabaseKey.";
  else if (!/^https:\/\/.+\.supabase\.co/.test(url)) reason = "supabaseUrl não parece válida (use https://xxxx.supabase.co).";
  else if (!window.supabase) reason = "biblioteca do Supabase não carregou (sem internet ou CDN bloqueada).";

  const hasSupa = !!(url && key && window.supabase && !reason);
  const sb = hasSupa ? window.supabase.createClient(url, key) : null;
  if (hasSupa) reason = "";

  const requireSupa = () => { if (!hasSupa) throw new Error(reason || "Supabase não configurado."); };

  return {
    mode: hasSupa ? "supabase" : "local",
    reason,            // por que está em modo local (vazio = está na nuvem)
    hasConfig: !!(url && key),
    sb,                // cliente Supabase (ou null)

    /* chama uma função RPC do Supabase (usado pela camada de usuários) */
    async rpc(fn, args) {
      if (!hasSupa) throw new Error(reason || "Supabase não configurado.");
      const { data, error } = await sb.rpc(fn, args || {});
      if (error) throw new Error(error.message || String(error));
      return data;
    },

    /* estado compartilhado (marcações de contato, kanban, data de ref.) */
    async kvGet(chave, fallback) {
      if (!hasSupa) return fallback;
      const { data, error } = await sb.from("app_kv").select("valor").eq("chave", chave).maybeSingle();
      if (error) throw new Error(error.message || String(error));
      return data ? data.valor : fallback;
    },
    async kvSet(chave, valor) {
      if (!hasSupa) return;
      const { error } = await sb.from("app_kv").upsert({ chave, valor, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message || String(error));
    },

    /* testa a conexão de verdade: lê e grava/apaga um registro de teste.
       Retorna {ok, steps, error} com a mensagem exata do Supabase. */
    async test() {
      if (!hasSupa) return { ok: false, error: reason || "Modo local — Supabase não configurado." };
      const steps = [];
      try {
        const r = await sb.from("atendimentos").select("id").limit(1);
        if (r.error) throw new Error("Leitura falhou: " + r.error.message);
        steps.push("Leitura da tabela atendimentos OK");
        const probe = { cliente: "__teste_conexao__", data: new Date().toISOString().slice(0,10) };
        const w = await sb.from("atendimentos").insert(probe).select().single();
        if (w.error) throw new Error("Gravação falhou: " + w.error.message);
        steps.push("Gravação OK (id " + w.data.id + ")");
        const d = await sb.from("atendimentos").delete().eq("id", w.data.id);
        if (d.error) steps.push("Aviso: não consegui apagar o registro de teste (id " + w.data.id + ")");
        else steps.push("Registro de teste removido");
        return { ok: true, steps };
      } catch (e) {
        return { ok: false, steps, error: e.message || String(e) };
      }
    },

    /* carrega toda a base diretamente do Supabase */
    async load() {
      requireSupa();
      const [a, e] = await Promise.all([
        sb.from("atendimentos").select("*").order("data", { ascending: true }),
        sb.from("entregas").select("*").order("data", { ascending: true }),
      ]);
      if (a.error) throw a.error;
      if (e.error) throw e.error;
      return { atendimentos: a.data || [], entregas: e.data || [] };
    },

    /* insere um atendimento no Supabase */
    async addAtendimento(rec) {
      requireSupa();
      const { data, error } = await sb.from("atendimentos").insert(rec).select().single();
      if (error) throw error;
      return data;
    },

    /* insere uma entrega no Supabase */
    async addEntrega(rec) {
      requireSupa();
      const { data, error } = await sb.from("entregas").insert(rec).select().single();
      if (error) throw error;
      return data;
    },
  };
})();
