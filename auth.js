/* ============================================================
   Badare CRM — auth.js
   Autenticação e gestão de usuários — 100% no Supabase.

   • Usuários ficam na tabela `usuarios` do Supabase.
   • Senhas são verificadas/gravadas com bcrypt DENTRO do banco
     (pgcrypto), via funções RPC. O hash nunca chega ao navegador.
   • Perfis: "admin" (gerencia usuários) e "operacional".
   • Único dado local: a SESSÃO (quem está logado neste navegador)
     — é só um identificador de sessão, como em qualquer site.
   ============================================================ */
(function(){
  'use strict';

  const SKEY = 'badare_session';   // sessão deste navegador (não são dados)

  function setSession(u){ localStorage.setItem(SKEY, JSON.stringify({ id:u.id, name:u.nome||u.name, email:u.email, role:u.role, ts:Date.now() })); }
  function session(){ try{ return JSON.parse(localStorage.getItem(SKEY)); }catch(e){ return null; } }

  // currentUser/isAdmin são síncronos (leem a sessão em cache); a fonte
  // de verdade é o Supabase, consultado no login e na tela de usuários.
  function currentUser(){
    const s = session(); if(!s) return null;
    return { id:s.id, name:s.name, email:s.email, role:s.role };
  }
  function isAdmin(){ const u = currentUser(); return !!u && u.role==='admin'; }
  function logout(){ localStorage.removeItem(SKEY); }

  async function login(email, pw){
    const rows = await BadareDB.rpc('badare_login', { p_email:String(email||'').trim(), p_senha:String(pw||'') });
    const u = Array.isArray(rows) ? rows[0] : rows;
    if(!u) throw new Error('E-mail ou senha incorretos.');
    setSession(u);
    return currentUser();
  }

  // ---- CRUD via RPC (o servidor valida e protege) ----
  async function list(){
    const rows = await BadareDB.rpc('badare_user_list');
    return (rows||[]).map(u=>({ id:u.id, name:u.nome, email:u.email, role:u.role, active:u.ativo, createdAt:u.created_at }));
  }
  async function create({ name, email, password, role }){
    if(!isAdmin()) throw new Error('Apenas administradores podem criar usuários.');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email||'').trim())) throw new Error('E-mail inválido.');
    await BadareDB.rpc('badare_user_create', { p_nome:name, p_email:email, p_senha:password, p_role:role });
    return true;
  }
  async function update(id, { name, email, role, password }){
    if(!isAdmin()) throw new Error('Apenas administradores podem editar usuários.');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email||'').trim())) throw new Error('E-mail inválido.');
    await BadareDB.rpc('badare_user_update', { p_id:id, p_nome:name, p_email:email, p_role:role, p_senha:password||'' });
    // se editou o próprio usuário, atualiza a sessão em cache
    const cur = currentUser();
    if(cur && cur.id===id) setSession({ id, nome:name, email, role });
    return true;
  }
  async function remove(id){
    if(!isAdmin()) throw new Error('Apenas administradores podem excluir usuários.');
    const cur = currentUser();
    if(cur && cur.id===id) throw new Error('Você não pode excluir o usuário em uso.');
    await BadareDB.rpc('badare_user_delete', { p_id:id });
    return true;
  }

  // ---- tela de login ----
  function flowerSvg(){
    const m = document.querySelector('.brand-mark');
    return m ? `<svg viewBox="0 0 500 500" fill="none">${m.innerHTML}</svg>` : '';
  }
  function showLogin(onSuccess){
    const scr = document.getElementById('loginScreen');
    const form = document.getElementById('loginForm');
    const err = document.getElementById('loginErr');
    const logo = document.getElementById('loginLogo');
    const hint = document.getElementById('loginHint');
    if(logo && !logo.innerHTML) logo.innerHTML = flowerSvg();
    if(hint) hint.innerHTML = 'Acesso pela nuvem (Supabase). Esqueceu a senha? Peça a um administrador para redefinir em <b>Usuários</b>.';
    scr.classList.add('show');
    form.onsubmit = async (e)=>{
      e.preventDefault();
      err.classList.remove('show');
      const btn = form.querySelector('button[type="submit"]');
      const email = document.getElementById('lg_email').value;
      const pw = document.getElementById('lg_pass').value;
      if(btn){ btn.disabled=true; btn.style.opacity='.6'; }
      try{
        await login(email, pw);
        scr.classList.remove('show');
        document.getElementById('lg_pass').value='';
        if(onSuccess) onSuccess();
      }catch(ex){
        err.textContent = ex.message || 'Falha ao entrar.';
        err.classList.add('show');
      }finally{
        if(btn){ btn.disabled=false; btn.style.opacity='1'; }
      }
    };
    setTimeout(()=>{ const f=document.getElementById('lg_email'); if(f) f.focus(); }, 60);
  }

  window.BadareAuth = {
    currentUser, isAdmin, login, logout,
    list, create, update, remove, showLogin
  };
})();
