import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { Badge } from './components/ui/badge'

const API_HOST = window.location.hostname === 'localhost' ? '127.0.0.1' : (window.location.hostname || '127.0.0.1')
const API_PROTOCOL = window.location.protocol === 'https:' ? 'https:' : 'http:'
const INGESTION = import.meta.env.VITE_INGESTION_URL || `${API_PROTOCOL}//${API_HOST}:8001`
const PLANNING = import.meta.env.VITE_PLANNING_URL || `${API_PROTOCOL}//${API_HOST}:8002`
const AUTH = import.meta.env.VITE_AUTH_URL || `${API_PROTOCOL}//${API_HOST}:8003`
let sessionToken = sessionStorage.getItem('chc_session') || ''
async function apiFetch(url:string, init:RequestInit={}):Promise<Response>{
  const headers=new Headers(init.headers)
  if(sessionToken) headers.set('Authorization',`Bearer ${sessionToken}`)
  const response=await fetch(url,{...init,headers})
  if(response.status===401&&(url.startsWith(PLANNING)||url.startsWith(AUTH))&&!url.endsWith('/login')){
    window.dispatchEvent(new Event('chc:session-expired'))
  }
  return response
}

type Role = 'super_admin'|'admin'|'usuario'
type Tab = 'overview'|'people'|'changes'|'realized'|'parameters'|'imports'|'audit'|'assistant'|'users'
type Account = {id:number;email:string;role:Role;created_at:string}
type OptionData = {institutos:string[]; areas:string[]; meses:string[]; version:number}
type Kpis = {professionals:number;contracts:number;management_target:number;planned_visits:number;foja:number;version:number;pending_changes:number}
type PlanRow = {person_id:number;institute:string;institute_code:string;area_code:string;cargo:string;hours_week:number;month:string;direct_visits:number;indirect_visits:number;management_target:number;foja:number;band:string;source_kind:string}
type Change = {id:number;person_id:number;institute:string;kind:string;previous_value:string;new_value:string;effective_date:string;state:string;reason:string;created_at:string}
type ImportResult = {import_id:number;file:string;read:number;accepted:number;rejected:{row_number:number;persona_id:number;reason:string}[];message:string;planning?:{version?:number}}
type RealizedRow = {person_id:number;institute:string;month:string;realized:number;planned:number;management_target:number;below_target:boolean;attainment:number}
type ParamSet = Record<string,unknown>

async function getJson<T>(url:string):Promise<T>{
  const response=await apiFetch(url)
  if(!response.ok) throw new Error(await response.text())
  return response.json()
}
async function postJson<T>(url:string,body:unknown):Promise<T>{
  const response=await apiFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  if(!response.ok) throw new Error(await response.text())
  return response.json()
}
const fmt=(n:number)=>new Intl.NumberFormat('es-CL').format(n||0)
const percent=(n:number)=>`${(n*100).toFixed(1)}%`

