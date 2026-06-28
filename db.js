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
  const hasSupa = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = hasSupa ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

  const LS = "badare_records_v1";
  const readLocal = () => {
    try { return JSON.parse(localStorage.getItem(LS)) || { atendimentos: [], entregas: [] }; }
    catch (e) { return { atendimentos: [], entregas: [] }; }
  };
  const writeLocal = (d) => localStorage.setItem(LS, JSON.stringify(d));

  return {
    mode: hasSupa ? "supabase" : "local",

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
