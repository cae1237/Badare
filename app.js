/* ============================================================
   Badaré CRM — app.js
   App de página única (SPA) com roteamento por hash,
   inteligência de retornos/follow-up e alertas visuais.
   ============================================================ */
'use strict';

// Dados carregados de forma assíncrona pela camada BadareDB (local ou Supabase).
let ATEND = [];
let ENTREGAS = [];
const DBMETA = (window.BADARE_DATA && window.BADARE_DATA.meta) || {};

/* ---------- persistência local (ações do usuário) ---------- */
const LS_KEY = 'badare_crm_state_v1';
const store = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
store.contatados = store.contatados || {};   // id -> true
store.stage = store.stage || {};             // cliente -> estágio do kanban
store.refDate = store.refDate || maxDate();   // data de referência (simulação)
function persist(){ localStorage.setItem(LS_KEY, JSON.stringify(store)); }

function maxDate(){
  let m = '2026-01-01';
  ATEND.forEach(a=>{ if(a.data>m) m=a.data; });
  // referência um pouco à frente do último registro para popular "atrasados/hoje/próximos"
  const d = new Date(m+'T00:00:00'); d.setDate(d.getDate()-10);
  return d.toISOString().slice(0,10);
}

/* ---------- helpers ---------- */
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtN = n => Number(n).toLocaleString('pt-BR');
const fmtBR = n => 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:0});
const fmtDate = iso => iso ? new Date(iso+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—';
const fmtDateFull = iso => iso ? new Date(iso+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const initials = s => (s||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const daysBetween = (a,b) => Math.round((new Date(a+'T00:00:00')-new Date(b+'T00:00:00'))/864e5);
const cap = s => s? s.charAt(0).toUpperCase()+s.slice(1):s;
const avatarColor = s => { let h=0; for(const c of (s||'')) h=c.charCodeAt(0)+((h<<5)-h); const hue=Math.abs(h)%360; return `linear-gradient(135deg,hsl(${hue} 70% 62%),hsl(${(hue+40)%360} 70% 58%))`; };

function countBy(arr, key){
  const m = new Map();
  arr.forEach(o=>{ const k=(typeof key==='function'?key(o):o[key]); if(!k) return; m.set(k,(m.get(k)||0)+1); });
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}

/* ---------- INTELIGÊNCIA DE RETORNO ---------- */
// classifica um atendimento com retorno agendado relativo à data de referência
function returnStatus(a){
  if(!a.retornar) return null;
  if(store.contatados[a.id]) return {cls:'done',label:'Contatado',kind:'done',diff:0};
  const diff = daysBetween(a.retornar, store.refDate); // <0 atrasado
  if(diff < 0)  return {cls:'late', label:`${Math.abs(diff)}d em atraso`, kind:'late', diff};
  if(diff===0)  return {cls:'today',label:'Retornar hoje', kind:'today', diff};
  if(diff<=3)   return {cls:'soon', label:`Em ${diff} dia(s)`, kind:'soon', diff};
  if(diff<=7)   return {cls:'soon', label:`Em ${diff} dias`, kind:'week', diff};
  return {cls:'', label:fmtDate(a.retornar), kind:'future', diff};
}
// lista de retornos relevantes (atraso/hoje/próx 7d) ordenada por urgência
function activeReturns(){
  return ATEND
    .filter(a=>a.retornar)
    .map(a=>({a, st:returnStatus(a)}))
    .filter(x=>x.st && ['late','today','soon'].includes(x.st.cls) && x.st.kind!=='done' && ['late','today','soon','week'].includes(x.st.kind))
    .filter(x=>!store.contatados[x.a.id])
    .sort((p,q)=>p.st.diff-q.st.diff);
}
function pendingNegotiations(){
  return ATEND.filter(a=>a.conversao==='Em negociação' && !store.contatados['neg_'+a.id]);
}
function alertCount(){ return activeReturns().filter(x=>['late','today'].includes(x.st.cls)).length; }

/* ---------- conversão / pílulas ---------- */
function convPill(c){
  if(c==='Convertido') return '<span class="pill ok"><span class="pdot"></span>Convertido</span>';
  if(c==='Em negociação') return '<span class="pill mid"><span class="pdot"></span>Negociação</span>';
  if(c==='Não convertido') return '<span class="pill neg"><span class="pdot"></span>Não conv.</span>';
  return '<span class="pill gray">—</span>';
}
function statusPill(s){
  if(s==='Novo') return '<span class="pill info">Novo</span>';
  if(s==='Recorrente') return '<span class="pill purple">Recorrente</span>';
  return `<span class="pill gray">${esc(s||'—')}</span>`;
}

/* ============================================================
   NAVEGAÇÃO
   ============================================================ */
const ROUTES = [
  {grp:'Visão Geral'},
  {id:'dashboard', label:'Dashboard', sub:'Visão geral da operação', icon:'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'},
  {id:'atendimentos', label:'Atendimentos', sub:'Todos os registros da base', icon:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'},
  {id:'clientes', label:'Clientes', sub:'Base consolidada de clientes', icon:'C'},
  {id:'retornos', label:'Central de Retornos', sub:'Follow-ups e contatos a realizar', icon:'B', badge:true},
  {id:'conversoes', label:'Conversões', sub:'Funil e oportunidades', icon:'M16 3h5v5M21 3l-7 7'},
  {grp:'Operação'},
  {id:'novo', label:'Novo Atendimento', sub:'Cadastrar atendimento (substitui a planilha)', icon:'M12 5v14M5 12h14'},
  {id:'entregas', label:'Entregas', sub:'Controle logístico e taxas', icon:'T'},
  {id:'produtos', label:'Produtos', sub:'Ranking e categorias', icon:'M20 7h-9M14 17H5'},
  {id:'relatorios', label:'Relatórios', sub:'Análises detalhadas', icon:'M12 20V10M18 20V4M6 20v-4'},
  {id:'config', label:'Configurações', sub:'Parâmetros e regras', icon:'G'},
];
const ICONS = {
  C:'<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  B:'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  T:'<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  G:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};
function iconSvg(icon){
  const inner = ICONS[icon] || `<path d="${icon}"/>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${inner}</svg>`;
}
function buildNav(){
  const cur = currentRoute();
  $('#nav').innerHTML = ROUTES.map(r=>{
    if(r.grp) return `<div class="nav-label">${r.grp}</div>`;
    const badge = r.badge && alertCount()>0 ? `<span class="badge">${alertCount()}</span>` : '';
    return `<a class="nav-item ${r.id===cur?'active':''}" href="#${r.id}">${iconSvg(r.icon)}<span>${r.label}</span>${badge}</a>`;
  }).join('');
}

/* ============================================================
   TOAST / DRAWER
   ============================================================ */
function toast(msg){
  const t = document.createElement('div');
  t.className='toast';
  t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(40px)';setTimeout(()=>t.remove(),300);},2600);
}
function openDrawer(html){
  $('#drawer').innerHTML = html;
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden','false');
  $('#drawerOverlay').classList.add('open');
}
function closeDrawer(){
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden','true');
  $('#drawerOverlay').classList.remove('open');
}
$('#drawerOverlay').addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){closeDrawer();closeSidebar();$('#notifPanel').classList.remove('open');} });

/* ---------- menu lateral (mobile) ---------- */
function openSidebar(){ $('#sidebar').classList.add('open'); $('#navOverlay').classList.add('open'); }
function closeSidebar(){ $('#sidebar').classList.remove('open'); $('#navOverlay').classList.remove('open'); }
$('#menuBtn').addEventListener('click',openSidebar);
$('#navOverlay').addEventListener('click',closeSidebar);

function clientDrawer(id){
  const a = ATEND.find(x=>x.id===id); if(!a) return;
  const st = returnStatus(a);
  const fields = [
    ['Data do atendimento', fmtDateFull(a.data)],
    ['Cliente', a.cliente],
    ['Cuidador', a.cuidador||'—'],
    ['Tipo', a.tipo],
    ['Status', a.status],
    ['Categoria', a.categoria],
    ['Produto', a.produto],
    ['Prescritor', a.prescritor||'—'],
    ['Localidade', a.localidade||'—'],
    ['Canal', a.canal],
    ['Atendente', a.atendente||'—'],
    ['Compra', a.compra?'Sim':'Não'],
    ['Pagamento', a.pagamento||'—'],
    ['Entrega', a.entrega||'—'],
    ['Taxa do cliente', a.taxaCliente?fmtBR(a.taxaCliente):'—'],
    ['Retornar em', a.retornar?fmtDateFull(a.retornar):(a.retornarTxt||'Sem retorno')],
    ['Conversão', a.conversao||'—'],
  ];
  const done = store.contatados[a.id];
  openDrawer(`
    <div class="drawer-head">
      <div>
        <h3>${esc(a.cliente)}</h3>
        <p>${esc(a.categoria)} · ${esc(a.produto)}</p>
        <div class="tag-row">${statusPill(a.status)} ${convPill(a.conversao)} ${st?`<span class="pill ${st.cls==='late'?'neg':st.cls==='today'?'mid':'info'}">${st.label}</span>`:''}</div>
      </div>
      <button class="iconbtn" onclick="closeDrawer()" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="drawer-body">
      ${fields.map(f=>`<div class="dfield"><span class="k">${f[0]}</span><span class="v">${esc(f[1])}</span></div>`).join('')}
      ${a.obs?`<div style="margin-top:16px"><div class="k" style="color:var(--text-muted);font-size:12px;margin-bottom:6px">Observação</div><div style="font-size:13.5px;line-height:1.5">${esc(a.obs)}</div></div>`:''}
    </div>
    <div class="drawer-foot">
      <button class="btn primary" style="flex:1" onclick="markContacted(${a.id})">${done?'✓ Contatado':'Marcar como contatado'}</button>
      <button class="btn" onclick="simWhats('${esc(a.cliente)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>WhatsApp</button>
    </div>
  `);
}
function markContacted(id){
  store.contatados[id]=!store.contatados[id]; persist();
  toast(store.contatados[id]?'Contato registrado com sucesso':'Marcação removida');
  buildNav(); updateNotif(); render();
  if($('#drawer').classList.contains('open')) clientDrawer(id);
}
function simWhats(name){ toast('Abrindo conversa com '+name+'…'); }
window.closeDrawer=closeDrawer; window.markContacted=markContacted; window.simWhats=simWhats; window.clientDrawer=clientDrawer;

/* ============================================================
   NOTIFICAÇÕES
   ============================================================ */
function updateNotif(){
  const n = alertCount();
  const el = $('#notifCount');
  if(n>0){ el.hidden=false; el.textContent=n>9?'9+':n; } else el.hidden=true;
}
function renderNotifPanel(){
  const items = activeReturns().slice(0,6);
  const neg = pendingNegotiations().length;
  $('#notifPanel').innerHTML = `
    <div class="nhead"><b>Notificações</b><a href="#retornos" class="btn sm ghost" onclick="$('#notifPanel').classList.remove('open')">Ver todas</a></div>
    ${items.length?items.map(({a,st})=>`
      <div class="notif-item" onclick="location.hash='#retornos';$('#notifPanel').classList.remove('open')">
        <span class="nd" style="background:${st.cls==='late'?'var(--danger)':st.cls==='today'?'var(--warn)':'var(--accent-2)'}"></span>
        <div><h5>${esc(a.cliente)}</h5><small>${st.label} · ${esc(a.produto)}</small></div>
      </div>`).join('') : '<div style="padding:18px;text-align:center;color:var(--text-dim);font-size:13px">Nenhum retorno pendente 🎉</div>'}
    ${neg?`<div class="notif-item" onclick="location.hash='#conversoes';$('#notifPanel').classList.remove('open')"><span class="nd" style="background:var(--accent-3)"></span><div><h5>${neg} negociações abertas</h5><small>Oportunidades para acompanhar</small></div></div>`:''}
  `;
}
$('#notifBtn').addEventListener('click',e=>{ e.stopPropagation(); renderNotifPanel(); $('#notifPanel').classList.toggle('open'); });
document.addEventListener('click',e=>{ if(!e.target.closest('.notif-wrap')) $('#notifPanel').classList.remove('open'); });

/* ============================================================
   COMPONENTES REUTILIZÁVEIS
   ============================================================ */
function kpi(ico,val,label,trend){
  const t = trend ? `<span class="trend ${trend.dir}">${trend.dir==='up'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 17 17 7M17 7H8M17 7v9"/></svg>':trend.dir==='down'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 7 17 17M17 17V8M17 17H8"/></svg>':''}${trend.val}</span>` : '';
  return `<div class="kpi"><div class="kpi-top"><div class="kpi-ico ${ico.cls}">${iconSvg(ico.path)}</div>${t}</div><div class="kpi-val">${val}</div><div class="kpi-label">${label}</div></div>`;
}
function barlist(data, total, grad){
  total = total || data.reduce((s,d)=>s+d[1],0);
  return `<div class="barlist">${data.map(([k,v])=>{
    const pct=total?(v/total*100):0;
    return `<div class="barrow"><div class="barrow-top"><b>${esc(k)}</b><span>${fmtN(v)} · ${pct.toFixed(0)}%</span></div><div class="track"><div class="fill" data-w="${pct}" style="background:${grad}"></div></div></div>`;
  }).join('')}</div>`;
}
function animateBars(){ setTimeout(()=>$$('.fill').forEach(f=>{ if(f.dataset.w) f.style.width=f.dataset.w+'%'; }),120); }

/* ============================================================
   CHARTS
   ============================================================ */
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const C = ()=>({acc:css('--accent'),acc2:css('--accent-2'),acc3:css('--accent-3'),warn:css('--warn'),danger:css('--danger'),text:css('--text-muted'),grid:'rgba(255,255,255,0.05)'});
Chart.defaults.font.family="'DM Sans',sans-serif"; Chart.defaults.font.size=12; Chart.defaults.color=C().text;
if(window.ChartDataLabels){ Chart.register(ChartDataLabels); Chart.defaults.set('plugins.datalabels',{display:false}); }
const legendCfg=(show=true)=>({display:show,position:'bottom',labels:{boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:14,font:{size:11.5},color:css('--text-muted')}});
// rótulos de valor
const dlBar=(horizontal)=>({display:true,anchor:'end',align:horizontal?'right':'end',offset:2,color:css('--text'),font:{family:"'Space Grotesk'",size:11,weight:'600'},formatter:v=>v?fmtN(v):''});
const dlLine=()=>({display:true,align:'top',offset:4,color:css('--text'),backgroundColor:'rgba(10,14,19,.7)',borderRadius:4,padding:{top:2,bottom:2,left:5,right:5},font:{family:"'Space Grotesk'",size:10.5,weight:'600'},formatter:v=>v});
const dlDonut=(data)=>({display:c=>{const v=c.dataset.data[c.dataIndex];const t=c.dataset.data.reduce((s,x)=>s+x,0);return v/t>0.05;},color:'#06121a',font:{family:"'Space Grotesk'",size:12,weight:'700'},formatter:(v,c)=>{const t=c.dataset.data.reduce((s,x)=>s+x,0);return Math.round(v/t*100)+'%';}});
const dlStack=()=>({display:c=>c.dataset.data[c.dataIndex]>0,color:'#06121a',font:{family:"'Space Grotesk'",size:10.5,weight:'700'},formatter:v=>v});
let CHARTS=[];
function destroyCharts(){ CHARTS.forEach(c=>{try{c.destroy()}catch(e){}}); CHARTS=[]; }
function reg(c){ CHARTS.push(c); return c; }
function tt(money){return{backgroundColor:'#0a0e13',borderColor:'rgba(255,255,255,.1)',borderWidth:1,padding:12,cornerRadius:10,titleColor:'#eef2f6',bodyColor:'rgba(238,242,246,.7)',titleFont:{family:"'Space Grotesk'",weight:'600'},boxPadding:5,callbacks:money?{label:c=>' '+(c.dataset.label||'')+': '+(c.dataset.yAxisID==='y1'?fmtBR(c.parsed.y):c.parsed.y)}:{}};}
function gradV(ctx,c1,c2){const g=ctx.createLinearGradient(0,0,0,300);g.addColorStop(0,c1);g.addColorStop(1,c2);return g;}
function shade(i,n){const t=n>1?i/(n-1):0;const a=[46,230,166],b=[56,189,248];return`rgb(${a.map((v,k)=>Math.round(v+(b[k]-v)*t)).join(',')})`;}
const baseGrid=()=>({grid:{color:C().grid,drawTicks:false},border:{display:false},ticks:{padding:8}});
const donutOpts=cut=>({responsive:true,maintainAspectRatio:false,cutout:cut+'%',animation:{animateRotate:true,duration:1100,easing:'easeOutQuart'},plugins:{legend:legendCfg(true),tooltip:tt(),datalabels:{display:false}}});

function lineMonths(canvas, dsA, dsB){
  const ctx=canvas.getContext('2d'); const c=C();
  return reg(new Chart(ctx,{type:'line',data:{labels:['Jan','Fev','Mar','Abr'],datasets:[
    {label:'Atendimentos',data:dsA,borderColor:c.acc,backgroundColor:gradV(ctx,'rgba(46,230,166,.28)','rgba(46,230,166,0)'),fill:true,tension:.4,borderWidth:2.5,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:c.acc,pointBorderColor:'#0a0e13',pointBorderWidth:2,datalabels:{...dlLine(),align:'top'}},
    {label:'Compras',data:dsB,borderColor:c.acc2,backgroundColor:gradV(ctx,'rgba(56,189,248,.18)','rgba(56,189,248,0)'),fill:true,tension:.4,borderWidth:2.5,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:c.acc2,pointBorderColor:'#0a0e13',pointBorderWidth:2,datalabels:{...dlLine(),align:'bottom'}}
  ]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:18}},animation:{duration:1200,easing:'easeOutQuart'},interaction:{mode:'index',intersect:false},plugins:{legend:legendCfg(true),tooltip:tt()},scales:{x:{grid:{display:false},border:{display:false}},y:{...baseGrid(),beginAtZero:true,grace:'12%'}}}}));
}
function donut(canvas,labels,data,colors,cut=70,showLegend=true){
  const o=donutOpts(cut);
  return reg(new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0,hoverOffset:8,spacing:2}]},options:{...o,plugins:{...o.plugins,legend:legendCfg(showLegend),datalabels:dlDonut(data)}}}));
}
function hbar(canvas,labels,data,grad,seriesLabel){
  const ctx=canvas.getContext('2d');
  const bg = grad || labels.map((_,i)=>shade(i,labels.length));
  return reg(new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:seriesLabel||'Total',data,backgroundColor:bg,borderRadius:6,borderSkipped:false,barThickness:15,datalabels:dlBar(true)}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,layout:{padding:{right:30}},animation:{duration:1100,easing:'easeOutQuart'},plugins:{legend:legendCfg(!!seriesLabel),tooltip:tt()},scales:{x:{...baseGrid(),beginAtZero:true,grace:'8%'},y:{grid:{display:false},border:{display:false},ticks:{font:{size:11.5}}}}}}));
}

