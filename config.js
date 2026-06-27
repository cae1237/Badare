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
  supabaseUrl: "https://svfscujgepzvvjgsylvz.supabase.co",   // ex.: "https://xxxxxxxx.supabase.co"
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2ZnNjdWpnZXB6dnZqZ3N5bHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzcwMTIsImV4cCI6MjA5ODE1MzAxMn0.WMiX6DykBgltas75AjDUKqPZS5uXFr5ARpCv6o6d7O0"    // ex.: "eyJhbGciOiJI..."  (chave anon public)
};
