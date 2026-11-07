import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'

export type UserRole = 'super_admin' | 'admin' | 'usuario'
export type AccountRecord = { id: number; email: string; role: UserRole; created_at: string }
type AccountPayload = { email: string; role: UserRole; password?: string }
type Props = {
  accounts: AccountRecord[]
  activeEmail: string
  onSave: (id: number | null, payload: AccountPayload) => Promise<void>
  onDelete: (account: AccountRecord) => Promise<void>
}

const roleName: Record<UserRole, string> = {
  super_admin: 'Superadministrador', admin: 'Administrador', usuario: 'Usuario',
}

export function UsersPage({accounts,activeEmail,onSave,onDelete}:Props){
  const formRef=useRef<HTMLDivElement>(null)
  const [editing,setEditing]=useState<AccountRecord|null>(null)
  const [email,setEmail]=useState('')
  const [role,setRole]=useState<UserRole>('usuario')
  const [password,setPassword]=useState('')
  const [search,setSearch]=useState('')
  const [busy,setBusy]=useState(false)
  const [deletingId,setDeletingId]=useState<number|null>(null)
  const [feedback,setFeedback]=useState('')
  const [error,setError]=useState('')
  const visible=useMemo(()=>accounts.filter(account=>`${account.email} ${roleName[account.role]}`.toLocaleLowerCase('es-CL').includes(search.toLocaleLowerCase('es-CL'))),[accounts,search])

  function reset(){setEditing(null);setEmail('');setRole('usuario');setPassword('');setError('')}
  function edit(account:AccountRecord){
    setEditing(account);setEmail(account.email);setRole(account.role);setPassword('');setError('');setFeedback('')
    formRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setFeedback('')
    try{
      await onSave(editing?.id??null,{email:email.trim(),role,password:password||undefined})
      setFeedback(editing?'Cuenta actualizada correctamente.':'Cuenta creada correctamente.')
      reset()
    }catch(exc){setError(exc instanceof Error?exc.message:'No se pudo guardar la cuenta.')}
    finally{setBusy(false)}
  }
  async function remove(account:AccountRecord){
    if(account.email===activeEmail)return
    if(!window.confirm(`¿Eliminar la cuenta ${account.email}? Se cerrarán sus sesiones activas.`))return
    setDeletingId(account.id);setError('');setFeedback('')
    try{
      await onDelete(account)
      if(editing?.id===account.id)reset()
      setFeedback('Cuenta eliminada correctamente.')
    }catch(exc){setError(exc instanceof Error?exc.message:'No se pudo eliminar la cuenta.')}
    finally{setDeletingId(null)}
  }

  return <section className="users-page" aria-label="Administración de usuarios">
    <div className="users-hero"><div><span>CONTROL DE ACCESO</span><h2>Personas y permisos</h2><p>Administra quién puede ingresar y qué puede consultar o modificar.</p></div><div className="users-hero-count"><strong>{accounts.length}</strong><small>CUENTAS</small></div></div>
    <div className="users-stats" aria-label="Cuentas por perfil">
      <div><span>SUPERADMINISTRADORES</span><strong>{accounts.filter(item=>item.role==='super_admin').length}</strong></div>
      <div><span>ADMINISTRADORES</span><strong>{accounts.filter(item=>item.role==='admin').length}</strong></div>
      <div><span>USUARIOS</span><strong>{accounts.filter(item=>item.role==='usuario').length}</strong></div>
    </div>
    <div className="users-layout">
      <Card className="users-form panel">
        <div ref={formRef} className="users-form-inner">
          <div className="panel-head"><div><span className="section-kicker">{editing?'EDITAR PERFIL':'NUEVO ACCESO'}</span><h2>{editing?'Modificar cuenta':'Agregar usuario'}</h2><p>{editing?'Actualiza correo, perfil o contraseña.':'Crea una cuenta con los permisos adecuados.'}</p></div><span className="users-form-icon" aria-hidden="true">{editing?'✎':'+'}</span></div>
          <form onSubmit={submit}>
            <label htmlFor="user-email">Correo electrónico<input id="user-email" type="email" value={email} onChange={event=>setEmail(event.target.value)} required placeholder="persona@institucion.cl" autoComplete="email"/></label>
            <label htmlFor="user-role">Perfil<select id="user-role" value={role} onChange={event=>setRole(event.target.value as UserRole)} disabled={editing?.email===activeEmail}><option value="usuario">Usuario · consulta</option><option value="admin">Administrador · operación</option><option value="super_admin">Superadministrador · control total</option></select></label>
            <label htmlFor="user-password">Contraseña {editing&&<small>Opcional al editar</small>}<input id="user-password" type="password" minLength={12} value={password} onChange={event=>setPassword(event.target.value)} required={!editing} autoComplete="new-password" placeholder={editing?'Dejar vacío para conservarla':'Mínimo 12 caracteres'}/></label>
            {editing?.email===activeEmail&&<p className="users-form-note">Si modificas tu propia cuenta, tendrás que iniciar sesión nuevamente.</p>}
            <div className="users-form-actions"><Button type="submit" variant="primary" disabled={busy}>{busy?'Guardando…':editing?'Guardar cambios':'Crear cuenta'} <span aria-hidden="true">→</span></Button>{editing&&<button type="button" className="users-cancel" onClick={reset} disabled={busy}>Cancelar</button>}</div>
          </form>
        </div>
      </Card>
      <Card className="users-list panel">
        <div className="panel-head"><div><span className="section-kicker">DIRECTORIO</span><h2>Cuentas del sistema</h2><p>{visible.length} de {accounts.length} cuentas visibles</p></div></div>
        <label className="users-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por correo o perfil" aria-label="Buscar cuentas"/></label>
        {(feedback||error)&&<p className={`users-feedback ${error?'is-error':''}`} role={error?'alert':'status'}>{error||feedback}</p>}
        <div className="users-rows">{visible.map(account=><article className="user-row" key={account.id}>
          <div className="user-avatar" aria-hidden="true">{account.email.slice(0,2).toUpperCase()}</div>
          <div className="user-info"><strong>{account.email}</strong><span className={`user-role role-${account.role}`}>{roleName[account.role]}</span><small>Alta: {account.created_at?.slice(0,10)||'—'}{account.email===activeEmail?' · Tu cuenta':''}</small></div>
          <div className="user-actions"><button type="button" onClick={()=>edit(account)} disabled={busy||deletingId!==null}>Editar</button><button type="button" className="danger" onClick={()=>void remove(account)} disabled={account.email===activeEmail||busy||deletingId!==null} title={account.email===activeEmail?'No puedes eliminar tu propia cuenta':`Eliminar ${account.email}`}>{deletingId===account.id?'Eliminando…':'Eliminar'}</button></div>
        </article>)}{visible.length===0&&<div className="users-empty">No se encontraron cuentas con esa búsqueda.</div>}</div>
      </Card>
    </div>
  </section>
}
