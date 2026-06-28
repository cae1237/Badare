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

  const LS = "badare_records_v1";
  const readLocal = () => {
    try { return JSON.parse(localStorage.getItem(LS)) || { atendimentos: [], entregas: [] }; }
    catch (e) { return { atendimentos: [], entregas: [] }; }
  };
  const writeLocal = (d) => localStorage.setItem(LS, JSON.stringify(d));

  return {
    mode: hasSupa ? "supabase" : "local",
    reason,            // por que está em modo local (vazio = está na nuvem)
    hasConfig: !!(url && key),

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

    /* carrega toda a base (seed + adicionados no modo local; tabelas no modo nuvem) */
    async load() {
      if (hasSupa) {
        const [a, e] = await Promise.all([
          sb.from("atendimentos").select("*").order("data", { ascending: true }),
          sb.from("entregas").select("*").order("data", { ascending: true }),
        ]);
        if (a.error) throw a.error;
        if (e.error) throw e.error;
        return { atendimentos: a.data || [], entregas: e.data || [] };
      }
      const add = readLocal();
      return {
        atendimentos: SEED.atendimentos.concat(add.atendimentos),
        entregas: SEED.entregas.concat(add.entregas),
      };
    },

    /* insere um atendimento */
    async addAtendimento(rec) {
      if (hasSupa) {
        const { data, error } = await sb.from("atendimentos").insert(rec).select().single();
        if (error) throw error;
        return data;
      }
      const add = readLocal();
      rec.id = "u" + Date.now();
      add.atendimentos.push(rec);
      writeLocal(add);
      return rec;
    },

    /* insere uma entrega */
    async addEntrega(rec) {
      if (hasSupa) {
        const { data, error } = await sb.from("entregas").insert(rec).select().single();
        if (error) throw error;
        return data;
      }
      const add = readLocal();
      rec.id = "e" + Date.now();
      add.entregas.push(rec);
      writeLocal(add);
      return rec;
    },

    /* registros adicionados localmente (para reset/depuração) */
    localCount() {
      const a = readLocal();
      return a.atendimentos.length + a.entregas.length;
    },
    clearLocal() { writeLocal({ atendimentos: [], entregas: [] }); },
  };
})();