/* ============================================================
   MÉTRICAS AGREGADAS
   ============================================================ */
const ORD=['Janeiro','Fevereiro','Março','Abril'];
function monthSeries(field){ return ORD.map(m=>ATEND.filter(a=>a.mes===m && (field?field(a):true)).length); }
let M = {};
function recompute(){
  M = {
    total: ATEND.length,
    compras: ATEND.filter(a=>a.compra).length,
    novos: ATEND.filter(a=>a.status==='Novo').length,
    recorrentes: ATEND.filter(a=>a.status==='Recorrente').length,
    convertidos: ATEND.filter(a=>a.conversao==='Convertido').length,
    negociacao: ATEND.filter(a=>a.conversao==='Em negociação').length,
    naoConv: ATEND.filter(a=>a.conversao==='Não convertido').length,
    entregas: ENTREGAS.length,
    receita: ENTREGAS.reduce((s,e)=>s+(+e.valor||0),0),
    atendMes: monthSeries(),
    compraMes: monthSeries(a=>a.compra),
  };
  M.convRate = M.total ? ((M.compras/M.total)*100) : 0;
}

/* ---------- INTELIGÊNCIA DE DECISÃO ---------- */
function lostReasons(){
  const buckets={'Preço / valor':0,'Disponibilidade / estoque':0,'Mudança de prescrição':0,'Sem retorno do cliente':0,'Outros':0};
  ATEND.filter(a=>a.conversao==='Não convertido').forEach(a=>{
    const o=(a.obs||'').toLowerCase();
    if(/(preç|valor|caro|barat|custo|orçament)/.test(o)) buckets['Preço / valor']++;
    else if(/(disponib|estoque|indispon|falta|ruptura)/.test(o)) buckets['Disponibilidade / estoque']++;
    else if(/(prescri|médic|fim de trat|alta|troca|substitu)/.test(o)) buckets['Mudança de prescrição']++;
    else if(/(sem retorno|não respond|não retornou|sumiu)/.test(o)) buckets['Sem retorno do cliente']++;
    else buckets['Outros']++;
  });
  return Object.entries(buckets).filter(e=>e[1]>0).sort((a,b)=>b[1]-a[1]);
}
function catConversion(){
  return [...new Set(ATEND.map(a=>a.categoria))].filter(Boolean).map(c=>{
    const sub=ATEND.filter(a=>a.categoria===c);
    const won=sub.filter(a=>a.compra).length;
    return {cat:c,total:sub.length,won,rate:sub.length?won/sub.length*100:0};
  }).sort((a,b)=>b.total-a.total);
}
function topClients(n=6){
  return clientAgg().slice(0,n);
}
function topPrescritores(n=6){
  return countBy(ATEND.filter(a=>a.prescritor && !['Não Informado','Cnpj','Sem Prescritor'].includes(a.prescritor)),'prescritor').slice(0,n);
}
function buildInsights(){
  const ins=[];
  const canal=countBy(ATEND.filter(a=>a.canal),'canal');
  const whatsPct=canal.length?Math.round(canal[0][1]/ATEND.filter(a=>a.canal).length*100):0;
  const recPct=Math.round(M.recorrentes/(M.novos+M.recorrentes)*100);
  const freq=clientAgg().filter(c=>c.atend>1).length;
  const cc=catConversion();
  const bestCat=[...cc].sort((a,b)=>b.rate-a.rate).filter(c=>c.total>=20)[0];
  const worstCat=[...cc].sort((a,b)=>a.rate-b.rate).filter(c=>c.total>=20)[0];
  const lost=lostReasons();
  const late=activeReturns().filter(x=>x.st.cls==='late').length;
  const locs=countBy(ATEND.filter(a=>a.localidade && a.localidade!=='Não Informado'),'localidade');
  const top3loc=locs.slice(0,3).reduce((s,l)=>s+l[1],0);
  const top3pct=Math.round(top3loc/locs.reduce((s,l)=>s+l[1],0)*100);
  ins.push({tone:'',label:'Conversão geral',big:M.convRate.toFixed(0)+'%',text:`${fmtN(M.compras)} compras em ${fmtN(M.total)} atendimentos.`});
  ins.push({tone:'info',label:'Canal dominante',big:whatsPct+'%',text:`do volume vem por ${canal[0]?canal[0][0]:'—'}. Concentre automações de follow-up aqui.`});
  ins.push({tone:'purple',label:'Base recorrente',big:recPct+'%',text:`${fmtN(M.recorrentes)} atendimentos a clientes que voltam. ${fmtN(freq)} clientes já compraram +1x.`});
  if(bestCat) ins.push({tone:'',label:'Categoria que mais converte',big:bestCat.rate.toFixed(0)+'%',text:`${bestCat.cat} (${bestCat.won}/${bestCat.total}). Priorize estoque e mix.`});
  if(worstCat) ins.push({tone:'warn',label:'Categoria a destravar',big:worstCat.rate.toFixed(0)+'%',text:`${worstCat.cat} converte abaixo da média — revise preço/abordagem.`});
  const topLost=lost.filter(l=>l[0]!=='Outros')[0];
  if(topLost) ins.push({tone:'danger',label:'Maior motivo de perda',big:topLost[1]+'',text:`${topLost[0]} é a principal causa classificável de não conversão.`});
  ins.push({tone:'info',label:'Concentração geográfica',big:top3pct+'%',text:`da demanda está em ${locs.slice(0,3).map(l=>l[0]).join(', ')}. Otimize rotas de entrega.`});
  if(late) ins.push({tone:'danger',label:'Risco operacional',big:fmtN(late),text:`retornos em atraso na fila — receita recorrente em risco. Acione o time.`});
  return ins;
}

