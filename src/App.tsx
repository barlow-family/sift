import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from './lib/supabase'

type Workspace = { id: string; name: string }
type Dataset = { id: string; name: string }
type Category = { id: string; name: string; category_type: string }
type Exercise = {
  id: string
  name: string
  description: string | null
  is_favorite: boolean
  archived_at: string | null
  categories: string[]
}
type ExerciseDraft = { name: string; description: string; categories: string; isFavorite: boolean }
const emptyDraft: ExerciseDraft = { name: '', description: '', categories: '', isFavorite: false }

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
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  async function loadLibrary(datasetId: string) {
    if (!supabase) return
    const [{ data: itemData, error: itemError }, { data: categoryData, error: categoryError }, { data: linkData, error: linkError }] = await Promise.all([
      supabase.from('items').select('id, name, description, is_favorite, archived_at').eq('dataset_id', datasetId).order('name'),
      supabase.from('categories').select('id, name, category_type').eq('dataset_id', datasetId).order('name'),
      supabase.from('item_categories').select('item_id, category_id').eq('dataset_id', datasetId),
    ])
    if (itemError || categoryError || linkError) {
      setMessage(itemError?.message ?? categoryError?.message ?? linkError?.message ?? 'Could not load your exercise library.')
      return
    }
    const categoryNames = new Map((categoryData ?? []).map((category: Category) => [category.id, category.name]))
    const categoriesByItem = new Map<string, string[]>()
    for (const link of linkData ?? []) {
      const name = categoryNames.get(link.category_id)
      if (name) categoriesByItem.set(link.item_id, [...(categoriesByItem.get(link.item_id) ?? []), name])
    }
    setExercises((itemData ?? []).map(item => ({
      ...item,
      categories: categoriesByItem.get(item.id) ?? [],
    })))
  }

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
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
      const { data: workspaceData, error: workspaceError } = await supabase.from('workspaces').select('id, name').single()
      if (!active) return
      if (workspaceError || !workspaceData) {
        setMessage(workspaceError?.message ?? 'Could not load your workspace.')
        setDataLoading(false)
        return
      }
      setWorkspace(workspaceData)
      const { data: datasetData, error: datasetError } = await supabase.from('datasets').select('id, name').eq('workspace_id', workspaceData.id).eq('key', 'gym').single()
      if (!active) return
      if (datasetError || !datasetData) {
        setMessage(datasetError?.message ?? 'Could not load the Gym collection.')
        setDataLoading(false)
        return
      }
      setDataset(datasetData)
      await loadLibrary(datasetData.id)
      if (active) setDataLoading(false)
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
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) setMessage(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Check your email for a confirmation link, then return here to sign in.')
    setBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  function openNewExercise() {
    setEditingId(null)
    setDraft(emptyDraft)
    setMessage('')
    setEditorOpen(true)
  }

  function openEditExercise(exercise: Exercise) {
    setEditingId(exercise.id)
    setDraft({
      name: exercise.name,
      description: exercise.description ?? '',
      categories: exercise.categories.join(', '),
      isFavorite: exercise.is_favorite,
    })
    setMessage('')
    setEditorOpen(true)
  }

  async function saveExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !dataset) return
    const name = draft.name.trim()
    if (!name) return
    setSaving(true)
    setMessage('')
    const itemPayload = {
      dataset_id: dataset.id,
      name,
      description: draft.description.trim() || null,
      is_favorite: draft.isFavorite,
    }
    const itemResult = editingId
      ? await supabase.from('items').update(itemPayload).eq('id', editingId).select('id').single()
      : await supabase.from('items').insert(itemPayload).select('id').single()
    if (itemResult.error || !itemResult.data) {
      setMessage(itemResult.error?.message ?? 'Could not save this exercise.')
      setSaving(false)
      return
    }
    const itemId = itemResult.data.id
    const categoryNames = [...new Set(draft.categories.split(',').map(value => value.trim()).filter(Boolean))]
    const categoryIds: string[] = []
    for (const categoryName of categoryNames) {
      const { data: existing, error: findError } = await supabase
        .from('categories').select('id').eq('dataset_id', dataset.id).eq('category_type', 'general').ilike('name', categoryName).maybeSingle()
      if (findError) {
        setMessage(findError.message)
        setSaving(false)
        return
      }
      if (existing) categoryIds.push(existing.id)
      else {
        const { data: created, error: createError } = await supabase
          .from('categories').insert({ dataset_id: dataset.id, name: categoryName, category_type: 'general' }).select('id').single()
        if (createError || !created) {
          setMessage(createError?.message ?? 'Could not create a category.')
          setSaving(false)
          return
        }
        categoryIds.push(created.id)
      }
    }
    const { error: clearError } = await supabase.from('item_categories').delete().eq('dataset_id', dataset.id).eq('item_id', itemId)
    if (clearError) {
      setMessage(clearError.message)
      setSaving(false)
      return
    }
    if (categoryIds.length) {
      const { error: linkError } = await supabase.from('item_categories').insert(categoryIds.map(categoryId => ({
        dataset_id: dataset.id, item_id: itemId, category_id: categoryId,
      })))
      if (linkError) {
        setMessage(linkError.message)
        setSaving(false)
        return
      }
    }
    await loadLibrary(dataset.id)
    setEditorOpen(false)
    setSaving(false)
  }

  async function setArchived(exercise: Exercise, archived: boolean) {
    if (!supabase || !dataset) return
    setMessage('')
    const { error } = await supabase.from('items').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', exercise.id)
    if (error) setMessage(error.message)
    else await loadLibrary(dataset.id)
  }

  const visibleExercises = useMemo(() => exercises
    .filter(exercise => showArchived ? Boolean(exercise.archived_at) : !exercise.archived_at)
    .filter(exercise => {
      const query = search.trim().toLowerCase()
      return !query || exercise.name.toLowerCase().includes(query) ||
        (exercise.description ?? '').toLowerCase().includes(query) ||
        exercise.categories.some(category => category.toLowerCase().includes(query))
    })
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name)), [exercises, search, showArchived])

  if (!hasSupabaseConfig) {
    return <main className="center-page"><section className="notice-card"><div className="brand-mark">S</div><p className="eyebrow">SETUP REQUIRED</p><h1>Connect your Supabase project</h1><p className="muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Netlify, then redeploy.</p></section></main>
  }
  if (authLoading) return <main className="center-page"><div className="loading-dot" /><p className="muted">Loading Sift…</p></main>
  if (!session) {
    return <main className="auth-layout">
      <section className="auth-intro">
        <div className="brand"><span className="brand-mark">S</span><span>Sift</span></div>
        <div className="intro-copy"><p className="eyebrow">YOUR TRAINING, ORGANISED</p><h1>A clearer view<br />of your progress.</h1><p>Keep your exercises, routines and working weights organised in one focused space.</p></div>
        <p className="intro-foot">A little more structure. A lot less clutter.</p>
      </section>
      <section className="auth-panel"><div className="auth-card">
        <p className="eyebrow">WELCOME TO SIFT</p><h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
        <p className="muted">{mode === 'login' ? 'Pick up where you left off.' : 'Your own private training workspace.'}</p>
        <form onSubmit={handleAuth}>
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required /></label>
          <button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        {message && <p className="feedback" role="status">{message}</p>}
        <p className="switch-mode">{mode === 'login' ? 'New to Sift?' : 'Already have an account?'} <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      </div></section>
    </main>
  }
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">S</span><span>Sift</span></div><div className="topbar-right"><span className="user-email">{session.user.email}</span><button className="quiet-button" onClick={signOut}>Sign out</button></div></header>
    <section className="dashboard">
      <div className="welcome-row"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>{workspace?.name ?? 'Your training space'}</h1><p className="muted">A focused place for your exercises and routines.</p></div><span className="status-pill"><span /> CONNECTED</span></div>
      {message && <p className="feedback page-feedback" role="status">{message}</p>}
      <div className="section-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{dataset?.name ?? 'Gym'}</h2></div><span className="count-label">{exercises.filter(item => !item.archived_at).length} ACTIVE EXERCISES</span></div>
      <div className="library-toolbar">
        <input className="search-input" type="search" placeholder="Search exercises or categories…" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="toolbar-actions"><button className={showArchived ? 'quiet-button selected-button' : 'quiet-button'} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'View active' : 'Archived'}</button><button className="primary-button add-button" onClick={openNewExercise}>＋ Add exercise</button></div>
      </div>
      {dataLoading ? <div className="empty-state"><div className="loading-dot" /><p>Loading your exercises…</p></div> : visibleExercises.length === 0 ? <div className="empty-state"><div className="empty-icon">＋</div><h3>{showArchived ? 'No archived exercises' : search ? 'No matching exercises' : 'Your exercise library starts here'}</h3><p>{showArchived ? 'Exercises you archive will appear here. You can restore them at any time.' : search ? 'Try another search, or add a new exercise.' : 'Add your exercises, organise them with categories and mark your favourites.'}</p>{!showArchived && !search && <button className="primary-button add-button" onClick={openNewExercise}>Add your first exercise</button>}</div> : <div className="exercise-list">{visibleExercises.map(exercise => <article className="exercise-row" key={exercise.id}>
        <div className="exercise-main"><div className="exercise-title-line"><h3>{exercise.name}</h3>{exercise.is_favorite && <span className="favorite">★ FAVOURITE</span>}</div>{exercise.description && <p>{exercise.description}</p>}{exercise.categories.length > 0 && <div className="category-chips">{exercise.categories.map(category => <span className="category-chip" key={category}>{category}</span>)}</div>}</div>
        <div className="exercise-actions">{showArchived ? <button className="quiet-button" onClick={() => void setArchived(exercise, false)}>Restore</button> : <><button className="quiet-button" onClick={() => openEditExercise(exercise)}>Edit</button><button className="quiet-button archive-button" onClick={() => void setArchived(exercise, true)}>Archive</button></>}</div>
      </article>)}</div>}
    </section>
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditorOpen(false) }}>
      <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="editor-heading"><div><p className="eyebrow">EXERCISE LIBRARY</p><h2 id="editor-title">{editingId ? 'Edit exercise' : 'Add an exercise'}</h2></div><button className="close-button" aria-label="Close" onClick={() => setEditorOpen(false)}>×</button></div>
        <form onSubmit={saveExercise} className="exercise-form">
          <label>Exercise name<input autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Dumbbell bench press" required maxLength={100} /></label>
          <label>Description <span className="optional-label">OPTIONAL</span><textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Add notes about this exercise…" rows={3} maxLength={1000} /></label>
          <label>Categories <span className="optional-label">OPTIONAL · SEPARATE WITH COMMAS</span><input value={draft.categories} onChange={event => setDraft({ ...draft, categories: event.target.value })} placeholder="e.g. Chest, Dumbbells, Push" /></label>
          <label className="favorite-toggle"><input type="checkbox" checked={draft.isFavorite} onChange={event => setDraft({ ...draft, isFavorite: event.target.checked })} /><span>Mark as favourite</span></label>
          <div className="editor-footer"><button type="button" className="quiet-button" onClick={() => setEditorOpen(false)}>Cancel</button><button className="primary-button add-button" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add exercise'}</button></div>
        </form>
      </section>
    </div>}
  </main>
}
