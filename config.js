/* ============================================================
   Badaré CRM — Configuração
   ------------------------------------------------------------
   MODO LOCAL (padrão): deixe as credenciais em branco.
   Os dados são salvos no navegador (localStorage) — ótimo para
   validar o fluxo, mas NÃO compartilha entre dispositivos/time.

   MODO NUVEM (Supabase): cole a URL e a chave "anon public" do
   seu projeto Supabase (Settings → API). A partir daí o app
   grava e lê da nuvem, 24h, com o time todo enxergando o mesmo
   dado. Veja o passo a passo em supabase/README.md.
   ============================================================ */
window.BADARE_CONFIG = {
  supabaseUrl: "",   // ex.: "https://xxxxxxxx.supabase.co"
  supabaseKey: ""    // ex.: "eyJhbGciOiJI..."  (chave anon public)
};
