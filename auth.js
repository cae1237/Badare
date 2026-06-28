/* ============================================================
   Badare CRM — auth.js
   Camada de autenticação e gestão de usuários.

   • Senhas NUNCA são guardadas em texto puro: armazenamos apenas
     o hash SHA-256 (Web Crypto) combinado com um "salt" aleatório
     por usuário.
   • Perfis: "admin" (acesso total, gerencia usuários) e
     "operacional" (uso do dia a dia, sem gestão de usuários).
   • Modo local: usuários ficam no navegador (localStorage).
     Para multiusuário real/seguro entre dispositivos, use o
     Supabase Auth (ver supabase/ e config.js).
   ============================================================ */
(function(){
  'use strict';

  const UKEY = 'badare_users';
  const SKEY = 'badare_session';

  // ---- util ----
  const enc = new TextEncoder();
  function genSalt(){
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return [...a].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function hash(pw, salt){
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(salt + '::' + pw));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  const norm = e => String(e||'').trim().toLowerCase();
  const readUsers  = () => { try{ return JSON.parse(localStorage.getItem(UKEY)) || []; }catch(e){ return []; } };
  const writeUsers = (u) => localStorage.setItem(UKEY, JSON.stringify(u));
  const uid = () => 'u'+Date.now()+Math.floor(Math.random()*1000);

  // ---- seed do admin inicial (apenas na 1ª execução) ----
  async function ensureSeed(){
    let users = readUsers();
    if(users.length) return;
    const salt = genSalt();
    users = [{
      id: uid(),
      name: 'Administrador',
      email: 'admin@badare.com',
      role: 'admin',
      active: true,
      salt,
      hash: await hash('Badare@2026', salt),
      createdAt: new Date().toISOString()
    }];
    writeUsers(users);
  }

  // ---- sessão ----
  function session(){ try{ return JSON.parse(localStorage.getItem(SKEY)); }catch(e){ return null; } }
  function currentUser(){
    const s = session(); if(!s) return null;
    const u = readUsers().find(x=>x.id===s.id && x.active!==false);
    if(!u) return null;
    return { id:u.id, name:u.name, email:u.email, role:u.role };
  }
  function isAdmin(){ const u = currentUser(); return !!u && u.role==='admin'; }
  function logout(){ localStorage.removeItem(SKEY); }

  async function login(email, pw){
    email = norm(email);
    const u = readUsers().find(x=>norm(x.email)===email);
    if(!u || u.active===false) throw new Error('Usuário não encontrado ou inativo.');
    const h = await hash(pw, u.salt);
    if(h !== u.hash) throw new Error('E-mail ou senha incorretos.');
    localStorage.setItem(SKEY, JSON.stringify({ id:u.id, ts:Date.now() }));
    return currentUser();
  }

  // ---- CRUD (somente admin para criar/editar/excluir) ----
  function list(){
    return readUsers().map(u=>({ id:u.id, name:u.name, email:u.email, role:u.role, active:u.active!==false, createdAt:u.createdAt }));
  }
  async function create({ name, email, password, role }){
    if(!isAdmin()) throw new Error('Apenas administradores podem criar usuários.');
    name = String(name||'').trim(); email = norm(email); role = role==='admin'?'admin':'operacional';
    if(!name || !email || !password) throw new Error('Preencha nome, e-mail e senha.');
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if(String(password).length < 6) throw new Error('A senha deve ter ao menos 6 caracteres.');
    const users = readUsers();
    if(users.some(u=>norm(u.email)===email)) throw new Error('Já existe um usuário com esse e-mail.');
    const salt = genSalt();
    users.push({ id:uid(), name, email, role, active:true, salt, hash:await hash(password,salt), createdAt:new Date().toISOString() });
    writeUsers(users);
    return true;
  }
  async function update(id, { name, email, role, password }){
    if(!isAdmin()) throw new Error('Apenas administradores podem editar usuários.');
    const users = readUsers();
    const u = users.find(x=>x.id===id);
    if(!u) throw new Error('Usuário não encontrado.');
    if(name!=null) u.name = String(name).trim();
    if(email!=null){
      const e = norm(email);
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-mail inválido.');
      if(users.some(x=>x.id!==id && norm(x.email)===e)) throw new Error('Já existe um usuário com esse e-mail.');
      u.email = e;
    }
    if(role!=null) u.role = role==='admin'?'admin':'operacional';
    if(password){
      if(String(password).length < 6) throw new Error('A senha deve ter ao menos 6 caracteres.');
      u.salt = genSalt(); u.hash = await hash(password, u.salt);
    }
    writeUsers(users);
    return true;
  }
  function remove(id){
    if(!isAdmin()) throw new Error('Apenas administradores podem excluir usuários.');
    const cur = currentUser();
    if(cur && cur.id===id) throw new Error('Você não pode excluir o usuário em uso.');
    let users = readUsers();
    const target = users.find(u=>u.id===id);
    if(target && target.role==='admin' && users.filter(u=>u.role==='admin').length<=1)
      throw new Error('Não é possível excluir o único administrador.');
    users = users.filter(u=>u.id!==id);
    writeUsers(users);
    return true;
  }

  // ---- controlador da tela de login ----
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
    // dica de primeiro acesso somente enquanto existir apenas o admin padrão
    const users = readUsers();
    if(hint){
      hint.innerHTML = (users.length===1 && norm(users[0].email)==='admin@badare.com')
        ? 'Primeiro acesso — Admin padrão:<br><b>admin@badare.com</b> &nbsp;/&nbsp; <b>Badare@2026</b><br>Altere a senha em <b>Usuários</b> após entrar.'
        : '';
    }
    scr.classList.add('show');
    form.onsubmit = async (e)=>{
      e.preventDefault();
      err.classList.remove('show');
      const email = document.getElementById('lg_email').value;
      const pw = document.getElementById('lg_pass').value;
      try{
        await login(email, pw);
        scr.classList.remove('show');
        document.getElementById('lg_pass').value='';
        if(onSuccess) onSuccess();
      }catch(ex){
        err.textContent = ex.message || 'Falha ao entrar.';
        err.classList.add('show');
      }
    };
    setTimeout(()=>{ const f=document.getElementById('lg_email'); if(f) f.focus(); }, 60);
  }

  window.BadareAuth = {
    ensureSeed, currentUser, isAdmin, login, logout,
    list, create, update, remove, showLogin
  };
})();