/* ============================================================
   VIEWS
   ============================================================ */
const VIEW = {};

/* ---------- DASHBOARD ---------- */
VIEW.dashboard = ()=>{
  const cat = countBy(ATEND,'categoria');
  const ret = activeReturns();
  const retLate = ret.filter(x=>x.st.cls==='late').length;
  const retToday = ret.filter(x=>x.st.cls==='today').length;
  const loc = countBy(ATEND.filter(a=>a.localidade && a.localidade!=='Não Informado'),'localidade').slice(0,8);
  $('#view').innerHTML = `
   <div class="view">
    <section class="kpis">
      ${kpi({cls:'ico-a',path:ROUTES[2].icon},fmtN(M.total),'Atendimentos no período',{dir:'up',val:'+8,2%'})}
      ${kpi({cls:'ico-b',path:'M9 21V9a3 3 0 0 1 6 0v12'},fmtN(M.compras),'Compras realizadas',{dir:'up',val:'+4,1%'})}
      ${kpi({cls:'ico-c',path:'M16 3h5v5M21 3l-7 7'},M.convRate.toFixed(1).replace('.',',')+'%','Taxa de conversão',{dir:'up',val:'+2,6pp'})}
      ${kpi({cls:'ico-d',path:'T'},fmtBR(M.receita),'Receita de taxas · '+M.entregas+' entregas',{dir:'down',val:'-3,4%'})}
    </section>

    <section class="grid">
      <div class="panel col-8" style="animation-delay:.05s">
        <div class="panel-head"><div><h3>Evolução de Atendimentos</h3><p>Atendimentos vs. compras por mês</p></div>
          <div class="legend"><span><i class="dot" style="background:var(--accent)"></i>Atendimentos</span><span><i class="dot" style="background:var(--accent-2)"></i>Compras</span></div></div>
        <div class="chart-wrap h-300"><canvas id="cLine"></canvas></div>
      </div>
      <div class="panel col-4" style="animation-delay:.1s">
        <div class="panel-head"><div><h3>Ações de Hoje</h3><p>${retLate} atrasados · ${retToday} para hoje</p></div></div>
        <div class="stat-strip" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px">
          <div class="mini-stat" style="border-left:3px solid var(--danger)"><b>${retLate}</b><small>Em atraso</small></div>
          <div class="mini-stat" style="border-left:3px solid var(--warn)"><b>${retToday}</b><small>Para hoje</small></div>
        </div>
        <div class="returns-list" style="max-height:200px">
          ${ret.slice(0,5).map(({a,st})=>retCardMini(a,st)).join('') || emptyMini('Sem retornos pendentes')}
        </div>
        <a href="#retornos" class="btn" style="width:100%;justify-content:center;margin-top:14px">Abrir Central de Retornos</a>
      </div>
    </section>

    <section class="grid">
      <div class="panel col-4" style="animation-delay:.15s">
        <div class="panel-head"><div><h3>Funil de Conversão</h3><p>Status das negociações</p></div></div>
        <div class="chart-wrap h-240"><canvas id="cConv"></canvas><div class="donut-center"><b>${M.convRate.toFixed(0)}%</b><small>convertido</small></div></div>
        <div class="legend" style="justify-content:center;margin-top:8px"><span><i class="dot" style="background:var(--accent)"></i>Convertido</span><span><i class="dot" style="background:var(--warn)"></i>Negociação</span><span><i class="dot" style="background:var(--danger)"></i>Não conv.</span></div>
      </div>
      <div class="panel col-4" style="animation-delay:.2s">
        <div class="panel-head"><div><h3>Categorias</h3><p>${fmtN(cat.reduce((s,c)=>s+c[1],0))} itens · mix de produtos</p></div></div>
        <div class="chart-wrap h-240"><canvas id="cCat"></canvas></div>
      </div>
      <div class="panel col-4" style="animation-delay:.25s">
        <div class="panel-head"><div><h3>Top Localidades</h3><p>Distribuição no DF</p></div></div>
        <div class="chart-wrap h-240"><canvas id="cLoc"></canvas></div>
      </div>
    </section>

    <section class="grid">
      <div class="panel col-12" style="animation-delay:.28s">
        <div class="panel-head"><div><h3>Visão Executiva</h3><p>Leituras automáticas para tomada de decisão comercial</p></div></div>
        <div class="insights">${buildInsights().map(i=>`<div class="insight ${i.tone}"><div class="ih">${i.label}</div><b>${i.big}</b><p>${esc(i.text)}</p></div>`).join('')}</div>
      </div>
    </section>

    <section class="grid">
      <div class="panel col-6" style="animation-delay:.3s">
        <div class="panel-head"><div><h3>Contas-Chave</h3><p>Clientes com maior volume de atendimentos</p></div><a href="#clientes" class="btn sm">Ver clientes</a></div>
        <div class="ranklist">${topClients(6).map((c,i)=>`<div class="rankrow" style="cursor:pointer" onclick="clientHistoryDrawer('${esc(c.nome).replace(/'/g,"\\'")}')">
          <span class="rnum">${i+1}</span><span class="rav" style="background:${avatarColor(c.nome)}">${initials(c.nome)}</span>
          <div class="rbody"><h5>${esc(c.nome)}</h5><small>${c.compras} compras · ${esc(c.localidade||'n/d')}</small></div>
          <span class="rval">${c.atend}</span></div>`).join('')}</div>
      </div>
      <div class="panel col-6" style="animation-delay:.34s">
        <div class="panel-head"><div><h3>Fontes de Indicação</h3><p>Prescritores que mais geram demanda</p></div><a href="#relatorios" class="btn sm">Relatórios</a></div>
        <div class="ranklist">${topPrescritores(6).map((p,i)=>`<div class="rankrow">
          <span class="rnum">${i+1}</span><span class="rav" style="background:${avatarColor(p[0])}">${initials(p[0])}</span>
          <div class="rbody"><h5>${esc(p[0])}</h5><small>indicações registradas</small></div>
          <span class="rval">${p[1]}</span></div>`).join('')}</div>
      </div>
    </section>

    <section class="grid">
      <div class="panel col-12" style="animation-delay:.38s">
        <div class="panel-head"><div><h3>Atendimentos Recentes</h3><p>Últimos registros</p></div><a href="#atendimentos" class="btn sm">Ver todos</a></div>
        <div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Categoria</th><th>Produto</th><th>Localidade</th><th>Canal</th><th>Status</th><th>Conversão</th></tr></thead>
        <tbody>${[...ATEND].slice(-8).reverse().map(rowAtend).join('')}</tbody></table></div>
      </div>
    </section>
   </div>`;
  bindRows();
  lineMonths($('#cLine'),M.atendMes,M.compraMes);
  donut($('#cConv'),['Convertido','Negociação','Não conv.'],[M.convertidos,M.negociacao,M.naoConv],[C().acc,C().warn,C().danger],72,false);
  donut($('#cCat'),cat.map(c=>c[0]),cat.map(c=>c[1]),[C().acc,C().acc2,C().acc3,C().warn,'#64748b'],62);
  hbar($('#cLoc'),loc.map(l=>l[0]),loc.map(l=>l[1]));
};
function retCardMini(a,st){
  return `<div class="alert-card ${st.cls}" style="padding:11px 13px" onclick="clientDrawer(${a.id})">
    <div class="alert-body"><h4 style="font-size:13px">${esc(a.cliente)}</h4><p style="font-size:11.5px">${st.label} · ${esc(a.produto)}</p></div>
  </div>`;
}
function emptyMini(t){ return `<div style="text-align:center;color:var(--text-dim);font-size:13px;padding:24px 10px">${t} 🎉</div>`; }

