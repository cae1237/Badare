# Conectar o Badaré CRM ao Supabase (modo nuvem)

Enquanto `config.js` estiver sem credenciais, o app roda em **modo local** (dados só no navegador). Siga os passos abaixo para ativar o **modo nuvem**, com dados 24h compartilhados pelo time.

## 1. Criar o projeto
1. Acesse [supabase.com](https://supabase.com) e crie uma conta (plano free).
2. **New project** → defina nome (ex.: `badare-crm`), uma senha de banco e a região mais próxima (ex.: South America / São Paulo).
3. Aguarde ~2 min o provisionamento.

## 2. Criar as tabelas e carregar os dados
No menu lateral do Supabase → **SQL Editor**:
1. Cole o conteúdo de [`schema.sql`](schema.sql) e clique em **Run**.
2. Abra uma nova query, cole o conteúdo de [`seed.sql`](seed.sql) e **Run**. Isso carrega os 566 atendimentos + 99 entregas iniciais.

## 3. Pegar as credenciais
Menu → **Project Settings** → **API**:
- Copie a **Project URL** (ex.: `https://xxxx.supabase.co`)
- Copie a chave **anon public**

## 4. Configurar o app
Edite `config.js` na raiz do projeto:
```js
window.BADARE_CONFIG = {
  supabaseUrl: "https://svfscujgepzvvjgsylvz.supabase.co/rest/v1/",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2ZnNjdWpnZXB6dnZqZ3N5bHZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzcwMTIsImV4cCI6MjA5ODE1MzAxMn0.WMiX6DykBgltas75AjDUKqPZS5uXFr5ARpCv6o6d7O0"   // anon public
};
```
Recarregue o app. Em **Configurações** o modo deve aparecer como **Nuvem (Supabase)**, e a tela **Novo Atendimento** mostrará o banner verde. A partir daí todo cadastro vai para a nuvem.

> Se publicar no GitHub Pages, lembre que `config.js` fica visível no navegador. A chave **anon** é pública por natureza — a segurança real vem das **políticas de RLS**. Para produção, troque a política aberta do `schema.sql` por **Supabase Auth** (login do time) e regras por usuário.
