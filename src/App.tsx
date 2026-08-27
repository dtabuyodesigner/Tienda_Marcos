import { FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) setError('No se pudo iniciar sesión. Revisa tus datos.')
    setLoading(false)
  }

  if (loading) return <main className="shell"><p>Cargando sesión...</p></main>
  if (session) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">La Libreta de Marcos</p>
          <h1>Sesión activa</h1>
          <p className="muted">{session.user.email}</p>
          <button onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">La Libreta de Marcos</p>
        <h1>Iniciar sesión</h1>
        <form onSubmit={handleLogin}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>Entrar</button>
        </form>
      </section>
    </main>
  )
}