/* ---------- linha de atendimento (tabela) ---------- */
function rowAtend(a){
  return `<tr data-id="${a.id}">
    <td class="cell-strong">${esc(a.cliente)}</td>
    <td class="muted">${esc(a.categoria)}</td>
    <td>${esc(a.produto)}</td>
    <td class="muted">${esc(a.localidade||'—')}</td>
    <td class="muted">${esc(a.canal)}</td>
    <td>${statusPill(a.status)}</td>
    <td>${convPill(a.conversao)}</td>
  </tr>`;
}
function bindRows(){ $$('tbody tr[data-id]').forEach(tr=>tr.addEventListener('click',()=>clientDrawer(+tr.dataset.id))); }

/* ---------- ATENDIMENTOS (tabela completa) ---------- */
const atState={page:1,per:12,mes:'',cat:'',status:'',conv:'',sort:'data',dir:-1,q:''};
VIEW.atendimentos = ()=>{
  const opts=(arr,sel)=>['<option value="">Todos</option>'].concat([...new Set(arr)].filter(Boolean).sort().map(v=>`<option ${v===sel?'selected':''}>${esc(v)}</option>`)).join('');
  $('#view').innerHTML=`
   <div class="view">
    <div class="filters">
      <select class="sel" id="fMes">${['<option value="">Mês: todos</option>'].concat(ORD.map(m=>`<option ${m===atState.mes?'selected':''}>${m}</option>`)).join('')}</select>
      <select class="sel" id="fCat">${optsLabeled('Categoria',[...new Set(ATEND.map(a=>a.categoria))],atState.cat)}</select>
      <select class="sel" id="fStatus">${optsLabeled('Status',['Novo','Recorrente'],atState.status)}</select>
      <select class="sel" id="fConv">${optsLabeled('Conversão',['Convertido','Em negociação','Não convertido'],atState.conv)}</select>
      <button class="btn ghost sm" id="fClear">Limpar filtros</button>
      <div style="margin-left:auto;font-size:13px;color:var(--text-muted)" id="atCount"></div>
    </div>
    <div class="panel col-12">
      <div class="tbl-wrap"><table>
        <thead><tr>
          ${th('data','Data')}${th('cliente','Cliente')}<th>Categoria</th><th>Produto</th><th>Localidade</th><th>Canal</th>${th('status','Status')}<th>Conversão</th><th>Retorno</th>
        </tr></thead>
        <tbody id="atBody"></tbody>
      </table></div>
      <div class="pager"><div class="info" id="atInfo"></div><div class="pages" id="atPages"></div></div>
    </div>
   </div>`;
  ['fMes','fCat','fStatus','fConv'].forEach((id,i)=>{
    $('#'+id).addEventListener('change',e=>{ atState[['mes','cat','status','conv'][i]]=e.target.value; atState.page=1; renderAtTable(); });
  });
  $('#fClear').addEventListener('click',()=>{ Object.assign(atState,{mes:'',cat:'',status:'',conv:'',q:'',page:1}); $('#globalSearch').value=''; VIEW.atendimentos(); });
  $$('th.sortable').forEach(t=>t.addEventListener('click',()=>{ const k=t.dataset.k; if(atState.sort===k)atState.dir*=-1;else{atState.sort=k;atState.dir=1;} renderAtTable(); }));
  renderAtTable();
};
function optsLabeled(label,arr,sel){ return [`<option value="">${label}: todos</option>`].concat([...new Set(arr)].filter(Boolean).sort().map(v=>`<option ${v===sel?'selected':''}>${esc(v)}</option>`)).join(''); }
function th(k,label){ const act=atState.sort===k; return `<th class="sortable" data-k="${k}">${label}${act?(atState.dir>0?' ▲':' ▼'):''}</th>`; }
function filteredAtend(){
  let r=ATEND.filter(a=>
    (!atState.mes||a.mes===atState.mes)&&
    (!atState.cat||a.categoria===atState.cat)&&
    (!atState.status||a.status===atState.status)&&
    (!atState.conv||a.conversao===atState.conv)&&
    (!atState.q || (a.cliente+' '+a.produto+' '+a.localidade).toLowerCase().includes(atState.q))
  );
  const k=atState.sort;
  r.sort((a,b)=>{ let x=a[k],y=b[k]; if(x<y)return -1*atState.dir; if(x>y)return 1*atState.dir; return 0; });
  return r;
}
function renderAtTable(){
  const all=filteredAtend(); const tot=all.length;
  const pages=Math.max(1,Math.ceil(tot/atState.per));
  if(atState.page>pages)atState.page=pages;
  const start=(atState.page-1)*atState.per;
  const slice=all.slice(start,start+atState.per);
  $('#atBody').innerHTML = slice.length?slice.map(a=>`<tr data-id="${a.id}">
    <td class="muted">${fmtDate(a.data)}</td>
    <td class="cell-strong">${esc(a.cliente)}</td>
    <td class="muted">${esc(a.categoria)}</td>
    <td>${esc(a.produto)}</td>
    <td class="muted">${esc(a.localidade||'—')}</td>
    <td class="muted">${esc(a.canal)}</td>
    <td>${statusPill(a.status)}</td>
    <td>${convPill(a.conversao)}</td>
    <td class="muted">${a.retornar?fmtDate(a.retornar):'—'}</td>
  </tr>`).join('') : `<tr><td colspan="9"><div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><div>Nenhum atendimento encontrado</div></div></td></tr>`;
  $('#atInfo').textContent=`Mostrando ${tot?start+1:0}–${Math.min(start+atState.per,tot)} de ${fmtN(tot)} atendimentos`;
  if($('#atCount'))$('#atCount').textContent=`${fmtN(tot)} resultado(s)`;
  $('#atPages').innerHTML=pagerBtns(atState.page,pages);
  $$('#atPages button[data-p]').forEach(b=>b.addEventListener('click',()=>{atState.page=+b.dataset.p;renderAtTable();}));
  bindRows();
}
function pagerBtns(cur,pages){
  let html=`<button ${cur===1?'disabled':''} data-p="${cur-1}">‹</button>`;
  const arr=new Set([1,pages,cur,cur-1,cur+1]); let prev=0;
  [...arr].filter(p=>p>=1&&p<=pages).sort((a,b)=>a-b).forEach(p=>{ if(p-prev>1)html+='<button disabled>…</button>'; html+=`<button class="${p===cur?'active':''}" data-p="${p}">${p}</button>`; prev=p; });
  html+=`<button ${cur===pages?'disabled':''} data-p="${cur+1}">›</button>`;
  return html;
}

