# Badare CRM

Painel/CRM para a operação da Badare (nutrição clínica em Brasília/DF): atendimentos, conversões, entregas, central de retornos (Kanban) e cadastro — substituindo a planilha de controle.

Frontend estático (HTML/CSS/JS puro, sem build). Dados em **modo local** (navegador) para validação ou em **modo nuvem** (Supabase) para uso compartilhado pelo time, 24h.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | Shell + estilos (tema claro/escuro) |
| `app.js` | SPA: rotas, telas, inteligência de retornos, gráficos, tema |
| `auth.js` | Login, sessão e gestão de usuários (perfis admin/operacional) |
| `db.js` | Camada de dados (local ↔ Supabase, mesma interface) |
| `config.js` | Credenciais do Supabase (vazio = modo local) |
| `data.js` | Seed inicial — **não versionado (PII)**, gerado da planilha |
| `assets/` | Logos oficiais (SVG, adaptam ao tema) |
| `icon-*.png`, `icon.svg`, `apple-touch-icon.png` | Ícones do app/PWA (marca Badare) |
| `Logos/` | Arquivos originais das logos |
| `supabase/` | `schema.sql`, `seed.sql` e guia de conexão |
| `server.js` | Servidor estático para rodar localmente |

## Tudo no Supabase (nada local)

O app é **100% nuvem**: atendimentos, entregas, usuários e até as marcações de
contato/Kanban ficam no Supabase. Sem Supabase configurado, o app **não abre**
(mostra uma tela pedindo para configurar) — nada é gravado no navegador.

Único dado que fica no navegador: a **sessão** (quem está logado neste aparelho)
e a **preferência de tema** (claro/escuro) — nenhum dado de negócio.

### Configurar (uma vez)
1. No Supabase, abra **SQL Editor** e rode o `supabase/schema.sql` inteiro
   (cria tabelas, funções de usuário e o admin padrão). Depois rode `seed.sql`
   para importar os atendimentos.
2. Em **Settings → API**, copie a **Project URL** e a chave **anon public**.
3. Cole em `config.js` (`supabaseUrl` e `supabaseKey`), salve e recarregue.

### Acesso (login)
O `schema.sql` cria um administrador padrão:

- **E-mail:** `admin@badare.com`
- **Senha:** `Badare@2026`

> Troque a senha e cadastre o time em **Usuários** logo após entrar.
> Perfis: **Admin** (acesso total + gestão de usuários) e **Operacional** (uso do dia a dia).
> As senhas são verificadas/gravadas com **bcrypt dentro do Supabase** (pgcrypto),
> via funções RPC — o hash nunca chega ao navegador.

## Tema claro/escuro

Botão na barra superior (sol/lua). A preferência é salva e respeita o tema do sistema no primeiro acesso.

## Rodar localmente

```bash
node server.js     # http://localhost:4321
```
(ou qualquer servidor estático). Em modo local os dados ficam no navegador.

## Modo nuvem (time, 24h)

Siga [`supabase/README.md`](supabase/README.md): criar projeto, rodar `schema.sql` + `seed.sql`, e preencher `config.js`.

## Privacidade (LGPD)

A base contém nomes de pacientes e dados de saúde. Por isso `*.xlsx` e `data.js` **não são versionados**. Em produção, proteja o Supabase com **Auth** (login do time) e políticas de RLS por usuário — a política aberta do `schema.sql` serve apenas para validação.