function App(){
  const [darkMode,setDarkMode]=useState(()=>{
    try { return window.localStorage.getItem('chc_theme')==='dark' }
    catch { return false }
  })
  const [authState,setAuthState]=useState<'checking'|'anonymous'|'authenticated'>('checking')
  const [adminEmail,setAdminEmail]=useState('')
  const [role,setRole]=useState<Role>('usuario')
  const [accounts,setAccounts]=useState<Account[]>([])
  const [newAccount,setNewAccount]=useState({email:'',password:'',role:'usuario' as Role})
  const [serviceStatus,setServiceStatus]=useState<'green'|'yellow'|'red'>('red')
  const [tab,setTab]=useState<Tab>('overview')
  const [options,setOptions]=useState<OptionData>({institutos:[],areas:[],meses:[],version:0})
  const [filters,setFilters]=useState({instituto:'',area:'',mes:''})
  const [kpis,setKpis]=useState<Kpis>({professionals:0,contracts:0,management_target:0,planned_visits:0,foja:0,version:0,pending_changes:0})
  const [rows,setRows]=useState<PlanRow[]>([])
  const [changes,setChanges]=useState<Change[]>([])
  const [parameters,setParameters]=useState<ParamSet>({})
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [upload,setUpload]=useState<ImportResult|null>(null)
  const [uploadKind,setUploadKind]=useState<'BUK'|'SIC'>('BUK')
  const [realized,setRealized]=useState<RealizedRow[]>([])
  const [simulation,setSimulation]=useState<Record<string,unknown>|null>(null)
  const [paramKey,setParamKey]=useState('management_floor')
  const [paramText,setParamText]=useState('')
  const [audits,setAudits]=useState<Record<string,unknown>[]>([])

  useEffect(()=>{
    document.documentElement.classList.toggle('dark-theme',darkMode)
    try { window.localStorage.setItem('chc_theme',darkMode?'dark':'light') } catch { /* El modo sigue disponible durante esta sesión. */ }
  },[darkMode])

  useEffect(()=>{
    if(!sessionToken){setAuthState('anonymous');return}
    void getJson<{email:string;role:Role}>(`${AUTH}/me`).then(user=>{setAdminEmail(user.email);setRole(user.role);setAuthState('authenticated')})
      .catch(()=>{sessionToken='';sessionStorage.removeItem('chc_session');setAuthState('anonymous')})
  },[])
  useEffect(()=>{
    const expired=()=>{sessionToken='';sessionStorage.removeItem('chc_session');setTab('overview');setAuthState('anonymous')}
    window.addEventListener('chc:session-expired',expired)
    return()=>window.removeEventListener('chc:session-expired',expired)
  },[])
  useEffect(()=>{
    let active=true
    async function check(){
      const results=await Promise.allSettled([fetch(`${PLANNING}/health`,{cache:'no-store'}),fetch(`${INGESTION}/health`,{cache:'no-store'}),fetch(`${AUTH}/health`,{cache:'no-store'})])
      const healthy=results.filter(r=>r.status==='fulfilled'&&r.value.ok).length
      if(active)setServiceStatus(healthy===3?'green':healthy>0?'yellow':'red')
    }
    void check();const timer=window.setInterval(()=>void check(),15000)
    return()=>{active=false;window.clearInterval(timer)}
  },[])

  const query=useMemo(()=>{
    const p=new URLSearchParams()
    if(filters.instituto)p.set('institute',filters.instituto)
    if(filters.area)p.set('area',filters.area)
    if(filters.mes)p.set('month',filters.mes)
    return p.toString()
  },[filters])

  const refresh=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const suffix=query?`?${query}`:''
      const [opt,stats,planning,changeList]=await Promise.all([
        getJson<OptionData>(`${PLANNING}/api/opciones`),getJson<Kpis>(`${PLANNING}/api/kpis${suffix}`),
        getJson<PlanRow[]>(`${PLANNING}/api/planificacion${suffix}`),role==='usuario'?Promise.resolve([] as Change[]):getJson<Change[]>(`${PLANNING}/api/cambios`),
      ])
      setOptions(opt);setKpis(stats);setRows(planning);setChanges(changeList)
    }catch{ /* El semáforo comunica el estado de conexión sin mostrar errores técnicos. */ }
    finally{setLoading(false)}
  },[query,role])

  useEffect(()=>{if(authState==='authenticated')void refresh()},[refresh,authState])
  useEffect(()=>{if(authState!=='authenticated')return;
    if(tab==='parameters') void getJson<ParamSet>(`${PLANNING}/api/parametros`).then(setParameters).catch(()=>{});
    if(tab==='audit') void getJson<Record<string,unknown>[]>(`${PLANNING}/api/auditoria`).then(setAudits).catch(()=>{})},[tab,authState])
  useEffect(()=>{if(authState==='authenticated'&&role==='super_admin'&&tab==='users')void getJson<Account[]>(`${AUTH}/api/usuarios`).then(setAccounts).catch(()=>{})},[tab,authState,role])
  useEffect(()=>{if(authState==='authenticated'&&tab==='realized'&&options.meses.length){const searchParams=new URLSearchParams({month:filters.mes||options.meses[options.meses.length-1]});if(filters.instituto)searchParams.set('institute',filters.instituto);void getJson<RealizedRow[]>(`${PLANNING}/api/realizado-vs-plan?${searchParams}`).then(setRealized).catch(()=>{})}},[tab,filters.mes,filters.instituto,options.meses,authState])
  useEffect(()=>{if(paramKey in parameters)setParamText(JSON.stringify(parameters[paramKey],null,2))},[parameters,paramKey])

  const chartData=useMemo(()=>{
    const grouped=new Map<string,{institute:string;planned:number;target:number;people:Set<number>}>()
    for(const row of rows){const g=grouped.get(row.institute)||{institute:row.institute,planned:0,target:0,people:new Set<number>()};
      g.planned+=(row.direct_visits||0)+(row.indirect_visits||0);g.target+=row.management_target||0;g.people.add(row.person_id);grouped.set(row.institute,g)}
    return [...grouped.values()].map(v=>({institute:v.institute,planned:v.planned,target:v.target,professionals:v.people.size})).sort((a,b)=>b.planned-a.planned).slice(0,6)
  },[rows])
  const visibleRows=useMemo(()=>rows.filter(r=>`${r.person_id} ${r.institute} ${r.cargo} ${r.area_code}`.toLowerCase().includes(search.toLowerCase())),[rows,search])
  const pending=changes.filter(c=>c.state==='EN_ESPERA')

  async function reviewChange(id:number,action:'aprobar'|'rechazar'){
    try{await postJson(`${PLANNING}/api/cambios/${id}/${action}`,{approved_by:'Planificación central',reason:`${action} desde el dashboard`});
      if(action==='aprobar'){const item=changes.find(c=>c.id===id);if(item)await postJson(`${PLANNING}/api/recalcular`,{persons:[item.person_id],from_date:item.effective_date,reason:`Cambio ${id} aprobado`,actor:'Planificación central'})}
      setNotice(action==='aprobar'?'Cambio aprobado y planificación recalculada.':'Cambio rechazado.');await refresh()}
    catch(e){setError(String(e))}
  }
  async function calculate(){
    try{await postJson(`${PLANNING}/api/recalcular`,{from_date:filters.mes?`${filters.mes}-01`:'2026-01-01',reason:'Recálculo desde dashboard',actor:'Planificación central'});setNotice('Nueva versión calculada.');await refresh()}
    catch(e){setError(String(e))}
  }
  async function uploadFile(file?:File){
    if(!file)return
    const data=new FormData();data.append('file',file)
    try{const response=await apiFetch(`${INGESTION}/api/importaciones/${uploadKind.toLowerCase()}`,{method:'POST',body:data});if(!response.ok)throw new Error(await response.text());
      const result=await response.json() as ImportResult;setUpload(result);
      setNotice(`${result.accepted} filas válidas enviadas; ${result.rejected.length} rechazos.${result.planning?.version?` Versión ${result.planning.version} calculada.`:''}`);await refresh()}
    catch(e){setError(String(e))}
  }
  async function simulateParameter(){
    try{const value=JSON.parse(paramText);const result=await postJson<Record<string,unknown>>(`${PLANNING}/api/simular`,{key:paramKey,value,institute:filters.instituto||null,month:filters.mes||null});setSimulation(result)}
    catch(e){setError(`No se pudo simular el cambio: ${String(e)}`)}
  }
  async function saveParameter(){
    try{const value=JSON.parse(paramText);const response=await apiFetch(`${PLANNING}/api/parametros/${paramKey}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value,actor:'Planificación central'})});
      if(!response.ok)throw new Error(await response.text());setParameters({...parameters,[paramKey]:value});setNotice('Parámetro guardado. Recalcula para crear una nueva versión.')}
    catch(e){setError(`No se pudo guardar el parámetro: ${String(e)}`)}
  }
  async function saveAccount(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    try{
      await postJson(`${AUTH}/api/usuarios`,newAccount)
      setNewAccount({email:'',password:'',role:'usuario'});setAccounts(await getJson<Account[]>(`${AUTH}/api/usuarios`))
      setNotice('Cuenta guardada correctamente.')
    }catch(e){setError(`No se pudo guardar la cuenta: ${String(e)}`)}
  }

  async function downloadRejects(importId:number){
    try{
      const response=await apiFetch(`${INGESTION}/api/importaciones/${importId}/rechazos.xlsx`)
      if(!response.ok)throw new Error('No se pudo descargar el archivo.')
      const url=URL.createObjectURL(await response.blob())
      const link=document.createElement('a');link.href=url;link.download=`rechazos-${importId}.xlsx`;link.click();URL.revokeObjectURL(url)
    }catch(e){setError(String(e))}
  }
  function logout(){
    void postJson(`${AUTH}/logout`,{}).catch(()=>{})
    sessionToken='';sessionStorage.removeItem('chc_session');setAdminEmail('');setTab('overview');setAuthState('anonymous')
  }
  if(authState!=='authenticated') return <LoginScreen loading={authState==='checking'} onLogin={(token,email,userRole)=>{
    sessionToken=token;sessionStorage.setItem('chc_session',token);setAdminEmail(email);setRole(userRole);setTab('overview');setAuthState('authenticated')
  }} status={serviceStatus} darkMode={darkMode} onToggleTheme={()=>setDarkMode(value=>!value)}/>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img className="brand-logo" src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Teleton_Chile_Logo.svg" alt="Logo de Teletón Chile"/><div><strong>CADA HORA</strong><small>PLANIFICACIÓN ASISTENCIAL</small></div></div>
      <div className="side-caption">CENTRO DE CONTROL</div>
      <nav aria-label="Navegación principal">{([
        ['overview','Resumen'],['people','Profesionales'],['changes','Cambios'],['realized','Plan vs real'],['parameters','Parámetros'],['imports','Ingesta'],['audit','Trazabilidad'],['assistant','Asistente IA'],['users','Usuarios'],
      ] as [Tab,string][]).filter(([id])=>role==='super_admin'||(role==='admin'?!['audit','users'].includes(id):['overview','people','realized','assistant'].includes(id))).map(([id,label])=><button key={id} type="button" className={`nav-item ${tab===id?'active':''}`} aria-label={label} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><span className="nav-icon" aria-hidden="true"><NavIcon tab={id}/></span><span className="nav-label">{label}</span>{id==='changes'&&pending.length>0&&<em>{pending.length}</em>}</button>)}</nav>
      <div className="side-bottom"><StatusLight status={serviceStatus}/><small>IDENTIDAD · INGESTA · PLANIFICACIÓN</small><div className="build-id">CADA HORA CUENTA</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-leading"><span className="topbar-mark" aria-hidden="true">✦</span><div><small>ESPACIO DE TRABAJO</small><div className="crumb"><span>{roleLabel(role)}</span><b>/</b>{tabLabel(tab)}</div></div></div><div className="top-actions"><ThemeToggle enabled={darkMode} onToggle={()=>setDarkMode(value=>!value)}/><StatusLight status={serviceStatus}/><div className="topbar-period"><small>PERÍODO</small><strong>{filters.mes||options.meses[options.meses.length-1]||'—'}</strong></div><div className="topbar-user"><span className="avatar" aria-hidden="true">{adminEmail.slice(0,2).toUpperCase()}</span><span className="topbar-user-copy"><strong>{roleLabel(role)}</strong><small>{adminEmail}</small></span></div><button className="topbar-logout" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={logout}><span aria-hidden="true">↗</span><span>Salir</span></button></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow">PLANIFICACIÓN ASISTENCIAL <span>●</span> {roleLabel(role).toUpperCase()}</div><h1>{pageTitle(tab)}</h1><p>{pageDescription(tab)}</p></div><div className="heading-actions">{tab==='overview'&&role!=='usuario'&&<Button variant="primary" className="button button-primary" onClick={calculate}><span>⟳</span> Recalcular plan</Button>}</div></div>
        {(error||notice)&&<div className={`toast ${error?'toast-error':''}`}><span>{error||notice}</span><button onClick={()=>{setError('');setNotice('')}}>×</button></div>}
        <div className="filters-row"><div className="filter-label"><span>⌕</span> FILTRAR VISTA</div><select value={filters.instituto} onChange={e=>setFilters({...filters,instituto:e.target.value})}><option value="">Todos los institutos</option>{options.institutos.map(x=><option key={x}>{x}</option>)}</select><select value={filters.area} onChange={e=>setFilters({...filters,area:e.target.value})}><option value="">Todas las áreas</option>{options.areas.map(x=><option key={x}>{x}</option>)}</select><select value={filters.mes} onChange={e=>setFilters({...filters,mes:e.target.value})}><option value="">Todo el año</option>{options.meses.map(x=><option key={x}>{x}</option>)}</select><button className="filter-reset" onClick={()=>setFilters({instituto:'',area:'',mes:''})}>Restablecer</button><span className="filter-scope">{options.version?`VERSIÓN ${String(options.version).padStart(3,'0')}`:'ESPERANDO CARGA'}</span></div>
        {loading&&<div className="loading-line"><span/>Sincronizando indicadores…</div>}
        {tab==='overview'&&<Overview kpis={kpis} chartData={chartData} changes={changes} onNavigate={setTab} canManage={role!=='usuario'} darkMode={darkMode}/>}
        {tab==='people'&&<section className="panel"><div className="panel-head"><div><h2>Dotación planificada</h2><p>{fmt(visibleRows.length)} registros en la vista actual</p></div><div className="search-box">⌕ <input placeholder="Buscar PersonaId, cargo o instituto" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><PeopleTable rows={visibleRows}/></section>}
        {tab==='changes'&&role!=='usuario'&&<section className="panel changes-detail-panel"><div className="panel-head"><div><span className="section-kicker">GESTIÓN CONTRACTUAL</span><h2>Revisión de cambios</h2><p>Controla las diferencias detectadas entre cargas de dotación.</p></div><Badge className="tag tag-amber">{pending.length} PENDIENTES</Badge></div><div className="change-summary" aria-label="Resumen de cambios"><div><span>CAMBIOS DETECTADOS</span><strong>{changes.length}</strong><small>Registro histórico</small></div><div><span>REQUIEREN DECISIÓN</span><strong>{pending.length}</strong><small>En espera de revisión</small></div><div><span>VERSIÓN DEL PLAN</span><strong>{String(options.version).padStart(2,'0')}</strong><small>Último cálculo disponible</small></div></div><ChangesList changes={changes} onReview={reviewChange} onImport={()=>setTab('imports')}/></section>}
        {tab==='realized'&&<section className="panel"><div className="panel-head"><div><h2>Atención planificada y realizada</h2><p>Personas bajo la meta mensual de gestión del 90%</p></div><span className="tag tag-cyan">{realized.filter(r=>r.below_target).length} ALERTAS</span></div><RealizedTable rows={realized}/></section>}
        {tab==='parameters'&&role!=='usuario'&&<section className="parameter-layout"><div className="panel parameter-menu"><div className="panel-head"><div><h2>Reglas del motor</h2><p>{role==='super_admin'?'Parámetros editables sin despliegue':'Consulta y simulación de reglas'}</p></div></div>{Object.keys(parameters).map(key=><button key={key} className={`param-choice ${paramKey===key?'selected':''}`} onClick={()=>{setParamKey(key);setSimulation(null)}}><span>{key.replaceAll('_',' ')}</span><b>›</b></button>)}</div><div className="panel parameter-editor"><div className="panel-head"><div><h2>{paramKey.replaceAll('_',' ')}</h2><p>JSON de configuración del motor de planificación</p></div><span className="tag tag-cyan">{role==='super_admin'?'EDITABLE':'SOLO LECTURA'}</span></div><textarea spellCheck={false} readOnly={role!=='super_admin'} value={paramText} onChange={e=>setParamText(e.target.value)}/>{simulation&&<div className="simulation-result"><b>Simulación de impacto</b><span>Actual: {fmt(Number(simulation.current||0))} · Proyectado: {fmt(Number(simulation.simulated||0))} · Variación: {fmt(Number(simulation.difference||0))} ({percent(Number(simulation.change_pct||0))})</span></div>}<div className="editor-foot"><span>{role==='super_admin'?'Simula primero; al guardar, recalcula para crear una nueva versión.':'Puedes simular sin modificar las reglas.'}</span><div className="editor-buttons"><button className="button button-ghost" onClick={simulateParameter}>Simular impacto</button>{role==='super_admin'&&<button className="button button-primary" onClick={saveParameter}>Guardar parámetro</button>}</div></div></div></section>}
        {tab==='imports'&&<section className="imports-layout"><div className="panel upload-panel"><div className="panel-head"><div><h2>Ingesta automatizada {uploadKind}</h2><p>Valida el reporte, registra rechazos y envía filas correctas al motor.</p></div><span className="tag tag-green">LISTO</span></div><div className="upload-toggle"><button className={uploadKind==='BUK'?'chosen':''} onClick={()=>{setUploadKind('BUK');setUpload(null)}}>Dotación BUK</button><button className={uploadKind==='SIC'?'chosen':''} onClick={()=>{setUploadKind('SIC');setUpload(null)}}>Atenciones SIC</button></div><label className="dropzone"><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>void uploadFile(e.target.files?.[0])}/><div className="upload-glyph">⇧</div><strong>Selecciona un reporte {uploadKind}</strong><span>Excel o CSV · archivo completo, sin copiar y pegar</span><small>{uploadKind==='BUK'?'Formato oficial: hoja Dotacion_2026, encabezados en la fila 2.':'Columnas: PersonaId, Instituto, Periodo y Atenciones realizadas.'}</small></label><div className="integration-note"><span>↔</span><div><b>Blue Prism → Ingesta → Planificación</b><p>Blue Prism vigila las carpetas de entrada y llama al servicio de ingesta en localhost:8001.</p></div></div></div><div className="panel import-result"><div className="panel-head"><div><h2>Resultado más reciente</h2><p>Validación de filas y gestión de errores</p></div></div>{upload?<><div className="import-metrics"><div><b>{fmt(upload.read)}</b><span>LEÍDAS</span></div><div className="good"><b>{fmt(upload.accepted)}</b><span>VÁLIDAS</span></div><div className="bad"><b>{fmt(upload.rejected.length)}</b><span>RECHAZADAS</span></div></div>{upload.rejected.length>0&&<button className="download-rejects" onClick={()=>void downloadRejects(upload.import_id)}>Descargar Excel de rechazos ↓</button>}<div className="reject-scroll">{upload.rejected.length?upload.rejected.slice(0,100).map((r,i)=><div className="reject-row" key={i}><b>Fila {r.row_number}</b><span>Persona {r.persona_id||'—'}</span><small>{r.reason}</small></div>):<div className="empty-state">Sin rechazos en esta carga.</div>}</div></>:<div className="empty-state">Carga un archivo para ver el resumen de validación.</div>}</div></section>}
        {tab==='assistant'&&<AssistantPanel/>}
        {tab==='users'&&role==='super_admin'&&<section className="users-layout"><Card className="users-form panel"><div className="panel-head"><div><h2>Crear o actualizar cuenta</h2><p>Asigna un perfil y una contraseña de al menos 12 caracteres.</p></div></div><form onSubmit={saveAccount}><label>Correo electrónico<input type="email" value={newAccount.email} onChange={e=>setNewAccount({...newAccount,email:e.target.value})} required placeholder="persona@institucion.cl"/></label><label>Perfil<select value={newAccount.role} onChange={e=>setNewAccount({...newAccount,role:e.target.value as Role})}><option value="usuario">Usuario · consulta</option><option value="admin">Administrador · operación</option><option value="super_admin">Superadministrador · control total</option></select></label><label>Contraseña<input type="password" minLength={12} value={newAccount.password} onChange={e=>setNewAccount({...newAccount,password:e.target.value})} required autoComplete="new-password"/></label><Button type="submit" variant="primary">Guardar cuenta</Button></form></Card><Card className="users-list panel"><div className="panel-head"><div><h2>Cuentas del sistema</h2><p>{accounts.length} perfiles registrados</p></div></div>{accounts.map(account=><div className="user-row" key={account.id}><div className="user-avatar">{account.email.slice(0,2).toUpperCase()}</div><div><strong>{account.email}</strong><small>{roleLabel(account.role)}</small></div></div>)}</Card></section>}
        {tab==='audit'&&<section className="panel audit-panel"><div className="audit-layout"><div className="audit-hero"><span className="audit-hero-icon" aria-hidden="true">↗</span><span className="audit-hero-kicker">TRAZABILIDAD</span><strong>{audits.length}</strong><p>eventos recientes registrados</p><div className="audit-hero-foot"><span>Versión del plan</span><b>{String(options.version).padStart(3,'0')}</b></div></div><div className="audit-content"><div className="panel-head"><div><span className="section-kicker">HISTORIAL OPERATIVO</span><h2>Registro de actividad</h2><p>Cargas, decisiones y recálculos registrados por el sistema.</p></div><span className="tag tag-cyan">AUDITORÍA</span></div><div className="audit-list">{audits.length?audits.map((a,i)=><div className="audit-row" key={i}><span className="audit-mark" aria-hidden="true">⌁</span><div className="audit-event"><b>{String(a.action||'Evento').replaceAll('_',' ')}</b><p>{String(a.detail||'Sin detalle adicional')}</p></div><div className="audit-meta"><time>{String(a.created_at||'—')}</time><small>{String(a.actor||'Sistema')}</small></div></div>):<div className="audit-empty">Aún no se registran eventos de actividad.</div>}</div></div></div></section>}
        <footer className="page-footer"><span>ACCESO RESTRINGIDO · PLANIFICACIÓN CENTRAL</span><span>CADA HORA CUENTA <i>●</i> PLANIFICACIÓN ASISTENCIAL</span></footer>
      </div>
    </main>
  </div>
}

function NavIcon({tab}:{tab:Tab}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {tab==='overview'&&<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>}
  {tab==='people'&&<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></>}
  {tab==='changes'&&<><path d="M4 7h15l-3-3m3 3-3 3M20 17H5l3 3m-3-3 3-3"/></>}
  {tab==='realized'&&<><path d="M4 20V12m5 8V7m5 13v-5m5 5V4M2 20h20"/></>}
  {tab==='parameters'&&<><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="17" r="2" fill="currentColor"/></>}
  {tab==='imports'&&<><path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/></>}
  {tab==='audit'&&<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>}
  {tab==='assistant'&&<><path d="M4 5h16v12H8l-4 3V5Z"/><path d="M8 10h8M8 13h5"/></>}
  {tab==='users'&&<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></>}
</svg>}
function StatusLight({status}:{status:'green'|'yellow'|'red'}){
  const label={green:'Sistema funcionando correctamente',yellow:'Problema de conexión con un servicio o base de datos',red:'Servicios sin conexión'}[status]
  return <span className={`traffic-light ${status}`} role="status" title={label} aria-label={label}><i/></span>
}
function ThemeToggle({enabled,onToggle,login=false}:{enabled:boolean;onToggle:()=>void;login?:boolean}){
  const label=enabled?'Activar modo claro':'Activar modo oscuro'
  return <button type="button" className={`theme-toggle${login?' login-mode':''}`} onClick={onToggle} aria-label={label} aria-pressed={enabled} title={label}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {enabled?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>:<path d="M20.3 15.7A8.7 8.7 0 0 1 8.3 3.7 8.8 8.8 0 1 0 20.3 15.7Z"/>}
    </svg><span>{enabled?'Claro':'Oscuro'}</span>
  </button>
}
function LoginScreen({loading,onLogin,status,darkMode,onToggleTheme}:{loading:boolean;onLogin:(token:string,email:string,role:Role)=>void;status:'green'|'yellow'|'red';darkMode:boolean;onToggleTheme:()=>void}){
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('')
    try{
      const response=await fetch(`${AUTH}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})
      if(!response.ok){setMessage(response.status===401?'Correo o contraseña incorrectos.':'No se pudo iniciar sesión.');return}
      const data=await response.json() as {token:string;user:{email:string;role:Role}}
      onLogin(data.token,data.user.email,data.user.role)
    }catch{setMessage('')}
    finally{setBusy(false)}
  }
  return <main className="login-shell"><div className="login-content"><div className="login-head"><div className="login-brand"><img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Teleton_Chile_Logo.svg" alt="Logo de Teletón Chile"/><span>CADA HORA CUENTA<small>PLATAFORMA DE PLANIFICACIÓN ASISTENCIAL</small></span></div><ThemeToggle enabled={darkMode} onToggle={onToggleTheme} login/></div><div className="login-intro"><span className="login-kicker">ACCESO INSTITUCIONAL</span><h1>Planificar mejor.<br/><em>Atender más.</em></h1><p>Un espacio para transformar datos de dotación en decisiones claras para la atención.</p></div><Card className="login-card"><div className="login-card-head"><div><span>BIENVENIDO</span><h2>Inicia sesión</h2><p>Ingresa con tu cuenta del sistema.</p></div><StatusLight status={status}/></div><form onSubmit={submit}><label htmlFor="login-email">Correo electrónico</label><input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nombre@institucion.cl" required/><label htmlFor="login-password">Contraseña</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Ingresa tu contraseña" required/>{message&&<p className="login-error" role="alert">{message}</p>}<Button type="submit" variant="primary" disabled={busy||loading} className="button button-primary login-submit">{busy||loading?'Validando…':'Ingresar al sistema'} <span>→</span></Button></form></Card><p className="login-caption">Acceso restringido · Planificación central Teletón Chile</p></div><div className="login-visual" aria-hidden="true"><div className="login-orbit orbit-one"/><div className="login-orbit orbit-two"/><div className="login-visual-copy"><span>DATOS → DECISIONES → IMPACTO</span><strong>Cada hora<br/>cuenta.</strong><p>Una mirada integral para optimizar la capacidad asistencial.</p></div></div></main>
}
function AssistantPanel(){return <section className="assistant-layout"><Card className="assistant-hero"><span className="assistant-eyebrow">PRÓXIMA INTEGRACIÓN · BLUE PRISM</span><div className="assistant-orb">✦</div><h2>Asistente inteligente</h2><p>La interfaz del asistente está preparada para conectar el flujo de Blue Prism cuando se reciba su contrato de integración. Las respuestas quedarán vinculadas a datos autorizados y a la trazabilidad del sistema.</p><div className="assistant-capabilities"><span>Consultas de planificación</span><span>Explicación de brechas</span><span>Apoyo en decisiones</span></div></Card><Card className="assistant-chat"><div className="assistant-chat-head"><div className="assistant-avatar">✦</div><div><strong>Asistente de planificación</strong><small>Integración pendiente</small></div></div><div className="assistant-message"><span>✦</span><p>Cuando conectemos Blue Prism, podrás consultar aquí los indicadores, cambios y proyecciones de forma segura.</p></div><div className="assistant-composer"><input aria-label="Consulta al asistente" placeholder="Disponible al conectar Blue Prism" disabled/><button disabled aria-label="Enviar consulta">→</button></div></Card></section>}
function displayValue(value:string){try{const parsed=JSON.parse(value) as Record<string,unknown>;return Object.entries(parsed).map(([key,val])=>`${key}: ${String(val)}`).join(' · ')}catch{return value||'—'}}
function Overview({kpis,chartData,changes,onNavigate,canManage,darkMode}:{kpis:Kpis;chartData:{institute:string;planned:number;target:number;professionals:number}[];changes:Change[];onNavigate:(tab:Tab)=>void;canManage:boolean;darkMode:boolean}){
  const recent=canManage?changes.slice(0,4):[]
  return <>
    <div className="metric-grid">
      <Metric title="META DE GESTIÓN" value={fmt(kpis.management_target)} unit="atenciones" detail="Piso de cumplimiento aplicado" accent="cyan" icon="⌁"/>
      <Metric title="ATENCIONES PLANIFICADAS" value={fmt(kpis.planned_visits)} unit="atenciones" detail={`${fmt(kpis.contracts)} contratos procesados`} accent="blue" icon="◈"/>
      <Metric title="FOJA PROMEDIO" value={percent(kpis.foja)} unit="ocupación" detail="Horas directas / horas contratadas" accent="violet" icon="◉"/>
      <Metric title="CAMBIOS EN ESPERA" value={fmt(kpis.pending_changes)} unit="requieren revisión" detail="Decisión pendiente de aprobación" accent="amber" icon="↻"/>
    </div>
    <div className="overview-grid"><section className="panel chart-panel"><div className="panel-head"><div><h2>Capacidad por instituto</h2><p>Atenciones planificadas y meta de gestión</p></div><span className="chart-legend"><i/> PLANIFICADO <i className="legend-cyan"/> META 90%</span></div><div className="chart-wrap">{chartData.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:10,right:14,left:2,bottom:0}} barGap={3}><CartesianGrid stroke={darkMode?'#354255':'#eeeff1'} vertical={false}/><XAxis dataKey="institute" stroke={darkMode?'#aebacc':'#858995'} tickLine={false} axisLine={false} tickFormatter={value=>String(value).slice(0,9)} angle={-30} textAnchor="end" height={75} interval={0} tick={{fontSize:11}}/><YAxis stroke={darkMode?'#aebacc':'#858995'} tickLine={false} axisLine={false} tickFormatter={fmt} tick={{fontSize:11}}/><Tooltip contentStyle={{background:darkMode?'#202c3b':'#fff',border:darkMode?'1px solid #425066':'1px solid #e7e7eb',borderRadius:8,color:darkMode?'#edf2f8':'#343842'}} formatter={(value)=>fmt(Number(value))}/><Bar dataKey="planned" name="Planificado" fill={darkMode?'#f06478':'#c52131'} radius={[4,4,0,0]} maxBarSize={30}>{chartData.map((_,i)=><Cell key={i} fill={darkMode?(i===0?'#ff7188':'#d94c65'):(i===0?'#ae1f2b':'#d84b55')}/>)}</Bar><Bar dataKey="target" name="Meta 90%" fill={darkMode?'#bd6b7c':'#e8a2a6'} radius={[4,4,0,0]} maxBarSize={30}/></BarChart></ResponsiveContainer>:<div className="empty-state">Sin datos planificados para estos filtros.</div>}</div><div className="chart-foot"><span><b>{chartData.length}</b> institutos en la vista</span><span><b>90%</b> piso actual de gestión</span></div></section>
      <section className="panel changes-panel"><div className="panel-head"><div><h2>{canManage?'Radar de cambios':'Estado de planificación'}</h2><p>{canManage?'Últimos movimientos contractuales':'Consulta de indicadores nacionales'}</p></div>{canManage&&<button className="text-button" onClick={()=>onNavigate('changes')}>VER TODO ↗</button>}</div>{recent.length?<div className="change-feed">{recent.map(c=><div className="feed-item" key={c.id}><div className={`feed-icon ${c.state==='EN_ESPERA'?'pending':''}`}>{changeIcon(c.kind)}</div><div className="feed-copy"><b>{c.kind} <span>· {c.institute||'Nacional'}</span></b><p>PersonaId {c.person_id} · {displayValue(c.previous_value)} → {displayValue(c.new_value)}</p></div><span className={`state-pill ${c.state==='EN_ESPERA'?'wait':''}`}>{c.state==='EN_ESPERA'?'REVISAR':c.state}</span></div>)}</div>:<div className="empty-state">{canManage?'No se han detectado cambios.':'Explora los indicadores y la dotación desde el menú.'}</div>}{canManage&&<button className="button button-ghost full" onClick={()=>onNavigate('changes')}>Abrir bandeja de aprobaciones <span>→</span></button>}</section></div>
    <div className="bottom-strip"><div><span className="strip-icon">◷</span><div><b>{canManage?'PRÓXIMO PASO · CARGA MENSUAL':'VISTA DE CONSULTA'}</b><p>{canManage?'Recibe el BUK en Blue Prism o súbelo desde ingesta para generar una nueva versión.':'Consulta la planificación y sus indicadores desde las secciones disponibles.'}</p></div></div>{canManage&&<button onClick={()=>onNavigate('imports')}>IR A INGESTA <span>→</span></button>}</div>
  </>
}
function Metric({title,value,unit,detail,accent,icon}:{title:string;value:string;unit:string;detail:string;accent:string;icon:string}){return <Card className={`metric-card accent-${accent}`}><div className="metric-top"><span>{title}</span><i>{icon}</i></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-detail"><span/> {detail}</div><div className="metric-glow"/></Card>}
function PeopleTable({rows}:{rows:PlanRow[]}){return <div className="table-scroll"><table><thead><tr><th>PERSONA ID</th><th>INSTITUTO</th><th>ÁREA</th><th>CARGO</th><th>JORNADA</th><th>TRAMO</th><th>ATENCIONES</th><th>META 90%</th><th>FOJA</th><th>ORIGEN</th></tr></thead><tbody>{rows.slice(0,300).map((r,i)=><tr key={`${r.person_id}-${r.month}-${i}`}><td><span className="person-id">{r.person_id}</span></td><td><span className="institute-cell"><i/>{r.institute}</span></td><td>{r.area_code}</td><td>{r.cargo}</td><td>{r.hours_week} h</td><td><span className="band-pill">{r.hours_week>=40?'40+':r.hours_week>=22?'22–40':'<22'}</span></td><td>{fmt((r.direct_visits||0)+(r.indirect_visits||0))}</td><td className="target-cell">{fmt(r.management_target||0)}</td><td>{percent(r.foja||0)}</td><td><span className={`origin-pill ${r.source_kind==='PROYECCION'?'projected':''}`}>{r.source_kind==='PROYECCION'?'Proyección':'BUK'}</span></td></tr>)}</tbody></table>{rows.length>300&&<div className="table-note">Mostrando 300 de {fmt(rows.length)} filas. Usa filtros para acotar.</div>}{!rows.length&&<div className="empty-state">Todavía no hay contratos. Importa el Excel de BUK.</div>}</div>}
function RealizedTable({rows}:{rows:RealizedRow[]}){return <div className="table-scroll"><table><thead><tr><th>PERSONA ID</th><th>INSTITUTO</th><th>PERÍODO</th><th>PLANIFICADO</th><th>REALIZADO</th><th>META 90%</th><th>CUMPLIMIENTO</th><th>ESTADO</th></tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.person_id}-${r.institute}-${i}`}><td><span className="person-id">{r.person_id}</span></td><td>{r.institute}</td><td>{r.month}</td><td>{fmt(r.planned||0)}</td><td>{fmt(r.realized||0)}</td><td>{fmt(r.management_target||0)}</td><td>{percent(r.attainment||0)}</td><td><span className={`state-pill ${r.below_target?'wait':''}`}>{r.below_target?'BAJO META':'EN META'}</span></td></tr>)}</tbody></table>{!rows.length&&<div className="empty-state">Carga un reporte SIC para comparar lo realizado con el plan.</div>}</div>}
function ChangesList({changes,onReview,onImport}:{changes:Change[];onReview:(id:number,a:'aprobar'|'rechazar')=>void;onImport:()=>void}){return <div className="changes-list">{changes.map(c=><article className="change-card" key={c.id}><div className="change-symbol">{changeIcon(c.kind)}</div><div className="change-main"><div className="change-title"><b>{c.kind}</b><span className={`state-pill ${c.state==='EN_ESPERA'?'wait':''}`}>{c.state}</span></div><p>PersonaId <strong>{c.person_id}</strong> · {c.institute||'Nacional'} · rige desde {c.effective_date}</p><div className="change-diff"><span>{displayValue(c.previous_value)}</span><i>→</i><strong>{displayValue(c.new_value)}</strong></div><small>{c.reason}</small></div>{c.state==='EN_ESPERA'&&<div className="review-actions"><button className="button button-approve" onClick={()=>onReview(c.id,'aprobar')}>Aprobar</button><button className="button button-reject" onClick={()=>onReview(c.id,'rechazar')}>Rechazar</button></div>}</article>)}{!changes.length&&<div className="change-empty"><span className="change-empty-icon" aria-hidden="true">✓</span><span className="section-kicker">TODO AL DÍA</span><h3>Sin cambios por revisar</h3><p>Cuando se cargue una nueva dotación BUK, las diferencias contractuales aparecerán aquí para su revisión.</p><button type="button" className="button button-primary" onClick={onImport}>Ir a Ingesta <span aria-hidden="true">→</span></button></div>}</div>}
function roleLabel(role:Role){return {super_admin:'Superadministrador',admin:'Administrador',usuario:'Usuario'}[role]}
function tabLabel(t:Tab){return {overview:'Resumen',people:'Profesionales',changes:'Cambios',realized:'Plan vs real',parameters:'Parámetros',imports:'Ingesta',audit:'Trazabilidad',assistant:'Asistente IA',users:'Usuarios'}[t]}
function pageTitle(t:Tab){return {overview:'Capacidad asistencial',people:'Profesionales',changes:'Centro de decisiones',realized:'Planificado vs realizado',parameters:'Parámetros del motor',imports:'Recepción de datos',audit:'Trazabilidad operativa',assistant:'Asistente inteligente',users:'Gestión de usuarios'}[t]}
function pageDescription(t:Tab){return {overview:'Visión consolidada de planificación, metas y utilización de jornada a nivel nacional.',people:'Explora la dotación y su proyección mensual con filtros por instituto, área y período.',changes:'Revisa diferencias contractuales detectadas antes de aplicar su impacto en la planificación.',realized:'Compara la producción reportada por SIC con las atenciones planificadas y detecta brechas.',parameters:'Ajusta reglas de cálculo y simula su efecto antes de publicar una nueva planificación.',imports:'Carga automatizada de BUK y SIC, con validación de calidad de los datos de entrada.',audit:'Cada carga, aprobación y recálculo deja un rastro visible y asociado a una versión.',assistant:'Un espacio para conversar con los datos cuando integremos el flujo de Blue Prism.',users:'Administra el acceso y los permisos de cada perfil.'}[t]}
function changeIcon(kind:string){return kind==='ALTA'?'＋':kind==='BAJA'?'−':kind==='CARGO'?'◇':'↔'}
export default App