/* ---------- CLIENTES ---------- */
function clientAgg(){
  const m=new Map();
  ATEND.forEach(a=>{
    if(!m.has(a.cliente)) m.set(a.cliente,{nome:a.cliente,atend:0,compras:0,ultima:'',proxRet:null,status:a.status,localidade:a.localidade,categorias:new Set(),conv:0});
    const c=m.get(a.cliente);
    c.atend++; if(a.compra)c.compras++; if(a.conversao==='Convertido')c.conv++;
    if(a.data>c.ultima)c.ultima=a.data;
    if(a.status==='Recorrente')c.status='Recorrente';
    if(a.localidade && a.localidade!=='Não Informado')c.localidade=a.localidade;
    if(a.categoria)c.categorias.add(a.categoria);
    if(a.retornar && (!c.proxRet || a.retornar>c.proxRet))c.proxRet=a.retornar;
  });
  return [...m.values()].sort((a,b)=>b.atend-a.atend);
}
const clState={q:'',filter:'all',page:1,per:12};
VIEW.clientes = ()=>{
  let list=clientAgg();
  const tot=list.length, recorr=list.filter(c=>c.status==='Recorrente').length;
  const comRet=list.filter(c=>c.proxRet).length;
  $('#view').innerHTML=`
   <div class="view">
    <section class="kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpi({cls:'ico-a',path:'C'},fmtN(tot),'Clientes únicos')}
      ${kpi({cls:'ico-c',path:'C'},fmtN(recorr),'Clientes recorrentes')}
      ${kpi({cls:'ico-b',path:ROUTES[2].icon},fmtN(ATEND.length),'Total de interações')}
      ${kpi({cls:'ico-d',path:'B'},fmtN(comRet),'Com retorno agendado')}
    </section>
    <div class="filters" style="margin-top:18px">
      <div class="segment" id="clSeg">
        <button data-f="all" class="${clState.filter==='all'?'active':''}">Todos</button>
        <button data-f="Recorrente" class="${clState.filter==='Recorrente'?'active':''}">Recorrentes</button>
        <button data-f="Novo" class="${clState.filter==='Novo'?'active':''}">Novos</button>
        <button data-f="ret" class="${clState.filter==='ret'?'active':''}">Com retorno</button>
      </div>
      <div style="margin-left:auto;font-size:13px;color:var(--text-muted)" id="clCount"></div>
    </div>
    <div class="cards-grid" id="clGrid"></div>
    <div class="pager"><div class="info" id="clInfo"></div><div class="pages" id="clPages"></div></div>
   </div>`;
  $$('#clSeg button').forEach(b=>b.addEventListener('click',()=>{clState.filter=b.dataset.f;clState.page=1;$$('#clSeg button').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderClients();}));
  renderClients();
};
function renderClients(){
  let list=clientAgg();
  if(clState.filter==='ret') list=list.filter(c=>c.proxRet);
  else if(clState.filter!=='all') list=list.filter(c=>c.status===clState.filter);
  if(clState.q) list=list.filter(c=>c.nome.toLowerCase().includes(clState.q));
  const tot=list.length, pages=Math.max(1,Math.ceil(tot/clState.per));
  if(clState.page>pages)clState.page=pages;
  const start=(clState.page-1)*clState.per;
  const slice=list.slice(start,start+clState.per);
  $('#clGrid').innerHTML=slice.length?slice.map(c=>{
    const conv=c.atend?Math.round(c.compras/c.atend*100):0;
    const retSt = c.proxRet?returnStatus({retornar:c.proxRet,id:'x'}):null;
    return `<div class="client-card" data-cli="${esc(c.nome)}">
      <div class="top"><div class="av" style="background:${avatarColor(c.nome)}">${initials(c.nome)}</div>
        <div style="min-width:0"><h4>${esc(c.nome)}</h4><div class="sub">${esc(c.localidade||'Localidade n/d')}</div></div></div>
      <div class="stats"><div class="stat"><b>${c.atend}</b><small>Atend.</small></div><div class="stat"><b>${c.compras}</b><small>Compras</small></div><div class="stat"><b>${conv}%</b><small>Conv.</small></div></div>
      <div class="foot"><span>${statusPill(c.status)}</span><span>${c.proxRet?`Retorno: ${fmtDate(c.proxRet)}`:'Última: '+fmtDate(c.ultima)}</span></div>
    </div>`;
  }).join('') : `<div class="empty" style="grid-column:1/-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg><div>Nenhum cliente encontrado</div></div>`;
  $('#clInfo').textContent=`${fmtN(tot)} cliente(s)`;
  if($('#clCount'))$('#clCount').textContent=`${fmtN(tot)} cliente(s)`;
  $('#clPages').innerHTML=pagerBtns(clState.page,pages);
  $$('#clPages button[data-p]').forEach(b=>b.addEventListener('click',()=>{clState.page=+b.dataset.p;renderClients();}));
  $$('.client-card').forEach(card=>card.addEventListener('click',()=>clientHistoryDrawer(card.dataset.cli)));
}
function clientHistoryDrawer(nome){
  const hist=ATEND.filter(a=>a.cliente===nome).sort((a,b)=>b.data.localeCompare(a.data));
  const c=clientAgg().find(x=>x.nome===nome);
  openDrawer(`
    <div class="drawer-head">
      <div><h3>${esc(nome)}</h3><p>${hist.length} interação(ões) · ${esc(c.localidade||'Localidade n/d')}</p>
      <div class="tag-row">${statusPill(c.status)} <span class="pill gray">${c.compras} compras</span> ${c.proxRet?`<span class="pill info">Retorno ${fmtDate(c.proxRet)}</span>`:''}</div></div>
      <button class="iconbtn" onclick="closeDrawer()" aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="drawer-body">
      <div class="section-title" style="font-size:13px">Histórico de atendimentos</div>
      ${hist.map(a=>`<div class="alert-card" style="margin-bottom:9px;cursor:pointer" onclick="clientDrawer(${a.id})">
        <div class="alert-body"><h4 style="font-size:13.5px">${esc(a.produto)}</h4><p>${fmtDateFull(a.data)} · ${esc(a.categoria)} · ${a.compra?'Comprou':'Sem compra'}</p></div>
        <div>${convPill(a.conversao)}</div></div>`).join('')}
    </div>
    <div class="drawer-foot"><button class="btn primary" style="flex:1" onclick="simWhats('${esc(nome)}')">Contatar cliente</button></div>
  `);
}
window.clientHistoryDrawer=clientHistoryDrawer;

