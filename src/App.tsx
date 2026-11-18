import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from './lib/supabase'

type Workspace = { id: string; name: string }
type Dataset = { id: string; name: string }
type Exercise = { id: string; name: string; description: string | null; is_favorite: boolean }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      setWorkspace(null)
      setDataset(null)
      setExercises([])
      return
    }
    let active = true
    async function loadWorkspace() {
      if (!supabase) return
      setDataLoading(true)
      setMessage('')
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id, name')
        .single()
      if (!active) return
      if (workspaceError || !workspaceData) {
        setMessage(workspaceError?.message ?? 'Could not load your workspace.')
        setDataLoading(false)
        return
      }
      setWorkspace(workspaceData)
      const { data: datasetData, error: datasetError } = await supabase
        .from('datasets')
        .select('id, name')
        .eq('workspace_id', workspaceData.id)
        .eq('key', 'gym')
        .single()
      if (!active) return
      if (datasetError || !datasetData) {
        setMessage(datasetError?.message ?? 'Could not load the Gym collection.')
        setDataLoading(false)
        return
      }
      setDataset(datasetData)
      const { data: itemData, error: itemError } = await supabase
        .from('items')
        .select('id, name, description, is_favorite')
        .eq('dataset_id', datasetData.id)
        .is('archived_at', null)
        .order('name')
      if (!active) return
      if (itemError) setMessage(itemError.message)
      else setExercises(itemData ?? [])
      setDataLoading(false)
    }
    void loadWorkspace()
    return () => { active = false }
  }, [session])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage('')
    const result = mode === 'signup'
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) {
      setMessage('Check your email for a confirmation link, then return here to sign in.')
    }
    setBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  if (!hasSupabaseConfig) {
    return <main className="center-page"><section className="notice-card"><div className="brand-mark">S</div><p className="eyebrow">SETUP REQUIRED</p><h1>Connect your Supabase project</h1><p className="muted">The frontend is ready, but the Supabase environment variables haven't reached this deployment yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Netlify, then redeploy.</p></section></main>
  }

  if (authLoading) return <main className="center-page"><div className="loading-dot" /><p className="muted">Loading Sift…</p></main>

  if (!session) {
    return <main className="auth-layout">
      <section className="auth-intro">
        <div className="brand"><span className="brand-mark">S</span><span>Sift</span></div>
        <div className="intro-copy"><p className="eyebrow">YOUR TRAINING, ORGANised</p><h1>A clearer view<br />of your progress.</h1><p>Keep your exercises, routines and working weights organised in one focused space.</p></div>
        <p className="intro-foot">A little more structure. A lot less clutter.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">WELCOME TO SIFT</p>
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          <p className="muted">{mode === 'login' ? 'Pick up where you left off.' : 'Your own private training workspace.'}</p>
          <form onSubmit={handleAuth}>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required /></label>
            <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          {message && <p className="feedback" role="status">{message}</p>}
          <p className="switch-mode">{mode === 'login' ? 'New to Sift?' : 'Already have an account?'} <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
        </div>
      </section>
    </main>
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">S</span><span>Sift</span></div><div className="topbar-right"><span className="user-email">{session.user.email}</span><button className="quiet-button" onClick={signOut}>Sign out</button></div></header>
    <section className="dashboard">
      <div className="welcome-row"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>{workspace?.name ?? 'Your training space'}</h1><p className="muted">A focused place for your exercises and routines.</p></div><span className="status-pill"><span /> CONNECTED</span></div>
      {message && <p className="feedback">{message}</p>}
      <div className="section-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{dataset?.name ?? 'Gym'}</h2></div><span className="count-label">{exercises.length} EXERCISES</span></div>
      {dataLoading ? <div className="empty-state"><div className="loading-dot" /><p>Loading your exercises…</p></div> : exercises.length === 0 ? <div className="empty-state"><div className="empty-icon">＋</div><h3>Your exercise library starts here</h3><p>Once we add exercise management, you'll be able to build your catalogue, organise categories and create reusable routines.</p></div> : <div className="exercise-list">{exercises.map(exercise => <article className="exercise-row" key={exercise.id}><div><h3>{exercise.name}</h3>{exercise.description && <p>{exercise.description}</p>}</div>{exercise.is_favorite && <span className="favorite">FAVOURITE</span>}</article>)}</div>}
    </section>
  </main>
}