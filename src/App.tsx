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
  attributes: { avoid?: boolean }
  archived_at: string | null
  categories: string[]
}
type Routine = { id: string; name: string; description: string | null }
type RoutineLink = { routine_id: string; item_id: string; position: number }
type ExerciseDraft = { name: string; description: string; categories: string; isFavorite: boolean; isAvoided: boolean; weightMode: 'single' | 'range'; weight: string; weightLow: string; weightHigh: string }
type WeightHistoryEntry = { id: string; value_key: string; numeric_value: number; unit: string; changed_at: string }
const emptyDraft: ExerciseDraft = { name: '', description: '', categories: '', isFavorite: false, isAvoided: false, weightMode: 'single', weight: '', weightLow: '', weightHigh: '' }
const KG_PER_LB = 0.45359237
const displayWeight = (kg: number, unit: 'kg' | 'lb') => unit === 'kg' ? kg : kg / KG_PER_LB
const storedWeight = (value: number, unit: 'kg' | 'lb') => unit === 'kg' ? value : value * KG_PER_LB

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
  const [weights, setWeights] = useState<Record<string, { mode: 'single' | 'range'; low: number; high?: number }>>({})
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [historyExercise, setHistoryExercise] = useState<Exercise | null>(null)
  const [weightHistory, setWeightHistory] = useState<WeightHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEditingId, setHistoryEditingId] = useState<string | null>(null)
  const [historyEditValue, setHistoryEditValue] = useState('')
  const [historySaving, setHistorySaving] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [exerciseCategoryFilter, setExerciseCategoryFilter] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [avoidOnly, setAvoidOnly] = useState(false)
  const [routineSearch, setRoutineSearch] = useState('')
  const [routineCategoryFilter, setRoutineCategoryFilter] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [activeView, setActiveView] = useState<'exercises' | 'routines'>('exercises')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [routineLinks, setRoutineLinks] = useState<RoutineLink[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null)
  const [routineName, setRoutineName] = useState('')
  const [routineDescription, setRoutineDescription] = useState('')
  const [routineEditorOpen, setRoutineEditorOpen] = useState(false)
  const [routineEditingId, setRoutineEditingId] = useState<string | null>(null)
  const [routineExerciseId, setRoutineExerciseId] = useState('')
  const [routineSaving, setRoutineSaving] = useState(false)

  async function loadLibrary(datasetId: string) {
    if (!supabase) return
    const [{ data: itemData, error: itemError }, { data: categoryData, error: categoryError }, { data: linkData, error: linkError }, { data: weightData, error: weightError }] = await Promise.all([
      supabase.from('items').select('id, name, description, is_favorite, attributes, archived_at').eq('dataset_id', datasetId).order('name'),
      supabase.from('categories').select('id, name, category_type').eq('dataset_id', datasetId).order('name'),
      supabase.from('item_categories').select('item_id, category_id').eq('dataset_id', datasetId),
      supabase.from('item_values').select('item_id, value_key, numeric_value').in('value_key', ['current_weight', 'current_weight_low', 'current_weight_high']),
    ])
    if (itemError || categoryError || linkError || weightError) {
      setMessage(itemError?.message ?? categoryError?.message ?? linkError?.message ?? weightError?.message ?? 'Could not load your exercise library.')
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
    const groupedWeights = new Map<string, Record<string, number>>()
    for (const value of weightData ?? []) groupedWeights.set(value.item_id, { ...(groupedWeights.get(value.item_id) ?? {}), [value.value_key]: Number(value.numeric_value) })
    setWeights(Object.fromEntries([...groupedWeights.entries()].map(([id, values]) => [id, values.current_weight_low !== undefined ? { mode: 'range' as const, low: values.current_weight_low, high: values.current_weight_high } : { mode: 'single' as const, low: values.current_weight ?? 0 }])))
    await loadRoutines(datasetId)
  }

  async function loadRoutines(datasetId: string) {
    if (!supabase) return
    const [r, l] = await Promise.all([supabase.from('routines').select('id, name, description').eq('dataset_id', datasetId).order('name'), supabase.from('routine_items').select('routine_id, item_id, position').eq('dataset_id', datasetId).order('position')])
    if (r.error || l.error) { setMessage(r.error?.message ?? l.error?.message ?? 'Could not load routines.'); return }
    setRoutines(r.data ?? []); setRoutineLinks(l.data ?? [])
    if (r.data?.length && !r.data.some(item => item.id === selectedRoutineId)) setSelectedRoutineId(r.data[0].id)
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
      setWeights({})
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
      const { data: settingsData, error: settingsError } = await supabase.from('workspace_settings').select('preferred_weight_unit').eq('workspace_id', workspaceData.id).single()
      if (!active) return
      if (settingsError) setMessage(settingsError.message)
      else setWeightUnit(settingsData.preferred_weight_unit === 'lb' ? 'lb' : 'kg')
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
    setDraft({ ...emptyDraft, weight: '' })
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
      isAvoided: Boolean(exercise.attributes?.avoid),
      weightMode: weights[exercise.id]?.mode ?? 'single',
      weight: weights[exercise.id]?.mode === 'single' ? String(Number(displayWeight(weights[exercise.id].low, weightUnit).toFixed(2))) : '',
      weightLow: weights[exercise.id]?.mode === 'range' ? String(Number(displayWeight(weights[exercise.id].low, weightUnit).toFixed(2))) : '',
      weightHigh: weights[exercise.id]?.mode === 'range' && weights[exercise.id].high !== undefined ? String(Number(displayWeight(weights[exercise.id].high!, weightUnit).toFixed(2))) : '',
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
      attributes: { ...(editingId ? exercises.find(item => item.id === editingId)?.attributes : {}), avoid: draft.isAvoided },
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
    const entries: { item_id: string; value_key: string; numeric_value: number; unit: string }[] = []
    const addWeight = (key: string, raw: string) => {
      const value = Number(raw)
      if (!raw.trim() || !Number.isFinite(value) || value < 0) return false
      entries.push({ item_id: itemId, value_key: key, numeric_value: Number(storedWeight(value, weightUnit).toFixed(4)), unit: 'kg' })
      return true
    }
    if (draft.weightMode === 'single') {
      if (draft.weight.trim() && !addWeight('current_weight', draft.weight)) { setMessage('Enter a valid weight of zero or more.'); setSaving(false); return }
      const { error: clearRangeError } = await supabase.from('item_values').delete().eq('item_id', itemId).in('value_key', ['current_weight_low', 'current_weight_high'])
      if (clearRangeError) { setMessage(clearRangeError.message); setSaving(false); return }
      if (entries.length) {
        const { error } = await supabase.from('item_values').upsert(entries, { onConflict: 'item_id,value_key' })
        if (error) { setMessage(error.message); setSaving(false); return }
      } else {
        const { error } = await supabase.from('item_values').delete().eq('item_id', itemId).eq('value_key', 'current_weight')
        if (error) { setMessage(error.message); setSaving(false); return }
      }
    } else {
      if (!addWeight('current_weight_low', draft.weightLow) || !addWeight('current_weight_high', draft.weightHigh)) { setMessage('Enter both a valid low and high weight.'); setSaving(false); return }
      if (entries[0].numeric_value > entries[1].numeric_value) { setMessage('The low value must be less than or equal to the high value.'); setSaving(false); return }
      const { error: clearSingleError } = await supabase.from('item_values').delete().eq('item_id', itemId).eq('value_key', 'current_weight')
      if (clearSingleError) { setMessage(clearSingleError.message); setSaving(false); return }
      const { error } = await supabase.from('item_values').upsert(entries, { onConflict: 'item_id,value_key' })
      if (error) { setMessage(error.message); setSaving(false); return }
    }
    await loadLibrary(dataset.id)
    setEditorOpen(false)
    setSaving(false)
  }

  async function changeWeightUnit(nextUnit: 'kg' | 'lb') {
    if (!supabase || !workspace || nextUnit === weightUnit) return
    const { error } = await supabase.from('workspace_settings').update({ preferred_weight_unit: nextUnit }).eq('workspace_id', workspace.id)
    if (error) setMessage(error.message)
    else setWeightUnit(nextUnit)
  }

  async function openWeightHistory(exercise: Exercise) {
    if (!supabase) return
    setHistoryExercise(exercise)
    setHistoryLoading(true)
    setWeightHistory([])
    const { data, error } = await supabase.from('item_value_history').select('id, value_key, numeric_value, unit, changed_at').eq('item_id', exercise.id).in('value_key', ['current_weight', 'current_weight_low', 'current_weight_high']).order('changed_at', { ascending: false })
    if (error) setMessage(error.message)
    else setWeightHistory((data ?? []) as WeightHistoryEntry[])
    setHistoryLoading(false)
  }

  async function saveHistoricalWeight(entryId: string) {
    if (!supabase || !historyEditValue.trim()) return
    const value = Number(historyEditValue)
    if (!Number.isFinite(value) || value < 0) { setMessage('Enter a valid weight of zero or more.'); return }
    setHistorySaving(true)
    const { error } = await supabase.from('item_value_history').update({ numeric_value: Number(storedWeight(value, weightUnit).toFixed(4)), unit: 'kg' }).eq('id', entryId)
    if (error) setMessage(error.message)
    else {
      setWeightHistory(current => current.map(entry => entry.id === entryId ? { ...entry, numeric_value: Number(storedWeight(value, weightUnit).toFixed(4)), unit: 'kg' } : entry))
      setHistoryEditingId(null)
    }
    setHistorySaving(false)
  }

  async function deleteHistoricalWeight(entryId: string) {
    if (!supabase || !window.confirm('Delete this historical weight entry?')) return
    const { error } = await supabase.from('item_value_history').delete().eq('id', entryId)
    if (error) setMessage(error.message)
    else setWeightHistory(current => current.filter(entry => entry.id !== entryId))
  }

  function openRoutine(routine?: Routine) {
    setRoutineEditingId(routine?.id ?? null); setRoutineName(routine?.name ?? ''); setRoutineDescription(routine?.description ?? ''); setRoutineEditorOpen(true)
  }
  async function saveRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !dataset || !routineName.trim()) return; setRoutineSaving(true)
    const payload = { dataset_id: dataset.id, name: routineName.trim(), description: routineDescription.trim() || null }
    const result = routineEditingId ? await supabase.from('routines').update(payload).eq('id', routineEditingId).select('id').single() : await supabase.from('routines').insert(payload).select('id').single()
    if (result.error || !result.data) setMessage(result.error?.message ?? 'Could not save routine.')
    else { await loadRoutines(dataset.id); setSelectedRoutineId(result.data.id); setRoutineEditorOpen(false) }
    setRoutineSaving(false)
  }
  async function deleteRoutine(routine: Routine) {
    if (!supabase || !dataset || !window.confirm('Delete this routine? Exercises themselves will not be deleted.')) return
    const { error } = await supabase.from('routines').delete().eq('id', routine.id)
    if (error) setMessage(error.message); else { setSelectedRoutineId(null); await loadRoutines(dataset.id) }
  }
  async function addRoutineExercise() {
    if (!supabase || !dataset || !selectedRoutineId || !routineExerciseId) return
    const current = routineLinks.filter(link => link.routine_id === selectedRoutineId)
    if (current.some(link => link.item_id === routineExerciseId)) return
    const { error } = await supabase.from('routine_items').insert({ dataset_id: dataset.id, routine_id: selectedRoutineId, item_id: routineExerciseId, position: current.length })
    if (error) setMessage(error.message); else { setRoutineExerciseId(''); await loadRoutines(dataset.id) }
  }
  async function reorderRoutine(ids: string[]) {
    if (!supabase || !dataset || !selectedRoutineId) return
    const current = routineLinks.filter(link => link.routine_id === selectedRoutineId)
    for (const link of current) {
      const { error } = await supabase.from('routine_items').update({ position: link.position + 100000 }).eq('routine_id', selectedRoutineId).eq('item_id', link.item_id)
      if (error) { setMessage(error.message); return }
    }
    for (let position = 0; position < ids.length; position++) {
      const { error } = await supabase.from('routine_items').update({ position }).eq('routine_id', selectedRoutineId).eq('item_id', ids[position])
      if (error) { setMessage(error.message); return }
    }
    await loadRoutines(dataset.id)
  }
  async function moveRoutineExercise(itemId: string, direction: number) {
    const ordered = routineLinks.filter(link => link.routine_id === selectedRoutineId).sort((a,b) => a.position-b.position).map(link => link.item_id)
    const i = ordered.indexOf(itemId); const j = i + direction; if (i < 0 || j < 0 || j >= ordered.length) return
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]; await reorderRoutine(ordered)
  }
  async function removeRoutineExercise(itemId: string) {
    const ids = routineLinks.filter(link => link.routine_id === selectedRoutineId && link.item_id !== itemId).sort((a,b) => a.position-b.position).map(link => link.item_id)
    await reorderRoutine(ids)
  }

  async function setArchived(exercise: Exercise, archived: boolean) {
    if (!supabase || !dataset) return
    setMessage('')
    const { error } = await supabase.from('items').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', exercise.id)
    if (error) setMessage(error.message)
    else await loadLibrary(dataset.id)
  }

  const exerciseCategories = useMemo(() => [...new Set(exercises.flatMap(exercise => exercise.categories))].sort((a, b) => a.localeCompare(b)), [exercises])
  const visibleExercises = useMemo(() => exercises
    .filter(exercise => showArchived ? Boolean(exercise.archived_at) : !exercise.archived_at)
    .filter(exercise => !exerciseCategoryFilter || exercise.categories.includes(exerciseCategoryFilter))
    .filter(exercise => !favoritesOnly || exercise.is_favorite)
    .filter(exercise => !avoidOnly || Boolean(exercise.attributes?.avoid))
    .filter(exercise => {
      const query = search.trim().toLowerCase()
      return !query || exercise.name.toLowerCase().includes(query) ||
        (exercise.description ?? '').toLowerCase().includes(query) ||
        exercise.categories.some(category => category.toLowerCase().includes(query))
    })
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name)), [exercises, search, showArchived, exerciseCategoryFilter, favoritesOnly, avoidOnly])

  const filteredRoutines = useMemo(() => routines.filter(routine => {
    const query = routineSearch.trim().toLowerCase()
    const linkedExercises = routineLinks.filter(link => link.routine_id === routine.id).map(link => exercises.find(exercise => exercise.id === link.item_id)).filter((exercise): exercise is Exercise => Boolean(exercise))
    const matchesQuery = !query || routine.name.toLowerCase().includes(query) || (routine.description ?? '').toLowerCase().includes(query) || linkedExercises.some(exercise => exercise.name.toLowerCase().includes(query) || exercise.categories.some(category => category.toLowerCase().includes(query)))
    const matchesCategory = !routineCategoryFilter || linkedExercises.some(exercise => exercise.categories.includes(routineCategoryFilter))
    return matchesQuery && matchesCategory
  }), [routines, routineLinks, exercises, routineSearch, routineCategoryFilter])

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
      <div className="view-tabs"><button className={activeView === 'exercises' ? 'view-tab active' : 'view-tab'} onClick={() => setActiveView('exercises')}>Exercises</button><button className={activeView === 'routines' ? 'view-tab active' : 'view-tab'} onClick={() => setActiveView('routines')}>Routines</button></div>
      {activeView === 'exercises' && <>
      <div className="section-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{dataset?.name ?? 'Gym'}</h2></div><div className="unit-setting"><span>WEIGHT UNIT</span><select value={weightUnit} onChange={event => void changeWeightUnit(event.target.value as 'kg' | 'lb')} aria-label="Preferred weight unit"><option value="kg">kg</option><option value="lb">lb</option></select><span className="count-label">{exercises.filter(item => !item.archived_at).length} ACTIVE EXERCISES</span></div></div>
      <div className="library-toolbar">
        <input className="search-input" type="search" placeholder="Search exercises or categories…" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="toolbar-actions"><select className="filter-select" aria-label="Filter by category" value={exerciseCategoryFilter} onChange={event => setExerciseCategoryFilter(event.target.value)}><option value="">All categories</option>{exerciseCategories.map(category => <option key={category} value={category}>{category}</option>)}</select><button className={favoritesOnly ? 'quiet-button selected-button' : 'quiet-button'} onClick={() => setFavoritesOnly(!favoritesOnly)}>★ Favourites</button><button className={avoidOnly ? 'quiet-button selected-button' : 'quiet-button'} onClick={() => setAvoidOnly(!avoidOnly)}>Avoid</button><button className={showArchived ? 'quiet-button selected-button' : 'quiet-button'} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'View active' : 'Archived'}</button><button className="primary-button add-button" onClick={openNewExercise}>＋ Add exercise</button></div>
      </div>
      {dataLoading ? <div className="empty-state"><div className="loading-dot" /><p>Loading your exercises…</p></div> : visibleExercises.length === 0 ? <div className="empty-state"><div className="empty-icon">＋</div><h3>{showArchived ? 'No archived exercises' : search ? 'No matching exercises' : 'Your exercise library starts here'}</h3><p>{showArchived ? 'Exercises you archive will appear here. You can restore them at any time.' : search ? 'Try another search, or add a new exercise.' : 'Add your exercises, organise them with categories and mark your favourites.'}</p>{!showArchived && !search && <button className="primary-button add-button" onClick={openNewExercise}>Add your first exercise</button>}</div> : <div className="exercise-list">{visibleExercises.map(exercise => <article className="exercise-row" key={exercise.id}>
        <div className="exercise-main"><div className="exercise-title-line"><h3>{exercise.name}</h3>{exercise.is_favorite && <span className="favorite">★ FAVOURITE</span>}{exercise.attributes?.avoid && <span className="avoid-label">AVOID</span>}</div>{weights[exercise.id] !== undefined && <p className="current-weight">{weights[exercise.id].mode === 'range' ? `${displayWeight(weights[exercise.id].low, weightUnit).toFixed(2).replace(/\.00$/, '')}–${displayWeight(weights[exercise.id].high ?? weights[exercise.id].low, weightUnit).toFixed(2).replace(/\.00$/, '')}` : displayWeight(weights[exercise.id].low, weightUnit).toFixed(2).replace(/\.00$/, '')} {weightUnit} <span>CURRENT WEIGHT</span></p>}{exercise.description && <p>{exercise.description}</p>}{exercise.categories.length > 0 && <div className="category-chips">{exercise.categories.map(category => <span className="category-chip" key={category}>{category}</span>)}</div>}</div>
        <div className="exercise-actions">{showArchived ? <button className="quiet-button" onClick={() => void setArchived(exercise, false)}>Restore</button> : <><button className="quiet-button" onClick={() => void openWeightHistory(exercise)}>History</button><button className="quiet-button" onClick={() => openEditExercise(exercise)}>Edit</button><button className="quiet-button archive-button" onClick={() => void setArchived(exercise, true)}>Archive</button></>}</div>
      </article>)}</div>}
      </>}
      {activeView === 'routines' && <section className="routines-section"><div className="section-heading"><div><p className="eyebrow">YOUR TRAINING PLANS</p><h2>Routines</h2><p className="muted">Reusable collections of exercises, arranged in your preferred order.</p></div><button className="primary-button add-button" onClick={() => openRoutine()}>＋ New routine</button></div>
        {routines.length === 0 ? <div className="empty-state"><h3>No routines yet</h3><p>Create a routine, then add exercises from your Gym library.</p><button className="primary-button add-button" onClick={() => openRoutine()}>Create routine</button></div> : <><div className="routine-filters"><input className="search-input" type="search" placeholder="Search routines or exercises…" value={routineSearch} onChange={event => setRoutineSearch(event.target.value)} /><select className="filter-select" aria-label="Filter routines by exercise category" value={routineCategoryFilter} onChange={event => setRoutineCategoryFilter(event.target.value)}><option value="">All exercise categories</option>{exerciseCategories.map(category => <option key={category} value={category}>{category}</option>)}</select><button className="quiet-button" onClick={() => { setRoutineSearch(''); setRoutineCategoryFilter('') }}>Clear filters</button></div>{filteredRoutines.length === 0 ? <div className="empty-state compact-empty"><p>No routines match these filters.</p></div> : <div className="routine-layout"><aside className="routine-sidebar">{filteredRoutines.map(r => <button key={r.id} className={selectedRoutineId === r.id ? 'routine-choice chosen' : 'routine-choice'} onClick={() => setSelectedRoutineId(r.id)}><strong>{r.name}</strong><span>{routineLinks.filter(l => l.routine_id === r.id).length} exercises</span></button>)}</aside><div className="routine-detail">{(() => { const selected = routines.find(r => r.id === selectedRoutineId); const allLinks = routineLinks.filter(l => l.routine_id === selectedRoutineId).sort((a,b) => a.position-b.position); const links = routineCategoryFilter ? allLinks.filter(link => exercises.find(exercise => exercise.id === link.item_id)?.categories.includes(routineCategoryFilter)) : allLinks; const available = exercises.filter(e => !e.archived_at && !allLinks.some(l => l.item_id === e.id)); return selected ? <><div className="routine-detail-heading"><div><h3>{selected.name}</h3>{selected.description && <p className="muted">{selected.description}</p>}</div><div className="toolbar-actions"><button className="quiet-button" onClick={() => openRoutine(selected)}>Edit</button><button className="quiet-button archive-button" onClick={() => void deleteRoutine(selected)}>Delete</button></div></div><div className="add-to-routine"><select value={routineExerciseId} onChange={e => setRoutineExerciseId(e.target.value)}><option value="">Choose an exercise…</option>{available.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><button className="primary-button add-button" disabled={!routineExerciseId} onClick={() => void addRoutineExercise()}>Add</button></div>{links.length === 0 ? <div className="empty-state compact-empty"><p>No exercises in this routine yet.</p></div> : <div className="exercise-list">{links.map((link,index) => { const exercise = exercises.find(e => e.id === link.item_id); return exercise ? <article className="exercise-row" key={link.item_id}><div className="routine-position">{index+1}</div><div className="exercise-main"><h3>{exercise.name}</h3></div><div className="exercise-actions">{!routineCategoryFilter && <><button className="quiet-button" disabled={index===0} onClick={() => void moveRoutineExercise(link.item_id,-1)}>↑</button><button className="quiet-button" disabled={index===links.length-1} onClick={() => void moveRoutineExercise(link.item_id,1)}>↓</button></>}<button className="quiet-button archive-button" onClick={() => void removeRoutineExercise(link.item_id)}>Remove</button></div></article> : null })}</div>}</> : <p className="muted">Select a routine.</p> })()}</div></div>}</>}
      </section>}
    </section>
    {routineEditorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setRoutineEditorOpen(false) }}><section className="editor-card" role="dialog" aria-modal="true"><div className="editor-heading"><div><p className="eyebrow">ROUTINE BUILDER</p><h2>{routineEditingId ? 'Edit routine' : 'Create routine'}</h2></div><button className="close-button" onClick={() => setRoutineEditorOpen(false)}>×</button></div><form className="exercise-form" onSubmit={saveRoutine}><label>Routine name<input autoFocus value={routineName} onChange={e => setRoutineName(e.target.value)} placeholder="e.g. Upper body" required maxLength={100}/></label><label>Description <span className="optional-label">OPTIONAL</span><textarea rows={3} value={routineDescription} onChange={e => setRoutineDescription(e.target.value)} placeholder="What is this routine for?"/></label><div className="editor-footer"><button type="button" className="quiet-button" onClick={() => setRoutineEditorOpen(false)}>Cancel</button><button className="primary-button add-button" disabled={routineSaving}>{routineSaving ? 'Saving…' : 'Save routine'}</button></div></form></section></div>}
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditorOpen(false) }}>
      <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="editor-heading"><div><p className="eyebrow">EXERCISE LIBRARY</p><h2 id="editor-title">{editingId ? 'Edit exercise' : 'Add an exercise'}</h2></div><button className="close-button" aria-label="Close" onClick={() => setEditorOpen(false)}>×</button></div>
        <form onSubmit={saveExercise} className="exercise-form">
          <label>Exercise name<input autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Dumbbell bench press" required maxLength={100} /></label>
          <label>Description <span className="optional-label">OPTIONAL</span><textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Add notes about this exercise…" rows={3} maxLength={1000} /></label>
          <label>Categories <span className="optional-label">OPTIONAL · SEPARATE WITH COMMAS</span><input value={draft.categories} onChange={event => setDraft({ ...draft, categories: event.target.value })} placeholder="e.g. Chest, Dumbbells, Push" /></label>
          <label>Current weight <span className="optional-label">OPTIONAL · {weightUnit.toUpperCase()}</span><select className="filter-select" value={draft.weightMode} onChange={event => setDraft({ ...draft, weightMode: event.target.value as 'single' | 'range' })}><option value="single">Single value</option><option value="range">Range</option></select>{draft.weightMode === 'single' ? <input type="number" min="0" step="0.01" value={draft.weight} onChange={event => setDraft({ ...draft, weight: event.target.value })} placeholder={`Enter weight in ${weightUnit}`} /> : <div className="weight-range-inputs"><input aria-label={`Low weight in ${weightUnit}`} type="number" min="0" step="0.01" value={draft.weightLow} onChange={event => setDraft({ ...draft, weightLow: event.target.value })} placeholder="Low value" /><span>to</span><input aria-label={`High weight in ${weightUnit}`} type="number" min="0" step="0.01" value={draft.weightHigh} onChange={event => setDraft({ ...draft, weightHigh: event.target.value })} placeholder="High value" /></div>}</label>
          <label className="favorite-toggle"><input type="checkbox" checked={draft.isFavorite} onChange={event => setDraft({ ...draft, isFavorite: event.target.checked })} /><span>Mark as favourite</span></label>
          <label className="favorite-toggle"><input type="checkbox" checked={draft.isAvoided} onChange={event => setDraft({ ...draft, isAvoided: event.target.checked })} /><span>Mark as Avoid</span></label>
          <div className="editor-footer"><button type="button" className="quiet-button" onClick={() => setEditorOpen(false)}>Cancel</button><button className="primary-button add-button" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add exercise'}</button></div>
        </form>
      </section>
    </div>}
    {historyExercise && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryExercise(null) }}>
      <section className="editor-card history-card" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="editor-heading"><div><p className="eyebrow">WEIGHT TRACKING</p><h2 id="history-title">{historyExercise.name}</h2><p className="muted">Recorded weight changes</p></div><button className="close-button" aria-label="Close history" onClick={() => setHistoryExercise(null)}>×</button></div>
        {historyLoading ? <div className="empty-state"><div className="loading-dot" /><p>Loading history…</p></div> : weightHistory.length === 0 ? <div className="empty-state"><p>No weight changes recorded yet.</p></div> : <div className="history-list">{weightHistory.map(entry => <div className="history-entry" key={entry.id}><div className="history-entry-info">{historyEditingId === entry.id ? <input className="history-edit-input" type="number" min="0" step="0.01" value={historyEditValue} onChange={event => setHistoryEditValue(event.target.value)} aria-label="Correct historical weight" /> : <strong>{entry.value_key === 'current_weight_low' ? 'Low: ' : entry.value_key === 'current_weight_high' ? 'High: ' : ''}{displayWeight(Number(entry.numeric_value), weightUnit).toFixed(2).replace(/\.00$/, '')} {weightUnit}</strong>}<span>{new Date(entry.changed_at).toLocaleString()}</span></div><div className="history-entry-actions">{historyEditingId === entry.id ? <><button className="quiet-button" disabled={historySaving} onClick={() => void saveHistoricalWeight(entry.id)}>{historySaving ? 'Saving…' : 'Save'}</button><button className="quiet-button" onClick={() => setHistoryEditingId(null)}>Cancel</button></> : <><button className="quiet-button" onClick={() => { setHistoryEditingId(entry.id); setHistoryEditValue(String(Number(displayWeight(Number(entry.numeric_value), weightUnit).toFixed(2)))) }}>Edit</button><button className="quiet-button archive-button" onClick={() => void deleteHistoricalWeight(entry.id)}>Delete</button></>}</div></div>)}</div>}
        <div className="editor-footer"><button className="quiet-button" onClick={() => setHistoryExercise(null)}>Close</button></div>
      </section>
    </div>}
  </main>
}