/* ---------- CENTRAL DE RETORNOS (KANBAN CRM) ---------- */
const STAGES=[
  {key:'contatar', label:'A Contatar',   color:'--accent-2', hint:'Retornos e follow-ups pendentes'},
  {key:'negociacao',label:'Em Negociação',color:'--accent-3', hint:'Oportunidades em aberto'},
  {key:'ganho',     label:'Convertido',   color:'--accent',   hint:'Vendas fechadas'},
  {key:'perdido',   label:'Perdido',      color:'--danger',   hint:'Não convertidos'},
];
let kanbanFilter='';
// monta um card por cliente (registro mais recente como âncora)
function pipelineCards(){
  const byClient=new Map();
  ATEND.forEach(a=>{
    const prev=byClient.get(a.cliente);
    if(!prev || a.data>prev.data) byClient.set(a.cliente,a);
  });
  const cards=[];
  byClient.forEach((anchor,cli)=>{
    // mais recente com retorno agendado (para urgência), se houver
    const withRet=ATEND.filter(x=>x.cliente===cli && x.retornar).sort((p,q)=>q.retornar.localeCompare(p.retornar))[0];
    const st = withRet ? returnStatus(withRet) : null;
    let stage = store.stage[cli];
    if(!stage){
      if(anchor.conversao==='Convertido') stage='ganho';
      else if(anchor.conversao==='Em negociação') stage='negociacao';
      else if(anchor.conversao==='Não convertido') stage='perdido';
      else if(withRet) stage='contatar';
      else stage=null; // fora do pipeline
    }
    if(!stage) return;
    cards.push({cli, anchor, st, stage, urgent:st&&['late','today','soon'].includes(st.cls)?st.cls:null});
  });
  return cards;
}
VIEW.retornos = ()=>{
  const ret=activeReturns();
  const late=ret.filter(x=>x.st.cls==='late').length, today=ret.filter(x=>x.st.cls==='today').length;
  const cards=pipelineCards();
  const stats={contatar:0,negociacao:0,ganho:0,perdido:0};
  cards.forEach(c=>stats[c.stage]++);
  const totalPipe=cards.length;
  $('#view').innerHTML=`
   <div class="view">
    <section class="kpis">
      ${kpi({cls:'ico-e',path:'B'},fmtN(late),'Retornos em atraso')}
      ${kpi({cls:'ico-d',path:'B'},fmtN(today),'Para contatar hoje')}
      ${kpi({cls:'ico-c',path:'M16 3h5v5M21 3l-7 7'},fmtN(stats.negociacao),'Em negociação')}
      ${kpi({cls:'ico-a',path:'C'},fmtN(totalPipe),'Clientes no pipeline')}
    </section>
    <div class="panel" style="margin-top:18px;padding:16px 18px">
      <div class="panel-head" style="margin-bottom:4px">
        <div><h3>Pipeline Comercial</h3><p>Arraste os cartões entre as colunas para mover o cliente no funil · base na data de referência</p></div>
        <div class="legend"><span><i class="dot" style="background:var(--danger)"></i>Atrasado</span><span><i class="dot" style="background:var(--warn)"></i>Hoje</span><span><i class="dot" style="background:var(--accent-2)"></i>Próx. dias</span></div>
      </div>
    </div>
    <div class="kanban" id="kanban"></div>
   </div>`;
  renderKanban();
};
function renderKanban(){
  const cards=pipelineCards();
  const f=kanbanFilter.toLowerCase();
  const board=$('#kanban');
  board.innerHTML=STAGES.map(s=>{
    let list=cards.filter(c=>c.stage===s.key);
    if(f) list=list.filter(c=>(c.cli+' '+c.anchor.produto+' '+(c.anchor.localidade||'')).toLowerCase().includes(f));
    // ordena: urgentes primeiro (atraso>hoje>soon), depois por data de retorno
    const ord={late:0,today:1,soon:2};
    list.sort((a,b)=>{
      const ua=a.urgent?ord[a.urgent]:9, ub=b.urgent?ord[b.urgent]:9;
      if(ua!==ub)return ua-ub;
      return (a.st?a.st.diff:1e9)-(b.st?b.st.diff:1e9);
    });
    const urg=list.filter(c=>c.urgent==='late').length;
    return `<div class="kcol" data-stage="${s.key}">
      <div class="kcol-head">
        <div class="lt"><span class="kdot" style="background:var(--${s.color.replace('--','')})"></span>
          <div><h4>${s.label}</h4>${urg?`<div class="ksum">${urg} em atraso</div>`:`<div class="ksum">${s.hint}</div>`}</div></div>
        <span class="kcount">${list.length}</span>
      </div>
      <div class="kcards" data-stage="${s.key}">
        ${list.length?list.map(kanCard).join(''):'<div class="kcol-empty">Sem cartões aqui</div>'}
      </div>
    </div>`;
  }).join('');
  bindKanbanDnD();
}
function kanCard(c){
  const a=c.anchor;
  const badge=c.urgent?`<span class="kbadge ${c.urgent}">${c.st.label}</span>`:`<span class="kbadge soon" style="background:var(--surface-2);color:var(--text-dim)">${fmtDate(a.data)}</span>`;
  return `<div class="kcard ${c.urgent||''}" draggable="true" data-cli="${esc(c.cli)}" data-id="${a.id}">
    <div class="ktop"><div class="kav" style="background:${avatarColor(c.cli)}">${initials(c.cli)}</div>
      <div style="min-width:0"><h5>${esc(c.cli)}</h5><div class="kloc">${esc(a.localidade||'Localidade n/d')} · ${esc(a.categoria)}</div></div></div>
    <div class="kprod">${esc(a.produto)}</div>
    <div class="kmeta">
      ${badge}
      <div class="kactions">
        <button class="ksm wa" title="WhatsApp" data-act="wa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
        <button class="ksm" title="Detalhes" data-act="info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button>
      </div>
    </div>
  </div>`;
}
function bindKanbanDnD(){
  let dragCli=null;
  $$('.kcard').forEach(card=>{
    card.addEventListener('dragstart',e=>{ dragCli=card.dataset.cli; card.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    card.addEventListener('dragend',()=>{ card.classList.remove('dragging'); $$('.kcol').forEach(c=>c.classList.remove('dragover')); });
    // ações
    card.addEventListener('click',e=>{
      const btn=e.target.closest('[data-act]');
      if(btn){ e.stopPropagation();
        if(btn.dataset.act==='wa') simWhats(card.dataset.cli);
        else clientHistoryDrawer(card.dataset.cli);
        return;
      }
      clientHistoryDrawer(card.dataset.cli);
    });
  });
  $$('.kcol').forEach(col=>{
    col.addEventListener('dragover',e=>{ e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave',()=>col.classList.remove('dragover'));
    col.addEventListener('drop',e=>{
      e.preventDefault(); col.classList.remove('dragover');
      if(!dragCli)return;
      const stage=col.dataset.stage;
      moveClient(dragCli,stage); dragCli=null;
    });
  });
}
function moveClient(cli,stage){
  store.stage[cli]=stage; persist();
  // sincroniza com a fila de retornos / notificações
  const rets=ATEND.filter(a=>a.cliente===cli && a.retornar);
  if(stage==='contatar') rets.forEach(a=>{ delete store.contatados[a.id]; });
  else rets.forEach(a=>{ store.contatados[a.id]=true; });
  persist();
  const label=STAGES.find(s=>s.key===stage).label;
  toast(`${cli} → ${label}${stage==='ganho'?' 🎉':''}`);
  buildNav(); updateNotif(); renderKanban();
}
window.moveClient=moveClient;

/* ---------- CONVERSÕES ---------- */
VIEW.conversoes = ()=>{
  const labeled=M.convertidos+M.negociacao+M.naoConv;
  const catConv=catConversion(); // compra/atendimento por categoria
  const lost=ATEND.filter(a=>a.conversao==='Não convertido' && a.obs);
  $('#view').innerHTML=`
   <div class="view">
    <section class="kpis">
      ${kpi({cls:'ico-a',path:'M20 6 9 17l-5-5'},fmtN(M.convertidos),'Convertidos')}
      ${kpi({cls:'ico-d',path:'M16 3h5v5M21 3l-7 7'},fmtN(M.negociacao),'Em negociação')}
      ${kpi({cls:'ico-e',path:'M18 6 6 18M6 6l12 12'},fmtN(M.naoConv),'Não convertidos')}
      ${kpi({cls:'ico-b',path:'M16 3h5v5M21 3l-7 7'},(M.convertidos/(M.convertidos+M.negociacao+M.naoConv)*100||0).toFixed(0)+'%','Taxa entre fechados')}
    </section>
    <div class="grid">
      <div class="panel col-5"><div class="panel-head"><div><h3>Funil de Conversão</h3><p>Entre os ${fmtN(labeled)} com status registrado</p></div></div>
        <div class="chart-wrap h-280"><canvas id="cvFunnel"></canvas><div class="donut-center"><b>${M.convertidos}</b><small>ganhos</small></div></div>
        <div class="legend" style="justify-content:center;margin-top:8px"><span><i class="dot" style="background:var(--accent)"></i>Convertido</span><span><i class="dot" style="background:var(--warn)"></i>Negociação</span><span><i class="dot" style="background:var(--danger)"></i>Não conv.</span></div>
      </div>
      <div class="panel col-7"><div class="panel-head"><div><h3>Taxa de Compra por Categoria</h3><p>Compras concluídas sobre o total atendido</p></div></div>
        <div class="barlist">${catConv.map(({cat,won,total,rate})=>{
          return `<div class="barrow"><div class="barrow-top"><b>${esc(cat)}</b><span>${won}/${total} · ${rate.toFixed(0)}%</span></div><div class="track"><div class="fill" data-w="${rate}" style="background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div></div></div>`;
        }).join('')}</div>
      </div>
    </div>
    <div class="grid">
      <div class="panel col-4"><div class="panel-head"><div><h3>Motivos de Perda</h3><p>Não conversões categorizadas</p></div></div>
        <div class="chart-wrap h-240"><canvas id="cvLost"></canvas></div>
      </div>
      <div class="panel col-8"><div class="panel-head"><div><h3>Detalhe das Não Conversões</h3><p>Aprendizados registrados nas observações</p></div></div>
        <div class="tbl-wrap"><table><thead><tr><th>Cliente</th><th>Produto</th><th>Categoria</th><th>Motivo / Observação</th></tr></thead>
        <tbody>${lost.slice(0,30).map(a=>`<tr data-id="${a.id}"><td class="cell-strong">${esc(a.cliente)}</td><td>${esc(a.produto)}</td><td class="muted">${esc(a.categoria)}</td><td class="muted" style="white-space:normal">${esc(a.obs)}</td></tr>`).join('')||'<tr><td colspan="4"><div class="empty">Sem motivos registrados</div></td></tr>'}</tbody></table></div>
      </div>
    </div>
   </div>`;
  donut($('#cvFunnel'),['Convertido','Negociação','Não conv.'],[M.convertidos,M.negociacao,M.naoConv],[C().acc,C().warn,C().danger],68,false);
  const lr=lostReasons();
  hbar($('#cvLost'),lr.map(r=>r[0]),lr.map(r=>r[1]),[C().danger,C().warn,C().acc3,C().acc2,'#64748b']);
  animateBars(); bindRows();
};

/* ---------- ENTREGAS ---------- */
VIEW.entregas = ()=>{
  const byMonth=ORD.map(m=>ENTREGAS.filter(e=>e.mes===m||(''+e.mes).includes(m)).length);
  const valMonth=ORD.map(m=>ENTREGAS.filter(e=>e.mes===m||(''+e.mes).includes(m)).reduce((s,e)=>s+e.valor,0));
  const byBairro=countBy(ENTREGAS.filter(e=>e.bairro),'bairro').slice(0,10);
  const ticket=M.entregas?M.receita/M.entregas:0;
  $('#view').innerHTML=`
   <div class="view">
    <section class="kpis">
      ${kpi({cls:'ico-c',path:'T'},fmtN(M.entregas),'Entregas realizadas')}
      ${kpi({cls:'ico-a',path:'T'},fmtBR(M.receita),'Receita de taxas')}
      ${kpi({cls:'ico-b',path:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'},fmtBR(Math.round(ticket)),'Ticket médio por entrega')}
      ${kpi({cls:'ico-d',path:'C'},fmtN(byBairro.length),'Bairros atendidos')}
    </section>
    <div class="grid">
      <div class="panel col-7"><div class="panel-head"><div><h3>Entregas & Receita por Mês</h3></div>
        <div class="legend"><span><i class="dot" style="background:var(--accent-3)"></i>Entregas</span><span><i class="dot" style="background:var(--accent)"></i>Taxas</span></div></div>
        <div class="chart-wrap h-300"><canvas id="enCombo"></canvas></div></div>
      <div class="panel col-5"><div class="panel-head"><div><h3>Top Bairros</h3><p>Volume de entregas</p></div></div>
        <div class="chart-wrap h-300"><canvas id="enBairro"></canvas></div></div>
    </div>
    <div class="grid"><div class="panel col-12"><div class="panel-head"><div><h3>Registro de Entregas</h3><p>${M.entregas} entregas</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Bairro</th><th>Mês</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${[...ENTREGAS].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,40).map(e=>`<tr style="cursor:default"><td class="muted">${fmtDate(e.data)}</td><td class="cell-strong">${esc(e.cliente)}</td><td class="muted">${esc(e.bairro||'—')}</td><td class="muted">${esc(e.mes)}</td><td style="text-align:right;font-weight:500">${fmtBR(e.valor)}</td></tr>`).join('')}</tbody></table></div>
    </div></div>
   </div>`;
  const ctx=$('#enCombo').getContext('2d');
  reg(new Chart(ctx,{data:{labels:['Jan','Fev','Mar','Abr'],datasets:[
    {type:'bar',label:'Entregas',data:byMonth,backgroundColor:gradV(ctx,'rgba(167,139,250,.9)','rgba(167,139,250,.35)'),borderRadius:8,borderSkipped:false,barThickness:38,yAxisID:'y',datalabels:{display:true,anchor:'end',align:'top',color:css('--text'),font:{family:"'Space Grotesk'",size:11,weight:'600'},formatter:v=>v}},
    {type:'line',label:'Taxas (R$)',data:valMonth,borderColor:C().acc,backgroundColor:C().acc,tension:.4,borderWidth:2.5,pointRadius:4,pointBackgroundColor:C().acc,pointBorderColor:'#0a0e13',pointBorderWidth:2,yAxisID:'y1',datalabels:{display:true,align:'top',offset:6,color:C().acc,backgroundColor:'rgba(10,14,19,.7)',borderRadius:4,padding:{top:2,bottom:2,left:5,right:5},font:{family:"'Space Grotesk'",size:10.5,weight:'600'},formatter:v=>'R$'+fmtN(v)}}
  ]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:18}},animation:{duration:1200,easing:'easeOutQuart'},interaction:{mode:'index',intersect:false},plugins:{legend:legendCfg(true),tooltip:tt(true)},scales:{x:{grid:{display:false},border:{display:false}},y:{...baseGrid(),beginAtZero:true,grace:'15%'},y1:{position:'right',beginAtZero:true,grid:{display:false},border:{display:false},grace:'15%',ticks:{callback:v=>'R$'+v}}}}}));
  hbar($('#enBairro'),byBairro.map(b=>b[0]),byBairro.map(b=>b[1]));
};

/* ---------- PRODUTOS ---------- */
VIEW.produtos = ()=>{
  const prods=countBy(ATEND.filter(a=>a.produto),'produto');
  const cats=countBy(ATEND.filter(a=>a.categoria),'categoria');
  $('#view').innerHTML=`
   <div class="view">
    <section class="kpis">
      ${kpi({cls:'ico-a',path:'M20 7h-9M14 17H5'},fmtN(prods.length),'Produtos distintos')}
      ${kpi({cls:'ico-b',path:'M20 7h-9M14 17H5'},fmtN(cats.length),'Categorias')}
      ${kpi({cls:'ico-c',path:'M20 7h-9M14 17H5'},esc(prods[0]?.[0]||'—').slice(0,18),'Produto mais atendido')}
      ${kpi({cls:'ico-d',path:'M20 7h-9M14 17H5'},esc(cats[0]?.[0]||'—'),'Categoria líder')}
    </section>
    <div class="grid">
      <div class="panel col-8"><div class="panel-head"><div><h3>Top 12 Produtos</h3><p>Atendimentos por produto</p></div></div>
        <div class="chart-wrap" style="height:420px"><canvas id="prRank"></canvas></div></div>
      <div class="panel col-4"><div class="panel-head"><div><h3>Categorias</h3></div></div>
        <div class="chart-wrap h-240"><canvas id="prCat"></canvas></div>
        <div class="barlist" style="margin-top:18px">${barlist(cats,null,'linear-gradient(90deg,var(--accent),var(--accent-2))')}</div></div>
    </div>
   </div>`;
  hbar($('#prRank'),prods.slice(0,12).map(p=>p[0]),prods.slice(0,12).map(p=>p[1]),(()=>{const ctx=$('#prRank').getContext('2d');const g=ctx.createLinearGradient(0,0,400,0);g.addColorStop(0,C().acc2);g.addColorStop(1,C().acc);return g;})());
  donut($('#prCat'),cats.map(c=>c[0]),cats.map(c=>c[1]),[C().acc,C().acc2,C().acc3,C().warn,'#64748b'],62);
  animateBars();
};

/* ---------- RELATÓRIOS ---------- */
VIEW.relatorios = ()=>{
  const canal=countBy(ATEND.filter(a=>a.canal),'canal');
  const pag=countBy(ATEND.filter(a=>a.pagamento && a.pagamento!=='Não'),'pagamento');
  const presc=countBy(ATEND.filter(a=>a.prescritor && !['Não Informado','Cnpj','Sem Prescritor'].includes(a.prescritor)),'prescritor').slice(0,8);
  $('#view').innerHTML=`
   <div class="view">
    <div class="panel-head" style="margin-bottom:6px"><div></div><button class="btn primary sm" onclick="exportCSV()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Exportar CSV</button></div>
    <div class="grid">
      <div class="panel col-6"><div class="panel-head"><div><h3>Evolução Mensal</h3><p>Atendimentos e compras</p></div></div><div class="chart-wrap h-280"><canvas id="rLine"></canvas></div></div>
      <div class="panel col-3"><div class="panel-head"><div><h3>Canais</h3></div></div><div class="chart-wrap h-280"><canvas id="rCanal"></canvas></div></div>
      <div class="panel col-3"><div class="panel-head"><div><h3>Pagamento</h3></div></div><div class="chart-wrap h-280"><canvas id="rPag"></canvas></div></div>
    </div>
    <div class="grid">
      <div class="panel col-6"><div class="panel-head"><div><h3>Novos vs. Recorrentes</h3><p>Perfil da base por mês</p></div></div><div class="chart-wrap h-280"><canvas id="rStack"></canvas></div></div>
      <div class="panel col-6"><div class="panel-head"><div><h3>Top Prescritores</h3><p>Origem das indicações</p></div></div><div class="chart-wrap h-280"><canvas id="rPresc"></canvas></div></div>
    </div>
   </div>`;
  lineMonths($('#rLine'),M.atendMes,M.compraMes);
  donut($('#rCanal'),canal.map(c=>c[0]),canal.map(c=>c[1]),[C().acc,C().acc2,C().acc3],62);
  donut($('#rPag'),pag.map(c=>c[0]),pag.map(c=>c[1]),[C().acc2,C().acc3,C().warn,C().acc,C().danger],62);
  // stacked
  const novos=ORD.map(m=>ATEND.filter(a=>a.mes===m&&a.status==='Novo').length);
  const rec=ORD.map(m=>ATEND.filter(a=>a.mes===m&&a.status==='Recorrente').length);
  reg(new Chart($('#rStack'),{type:'bar',data:{labels:['Jan','Fev','Mar','Abr'],datasets:[
    {label:'Novos',data:novos,backgroundColor:C().acc2,borderRadius:6,borderSkipped:false,stack:'s',datalabels:dlStack()},
    {label:'Recorrentes',data:rec,backgroundColor:C().acc3,borderRadius:6,borderSkipped:false,stack:'s',datalabels:dlStack()}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:1100},plugins:{legend:legendCfg(true),tooltip:tt()},scales:{x:{stacked:true,grid:{display:false},border:{display:false}},y:{stacked:true,...baseGrid(),beginAtZero:true}}}}));
  hbar($('#rPresc'),presc.map(p=>p[0]),presc.map(p=>p[1]));
};
function exportCSV(){
  const cols=['data','cliente','status','categoria','produto','localidade','canal','compra','pagamento','conversao','retornar'];
  const rows=[cols.join(',')].concat(ATEND.map(a=>cols.map(c=>`"${String(a[c]??'').replace(/"/g,'""')}"`).join(',')));
  const blob=new Blob(['﻿'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const link=document.createElement('a');
  link.href=url; link.download='atendimentos_badare.csv'; link.click(); URL.revokeObjectURL(url);
  toast('Exportando '+ATEND.length+' atendimentos…');
}
window.exportCSV=exportCSV;

/* ---------- CONFIGURAÇÕES ---------- */
VIEW.config = ()=>{
  $('#view').innerHTML=`
   <div class="view">
    <div class="grid">
      <div class="panel col-6"><div class="panel-head"><div><h3>Data de Referência</h3><p>Base para o cálculo de retornos, atrasos e alertas</p></div></div>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin-bottom:14px">Os dados carregados são de Jan–Abr/2026. Ajuste a data de referência para simular o "hoje" e validar os avisos de contato (atrasados, para hoje, próximos dias).</p>
        <input type="date" class="sel" id="cfgDate" value="${store.refDate}" style="width:100%">
        <div class="tag-row"><span class="pill info">Atual: ${fmtDateFull(store.refDate)}</span></div>
      </div>
      <div class="panel col-6"><div class="panel-head"><div><h3>Regras de Follow-up</h3><p>Janelas de acompanhamento</p></div></div>
        ${[['Boas-vindas a novos clientes','48h após 1º atendimento',true],['Acompanhamento de negociação','72h sem resposta',true],['Follow-up de recompra','7 dias antes da data',true],['Alerta de retorno agendado','no dia do retorno',true]].map((r,i)=>`
          <div class="dfield"><div><div style="font-weight:500">${r[0]}</div><div style="font-size:12px;color:var(--text-muted)">${r[1]}</div></div>
          <label style="position:relative;display:inline-block;width:42px;height:24px"><input type="checkbox" ${r[2]?'checked':''} style="opacity:0;width:0;height:0" onchange="toast('Regra atualizada')"><span style="position:absolute;cursor:pointer;inset:0;background:${r[2]?'var(--accent)':'var(--surface-3)'};border-radius:20px;transition:.2s"></span></label></div>`).join('')}
      </div>
    </div>
    <div class="grid">
      <div class="panel col-6"><div class="panel-head"><div><h3>Base de Dados</h3><p>Modo: ${window.BadareDB&&BadareDB.mode==='supabase'?'Nuvem (Supabase)':'Local (navegador)'}</p></div></div>
        <div class="stat-strip" style="grid-template-columns:repeat(2,1fr)">
          <div class="mini-stat"><b>${fmtN(ATEND.length)}</b><small>Atendimentos</small></div>
          <div class="mini-stat"><b>${fmtN(ENTREGAS.length)}</b><small>Entregas</small></div>
          <div class="mini-stat"><b>${fmtN(clientAgg().length)}</b><small>Clientes únicos</small></div>
          <div class="mini-stat"><b>${fmtN(window.BadareDB?BadareDB.localCount():0)}</b><small>Adicionados localmente</small></div>
        </div>
        <p style="font-size:12.5px;color:var(--text-dim);margin-top:14px">${window.BadareDB&&BadareDB.mode==='supabase'?'Conectado ao Supabase — dados compartilhados com o time em tempo real.':'Seed inicial gerado da planilha em '+(DBMETA.gerado?fmtDateFull(DBMETA.gerado):'—')+'. Configure o Supabase em <code>config.js</code> para ativar o modo nuvem.'}</p>
      </div>
      <div class="panel col-6"><div class="panel-head"><div><h3>Ações</h3><p>Gerenciamento dos dados</p></div></div>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin-bottom:14px">Contatos marcados, estágios do Kanban e a data de referência ficam salvos neste navegador.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" onclick="exportCSV()">Exportar atendimentos (CSV)</button>
          <button class="btn ghost" onclick="resetState()" style="color:var(--danger)">Resetar marcações</button>
          ${window.BadareDB&&BadareDB.mode==='local'?'<button class="btn ghost" onclick="clearLocalRecords()" style="color:var(--danger)">Limpar registros locais</button>':''}
        </div>
      </div>
    </div>
   </div>`;
  $('#cfgDate').addEventListener('change',e=>{ store.refDate=e.target.value; persist(); $('#refDate').value=e.target.value; buildNav(); updateNotif(); toast('Data de referência atualizada'); VIEW.config(); });
};
function resetState(){ store.contatados={}; store.stage={}; persist(); toast('Marcações resetadas'); buildNav(); updateNotif(); render(); }
window.resetState=resetState;
async function clearLocalRecords(){
  if(!confirm('Remover todos os atendimentos adicionados localmente? (não afeta a base original)')) return;
  BadareDB.clearLocal(); toast('Registros locais removidos'); await boot();
}
window.clearLocalRecords=clearLocalRecords;

/* ---------- NOVO ATENDIMENTO (tela de inserção) ---------- */
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const distinct=(key)=>[...new Set(ATEND.map(a=>a[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
function fieldText(id,label,{req,type='text',list,ph,val=''}={}){
  return `<div class="field" data-f="${id}"><label for="f_${id}">${label}${req?'<span class="req">*</span>':''}</label>
    <input id="f_${id}" type="${type}" ${list?`list="dl_${id}"`:''} ${ph?`placeholder="${ph}"`:''} value="${val}">
    ${list?`<datalist id="dl_${id}">${distinct(list).map(v=>`<option value="${esc(v)}">`).join('')}</datalist>`:''}
    <span class="err">Campo obrigatório</span></div>`;
}
function fieldSelect(id,label,opts,{req,val=''}={}){
  return `<div class="field" data-f="${id}"><label for="f_${id}">${label}${req?'<span class="req">*</span>':''}</label>
    <select id="f_${id}">${opts.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${o===''?'—':esc(o)}</option>`).join('')}</select>
    <span class="err">Selecione uma opção</span></div>`;
}
VIEW.novo = ()=>{
  const today=new Date().toISOString().slice(0,10);
  const mode=window.BadareDB?BadareDB.mode:'local';
  const localN=window.BadareDB?BadareDB.localCount():0;
  $('#view').innerHTML=`<div class="view">
    <div class="mode-banner ${mode==='supabase'?'cloud':'local'}">
      ${mode==='supabase'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg><b style="font-weight:600">Modo nuvem (Supabase) ativo.</b>&nbsp;Os dados serão salvos online e compartilhados com o time em tempo real.'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg><b style="font-weight:600">Modo local (validação).</b>&nbsp;Salvando neste navegador. Para compartilhar com o time, configure o Supabase em <code>config.js</code>.'}
    </div>
    <div class="grid">
      <div class="panel col-8">
        <div class="panel-head"><div><h3>Novo Atendimento</h3><p>Cadastro que substitui o lançamento na planilha</p></div></div>
        <form id="formNovo" class="form-grid" autocomplete="off" novalidate>
          ${fieldText('data','Data',{req:true,type:'date',val:today})}
          ${fieldSelect('tipo','Tipo',['Pessoa Física','Cnpj'],{val:'Pessoa Física'})}
          ${fieldText('cliente','Cliente / Paciente',{req:true,ph:'Nome completo',list:'cliente'})}
          ${fieldText('cuidador','Cuidador / Responsável',{ph:'Quem faz o contato'})}
          ${fieldSelect('status','Status',['Novo','Recorrente'],{req:true,val:'Novo'})}
          ${fieldSelect('categoria','Categoria',['Suplemento','Dieta Enteral','Fórmula Infantil','Módulo'],{req:true,val:'Suplemento'})}
          ${fieldText('produto','Produto',{req:true,ph:'Ex.: Fresubin Protein',list:'produto'})}
          ${fieldText('prescritor','Prescritor / Indicação',{list:'prescritor',ph:'Médico ou origem'})}
          ${fieldText('localidade','Localidade',{list:'localidade',ph:'Bairro / cidade'})}
          ${fieldSelect('canal','Canal',['Whatsapp','Presencial','Ligação'],{val:'Whatsapp'})}
          ${fieldText('atendente','Atendente',{list:'atendente',val:'Eduardo'})}
          ${fieldSelect('compra','Houve compra?',['Sim','Não'],{val:'Sim'})}
          ${fieldSelect('pagamento','Pagamento',['','PIX','Crédito','Débito','Dinheiro'],{})}
          ${fieldText('taxaCliente','Taxa do cliente (R$)',{type:'number',ph:'0'})}
          ${fieldText('entrega','Entrega',{list:'entrega',ph:'Ex.: Matheus / Não'})}
          ${fieldText('retornar','Retornar em',{type:'date'})}
          ${fieldSelect('conversao','Status da conversão',['','Convertido','Em negociação','Não convertido'],{})}
          ${`<div class="field full" data-f="obs"><label for="f_obs">Observação</label><textarea id="f_obs" placeholder="Detalhes, motivo de não conversão, preferências..."></textarea></div>`}
          <div class="field full form-actions">
            <button type="button" class="btn ghost" onclick="location.hash='#atendimentos'">Cancelar</button>
            <button type="submit" class="btn primary" id="btnSalvar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Salvar atendimento</button>
          </div>
        </form>
      </div>
      <div class="panel col-4">
        <div class="panel-head"><div><h3>Como funciona</h3></div></div>
        <div class="help-list">
          <div class="hi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg><div>Campos com <span style="color:var(--danger)">*</span> são obrigatórios: <b>Data, Cliente, Categoria, Produto, Status</b>.</div></div>
          <div class="hi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div>Preencher <b>Retornar em</b> coloca o cliente automaticamente na <b>Central de Retornos</b> (Kanban) e gera alertas.</div></div>
          <div class="hi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M21 3l-7 7"/><rect x="3" y="8" width="13" height="13" rx="2"/></svg><div>O <b>Status da conversão</b> alimenta o funil e os relatórios. Padronizar o preenchimento melhora as decisões.</div></div>
          <div class="hi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg><div>Os campos com sugestões puxam valores já usados, evitando digitação inconsistente.</div></div>
          ${mode==='local'?`<div class="hi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div>${localN} registro(s) adicionado(s) localmente nesta sessão.</div></div>`:''}
        </div>
      </div>
    </div>
  </div>`;
  $('#formNovo').addEventListener('submit',submitAtendimento);
};
async function submitAtendimento(e){
  e.preventDefault();
  const g=id=>{const el=$('#f_'+id);return el?el.value.trim():'';};
  const required=['data','cliente','categoria','produto','status'];
  let ok=true;
  $$('#formNovo .field').forEach(f=>f.classList.remove('invalid'));
  required.forEach(id=>{ if(!g(id)){ const f=$(`#formNovo [data-f="${id}"]`); if(f){f.classList.add('invalid');ok=false;} } });
  if(!ok){ toast('Preencha os campos obrigatórios'); return; }
  const data=g('data');
  const rec={
    mes:MESES[new Date(data+'T00:00:00').getMonth()],
    data,
    tipo:g('tipo')||'Pessoa Física',
    cliente:g('cliente'),
    cuidador:g('cuidador'),
    status:g('status'),
    prescritor:g('prescritor'),
    categoria:g('categoria'),
    produto:g('produto'),
    localidade:g('localidade'),
    taxaCliente:parseFloat(g('taxaCliente'))||0,
    canal:g('canal'),
    atendente:g('atendente'),
    compra:g('compra')==='Sim',
    pagamento:g('pagamento'),
    entrega:g('entrega'),
    retornar:g('retornar')||null,
    retornarTxt:g('retornar')?null:'Sem retorno',
    followup:[],
    conversao:g('conversao'),
    obs:g('obs')
  };
  const btn=$('#btnSalvar'); if(btn){btn.disabled=true;btn.style.opacity='.6';}
  try{
    const saved=await BadareDB.addAtendimento(rec);
    ATEND.push(saved||rec);
    recompute(); buildNav(); updateNotif();
    toast('Atendimento de '+rec.cliente+' salvo!');
    location.hash='#atendimentos';
  }catch(err){
    console.error(err);
    toast('Erro ao salvar: '+(err.message||err));
    if(btn){btn.disabled=false;btn.style.opacity='1';}
  }
}
window.submitAtendimento=submitAtendimento;

/* ============================================================
   ROUTER
   ============================================================ */
function currentRoute(){ const h=location.hash.replace('#',''); return VIEW[h]?h:'dashboard'; }
function render(){
  const id=currentRoute();
  const route=ROUTES.find(r=>r.id===id);
  $('#pageTitle').textContent=route.label;
  $('#pageSub').textContent=route.sub;
  destroyCharts();
  closeDrawer();
  VIEW[id]();
  animateBars();
  $('#main').scrollTop=0;
  buildNav();
  closeSidebar();
}
window.addEventListener('hashchange',render);

/* search global → vai para atendimentos filtrando */
$('#globalSearch').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase().trim();
  atState.q=q; clState.q=q; kanbanFilter=q;
  const r=currentRoute();
  if(r==='atendimentos'){ atState.page=1; renderAtTable(); }
  else if(r==='clientes'){ clState.page=1; renderClients(); }
  else if(r==='retornos'){ renderKanban(); }
  else if(q){ location.hash='#atendimentos'; }
});

/* refDate control */
$('#refDate').value=store.refDate;
$('#refDate').addEventListener('change',e=>{ store.refDate=e.target.value; persist(); buildNav(); updateNotif(); toast('Data de referência: '+fmtDateFull(e.target.value)); render(); });

/* init — carrega os dados (local ou Supabase) e então renderiza */
async function boot(){
  $('#view').innerHTML='<div class="empty" style="padding:80px"><div>Carregando dados…</div></div>';
  try{
    const data = await BadareDB.load();
    ATEND = data.atendimentos || [];
    ENTREGAS = data.entregas || [];
  }catch(err){
    console.error('Falha ao carregar via BadareDB, usando seed local:',err);
    const seed = window.BADARE_DATA || {atendimentos:[],entregas:[]};
    ATEND = seed.atendimentos; ENTREGAS = seed.entregas;
    toast('Erro de conexão — exibindo dados locais.');
  }
  recompute(); buildNav(); updateNotif(); render();
}
boot();

/* PWA — registra o service worker (instalável + offline) */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
