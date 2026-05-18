import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Eye,
  FilePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  previewAdhoc,
  updateTemplate,
} from '@/services/templateService'
import type { Template, TemplateCategory, TemplateCreate, VariableDefinition } from '@/types/template'

// ---------------------------------------------------------------------------
// Jinja2 keyword highlighting
// ---------------------------------------------------------------------------

function highlightJinja(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped
    .replace(/(\{\{.*?\}\})/g, '<span class="text-yellow-300">$1</span>')
    .replace(/(\{%-?.*?-?%\})/g, '<span class="text-blue-300">$1</span>')
    .replace(/(\{#.*?#\})/g, '<span class="text-gray-500 italic">$1</span>')
}

// ---------------------------------------------------------------------------
// Code editor with overlay highlighting
// ---------------------------------------------------------------------------

function CodeEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  function syncScroll() {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop
      preRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  return (
    <div className="relative font-mono text-sm leading-relaxed h-full">
      <pre
        ref={preRef}
        aria-hidden
        className="absolute inset-0 p-3 text-gray-100 whitespace-pre overflow-hidden pointer-events-none select-none"
        dangerouslySetInnerHTML={{ __html: highlightJinja(value) + '\n' }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        className="absolute inset-0 w-full h-full p-3 bg-transparent text-transparent caret-white resize-none outline-none font-mono text-sm leading-relaxed"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category badge
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  vlan: 'bg-purple-900/50 text-purple-300',
  interface: 'bg-blue-900/50 text-blue-300',
  acl: 'bg-red-900/50 text-red-300',
  ntp: 'bg-green-900/50 text-green-300',
  snmp: 'bg-orange-900/50 text-orange-300',
  custom: 'bg-gray-800 text-gray-400',
}

function CategoryBadge({ category }: { category: TemplateCategory }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium uppercase ${CATEGORY_COLORS[category]}`}>
      {category}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Variable row editor
// ---------------------------------------------------------------------------

function VariableRow({
  variable,
  onChange,
  onRemove,
}: {
  variable: VariableDefinition
  onChange: (v: VariableDefinition) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-[1fr_100px_80px_1fr_auto] gap-2 items-center py-2 border-b border-gray-800 last:border-0">
      <input
        className="input-sm"
        value={variable.name}
        onChange={(e) => onChange({ ...variable, name: e.target.value })}
        placeholder="variable_name"
      />
      <select
        className="input-sm"
        value={variable.type}
        onChange={(e) => onChange({ ...variable, type: e.target.value as VariableDefinition['type'] })}
      >
        <option value="string">string</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="list">list</option>
      </select>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={variable.required}
          onChange={(e) => onChange({ ...variable, required: e.target.checked })}
          className="accent-brand-500"
        />
        req.
      </label>
      <input
        className="input-sm"
        value={variable.default ?? ''}
        onChange={(e) => onChange({ ...variable, default: e.target.value || null })}
        placeholder="default"
      />
      <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template editor modal
// ---------------------------------------------------------------------------

const EMPTY_VARIABLE = (): VariableDefinition => ({
  name: '',
  type: 'string',
  required: true,
  default: null,
  description: null,
})

const CATEGORIES: TemplateCategory[] = ['vlan', 'interface', 'acl', 'ntp', 'snmp', 'custom']

type Tab = 'editor' | 'variables' | 'preview'

function TemplateModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Template | null
  onSave: (t: Template) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<TemplateCategory>(initial?.category ?? 'custom')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [variables, setVariables] = useState<VariableDefinition[]>(
    initial?.variables ?? [],
  )
  const [tab, setTab] = useState<Tab>('editor')
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({})
  const [previewResult, setPreviewResult] = useState<{ rendered: string; errors: string[] } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDetectVars() {
    try {
      const res = await previewAdhoc({ content, variable_values: {} })
      const existing = new Set(variables.map((v) => v.name))
      const newVars = res.variables_found
        .filter((n) => !existing.has(n))
        .map((name) => ({ ...EMPTY_VARIABLE(), name }))
      setVariables((prev) => [...prev, ...newVars])
    } catch {}
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewResult(null)
    try {
      const res = await previewAdhoc({ content, variable_values: previewValues })
      setPreviewResult({ rendered: res.rendered, errors: res.errors })
    } catch (e: any) {
      setPreviewResult({ rendered: '', errors: [e?.response?.data?.detail ?? 'Preview failed'] })
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload: TemplateCreate = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        content,
        variables,
      }
      let result: Template
      if (initial) {
        result = await updateTemplate(initial.id, payload)
      } else {
        result = await createTemplate(payload)
      }
      onSave(result)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/70">
      <div className="flex flex-col w-full bg-gray-950 border-l border-gray-800">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <input
              className="flex-1 bg-transparent text-white text-lg font-semibold outline-none placeholder:text-gray-600 min-w-0"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
            />
            <select
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 outline-none"
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !content.trim()}
            className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-5 py-2 bg-red-900/30 border-b border-red-800 text-red-300 text-sm shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Description */}
        <div className="px-5 py-2 border-b border-gray-800 shrink-0">
          <input
            className="w-full bg-transparent text-sm text-gray-400 outline-none placeholder:text-gray-600"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-800 shrink-0 px-5">
          {(['editor', 'variables', 'preview'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'variables' ? `Variables (${variables.length})` : t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {tab === 'editor' && (
            <div className="h-full bg-gray-900">
              <CodeEditor
                value={content}
                onChange={setContent}
                placeholder="Enter Jinja2 template content here…"
              />
            </div>
          )}

          {tab === 'variables' && (
            <div className="h-full overflow-auto p-5">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">Define variables used in your template.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDetectVars}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-500 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Auto-detect
                    </button>
                    <button
                      onClick={() => setVariables((prev) => [...prev, EMPTY_VARIABLE()])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600/20 border border-brand-700 text-sm text-brand-300 hover:bg-brand-600/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add variable
                    </button>
                  </div>
                </div>

                {variables.length === 0 ? (
                  <div className="text-center py-12 text-gray-600">
                    No variables defined. Use Auto-detect or add manually.
                  </div>
                ) : (
                  <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                    <div className="grid grid-cols-[1fr_100px_80px_1fr_auto] gap-2 text-xs text-gray-600 uppercase tracking-wider pb-2 border-b border-gray-800">
                      <span>Name</span>
                      <span>Type</span>
                      <span>Req.</span>
                      <span>Default</span>
                      <span />
                    </div>
                    {variables.map((v, i) => (
                      <VariableRow
                        key={i}
                        variable={v}
                        onChange={(updated) => setVariables((prev) => prev.map((x, j) => (j === i ? updated : x)))}
                        onRemove={() => setVariables((prev) => prev.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'preview' && (
            <div className="h-full overflow-auto p-5">
              <div className="max-w-3xl mx-auto space-y-4">
                {variables.length > 0 && (
                  <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Variable values</p>
                    <div className="grid grid-cols-2 gap-3">
                      {variables.map((v) => (
                        <div key={v.name} className="space-y-1">
                          <label className="text-xs text-gray-400">
                            {v.name}
                            {v.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          <input
                            className="input-sm w-full"
                            value={previewValues[v.name] ?? ''}
                            onChange={(e) =>
                              setPreviewValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                            }
                            placeholder={v.default ?? ''}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePreview}
                  disabled={previewing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  {previewing ? 'Rendering…' : 'Render preview'}
                </button>

                {previewResult && (
                  <div className="space-y-3">
                    {previewResult.errors.length > 0 ? (
                      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 space-y-1">
                        {previewResult.errors.map((err, i) => (
                          <p key={i} className="text-sm text-red-300 font-mono">
                            {err}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 text-xs text-gray-500">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          Rendered output
                        </div>
                        <pre className="p-4 text-sm text-gray-100 font-mono whitespace-pre overflow-auto max-h-96">
                          {previewResult.rendered}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

function DeleteConfirm({
  template,
  onConfirm,
  onCancel,
  loading,
}: {
  template: Template
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white">Delete template?</p>
            <p className="text-sm text-gray-400 mt-1">
              <span className="text-white font-medium">{template.name}</span> will be permanently deleted.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TemplatesPage() {
  const { user } = useAuthStore()
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const canDelete = user?.role === 'admin'

  const [templates, setTemplates] = useState<Template[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | ''>('')
  const [editing, setEditing] = useState<Template | null | 'new'>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await listTemplates({
        search: search || undefined,
        category: categoryFilter || undefined,
        limit: 200,
      })
      setTemplates(res.items)
      setTotal(res.total)
    } catch {}
    finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [search, categoryFilter])

  function handleSaved(t: Template) {
    setTemplates((prev) => {
      const exists = prev.find((x) => x.id === t.id)
      return exists ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]
    })
    setTotal((n) => (editing === 'new' ? n + 1 : n))
    setEditing(null)
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await deleteTemplate(deleting.id)
      setTemplates((prev) => prev.filter((t) => t.id !== deleting.id))
      setTotal((n) => n - 1)
      setDeleting(null)
    } catch {}
    finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} template{total !== 1 ? 's' : ''}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            <FilePlus className="w-4 h-4" />
            New template
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 outline-none focus:border-brand-600 transition-colors"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setCategoryOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-300 hover:border-gray-500 transition-colors"
          >
            {categoryFilter ? (
              <CategoryBadge category={categoryFilter} />
            ) : (
              <span className="text-gray-500">All categories</span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>
          {categoryOpen && (
            <div className="absolute top-full mt-1 left-0 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-10 py-1">
              <button
                onClick={() => { setCategoryFilter(''); setCategoryOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                All categories
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCategoryFilter(c); setCategoryOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors"
                >
                  <CategoryBadge category={c} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3 text-left font-medium">Name</th>
              <th className="px-5 py-3 text-left font-medium">Category</th>
              <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Description</th>
              <th className="px-5 py-3 text-left font-medium hidden lg:table-cell">Variables</th>
              <th className="px-5 py-3 text-left font-medium hidden lg:table-cell">Updated</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-600">Loading…</td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-600">
                  {search || categoryFilter ? 'No templates match your filters.' : 'No templates yet.'}
                </td>
              </tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3 font-medium text-white">{t.name}</td>
                  <td className="px-5 py-3">
                    <CategoryBadge category={t.category} />
                  </td>
                  <td className="px-5 py-3 text-gray-400 hidden md:table-cell max-w-xs truncate">
                    {t.description ?? <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-400 hidden lg:table-cell">
                    {t.variables.length}
                  </td>
                  <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">
                    {new Date(t.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => setEditing(t)}
                          className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleting(t)}
                          className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {editing !== null && (
        <TemplateModal
          initial={editing === 'new' ? null : editing}
          onSave={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <DeleteConfirm
          template={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}
