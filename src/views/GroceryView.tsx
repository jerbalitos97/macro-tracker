import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Check, Share2, Trash2, ShoppingBasket, Undo2, Tag } from 'lucide-react'
import { Card, Button, Sheet } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import {
  CATEGORY_LABEL, STORE_LABEL, STORE_ORDER, normalizeCategory,
} from '../lib/groceryCategories'
import type { CategoryKey, StoreKey } from '../lib/groceryCategories'
import {
  getOrCreateList, getListById, getItems, addItem, setDone, setCategory,
  deleteItem, clearDone, setStore, subscribe, shareLink, sharedListIdFromUrl,
  getName, setName, UNIT_LABEL,
} from '../lib/grocery'
import type { GroceryItem, GroceryList, Unit } from '../lib/grocery'

const UNITS: Unit[] = ['pcs', 'g', 'l']
const STORES: StoreKey[] = ['s', 'k', 'lidl']

function amountLabel(it: GroceryItem): string {
  if (it.amount == null && !it.unit) return ''
  const a = it.amount != null ? `${it.amount}` : ''
  const u = it.unit ? UNIT_LABEL[it.unit] : ''
  return `${a} ${u}`.trim()
}

export function GroceryView() {
  const { user } = useAuth()
  const [list, setList] = useState<GroceryList | null>(null)
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setNameState] = useState(getName())
  const [needName, setNeedName] = useState(!getName())
  const [nameInput, setNameInput] = useState('')

  // add form
  const [itemName, setItemName] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<Unit>('pcs')

  // per-item options sheet
  const [menuItem, setMenuItem] = useState<GroceryItem | null>(null)
  const [copied, setCopied] = useState(false)

  const listIdRef = useRef<string | null>(null)

  const refresh = async () => {
    const id = listIdRef.current
    if (!id) return
    const [l, its] = await Promise.all([getListById(id), getItems(id)])
    if (l) setList(l)
    setItems(its)
  }

  // Load list (shared via ?g= or the device's own) + subscribe to realtime.
  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      const shared = sharedListIdFromUrl()
      const l = shared ? await getListById(shared) : await getOrCreateList(user?.id)
      if (l) {
        listIdRef.current = l.id
        setList(l)
        setItems(await getItems(l.id))
        unsub = subscribe(l.id, () => { void refresh() })
      }
      setLoading(false)
    })()
    return () => unsub()
  }, [])

  const store: StoreKey = list?.store ?? 's'

  const todo = useMemo(() => items.filter((i) => !i.done), [items])
  const done = useMemo(() => items.filter((i) => i.done), [items])

  // To-take grouped by category, in this store's walking order.
  const sections = useMemo(() => {
    return STORE_ORDER[store]
      .map((cat) => ({ cat, items: todo.filter((i) => normalizeCategory(i.category) === cat) }))
      .filter((s) => s.items.length > 0)
  }, [todo, store])

  // Done grouped into baskets by person.
  const baskets = useMemo(() => {
    const map = new Map<string, GroceryItem[]>()
    for (const it of done) {
      const who = it.taken_by?.trim() || 'Tuntematon'
      if (!map.has(who)) map.set(who, [])
      map.get(who)!.push(it)
    }
    return [...map.entries()]
  }, [done])

  const myName = name.trim() || 'Minä'

  const handleAdd = async () => {
    const n = itemName.trim()
    if (!n) return
    const amt = amount.trim() === '' ? null : Number(amount.replace(',', '.'))
    await addItem(listIdRef.current!, { name: n, amount: Number.isFinite(amt as number) ? (amt as number) : null, unit })
    setItemName('')
    setAmount('')
    void refresh()
  }

  const toggle = async (it: GroceryItem, done: boolean) => {
    if (done && needName) { setNeedName(true); return }
    await setDone(it, done, myName)
    void refresh()
  }

  const share = async () => {
    if (!list) return
    const url = shareLink(list.id)
    try {
      if (navigator.share) { await navigator.share({ title: 'Ostoslista', url }); return }
    } catch { /* fall through to clipboard */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  const saveName = () => {
    const n = nameInput.trim()
    if (!n) return
    setName(n)
    setNameState(n)
    setNeedName(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex gap-[7px]">
          {[0, 1, 2].map((i) => <div key={i} className="pulse-dot h-2 w-2 rounded-full bg-accent" />)}
        </div>
      </div>
    )
  }

  if (!list) {
    return (
      <div className="px-4 pt-10 text-center text-sm leading-relaxed text-fg-muted">
        Ostoslistan yhteyttä ei saatu. Tarkista verkkoyhteys ja yritä uudelleen.
      </div>
    )
  }

  return (
    <div className="px-4 pb-28 pt-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-text">Ostoslista</h1>
        <button
          onClick={share}
          className="icon-btn flex min-h-0 min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-cyan"
        >
          <Share2 size={13} /> {copied ? 'Kopioitu' : 'Jaa'}
        </button>
      </div>

      {/* Store switcher */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-row border border-white/10 bg-white/[0.04] p-1">
        {STORES.map((s) => {
          const active = store === s
          return (
            <button
              key={s}
              onClick={() => { void setStore(list.id, s); setList({ ...list, store: s }) }}
              className={`min-h-0 rounded-[14px] py-2 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
                active ? 'bg-gradient-to-br from-cyan to-violet text-bg' : 'text-fg-muted'
              }`}
            >
              {STORE_LABEL[s]}
            </button>
          )
        })}
      </div>

      {/* Add bar */}
      <Card variant="panel" className="mb-4">
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Lisää tuote…"
          className="mb-2 w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[11px] text-sm text-text"
        />
        <div className="flex items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            inputMode="decimal"
            placeholder="Määrä"
            className="w-20 rounded-input border border-white/10 bg-black/[0.45] px-2.5 py-2 text-center text-sm tabular-nums text-text"
          />
          <div className="flex flex-1 gap-1 rounded-input border border-white/10 bg-white/[0.04] p-1">
            {UNITS.map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`flex-1 rounded-[10px] py-1.5 font-mono text-[11px] uppercase transition-colors ${
                  unit === u ? 'bg-cyan/20 text-cyan' : 'text-fg-muted'
                }`}
              >
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!itemName.trim()}
            aria-label="Lisää"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan to-violet text-bg shadow-[0_0_18px_rgba(34,211,238,0.45)] disabled:opacity-40"
          >
            <Plus size={20} strokeWidth={2.4} />
          </button>
        </div>
      </Card>

      {/* To-take sections */}
      {todo.length === 0 && done.length === 0 && (
        <p className="rounded-row border border-dashed border-white/[0.12] px-4 py-8 text-center text-[12px] leading-relaxed text-fg-faint">
          Lista on tyhjä. Lisää ensimmäinen tuote yltä.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {sections.map(({ cat, items: secItems }) => (
          <div key={cat}>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              {CATEGORY_LABEL[cat]} <span className="text-fg-faint">· {secItems.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {secItems.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-row border border-white/10 bg-white/[0.05] px-3 py-2.5 [backdrop-filter:blur(14px)]"
                >
                  <button
                    onClick={() => toggle(it, true)}
                    aria-label="Merkitse otetuksi"
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-white/25 text-transparent transition-colors active:border-cyan active:bg-cyan active:text-bg"
                  >
                    <Check size={13} strokeWidth={3} />
                  </button>
                  <button onClick={() => toggle(it, true)} className="min-w-0 flex-1 bg-transparent p-0 text-left">
                    <div className="truncate text-[14px] text-text">{it.name}</div>
                  </button>
                  {amountLabel(it) && (
                    <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-fg-muted">{amountLabel(it)}</span>
                  )}
                  <button
                    onClick={() => setMenuItem(it)}
                    aria-label="Lisätoiminnot"
                    className="icon-btn flex min-h-0 min-w-0 flex-shrink-0 items-center justify-center rounded-md p-1 text-fg-faint"
                  >
                    <Tag size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Done — baskets per person */}
      {done.length > 0 && (
        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              Korissa <span className="text-fg-faint">· {done.length}</span>
            </div>
            <button onClick={() => clearDone(list.id)} className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-faint hover:text-danger">
              Tyhjennä
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {baskets.map(([who, basketItems]) => (
              <Card key={who} variant="glass">
                <div className="mb-2 flex items-center gap-2">
                  <ShoppingBasket size={15} className="flex-shrink-0 text-cyan" />
                  <div className="min-w-0 flex-1 truncate font-display text-[14px] font-semibold text-text">{who}</div>
                  <span className="font-mono text-[10px] text-fg-faint">{basketItems.length}</span>
                </div>
                <div className="flex flex-col gap-1">
                  {basketItems.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 border-t border-white/[0.05] py-1 first:border-t-0">
                      <button
                        onClick={() => toggle(it, false)}
                        aria-label="Palauta listalle"
                        className="icon-btn flex min-h-0 min-w-0 flex-shrink-0 items-center justify-center rounded-md p-1 text-cyan"
                      >
                        <Undo2 size={13} />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted line-through">{it.name}</span>
                      {amountLabel(it) && (
                        <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-fg-faint">{amountLabel(it)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Per-item options: recategorise / delete */}
      {menuItem && (
        <Sheet open onClose={() => setMenuItem(null)} title={<span className="normal-case">{menuItem.name}</span>}>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">Siirrä osastoon</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(CATEGORY_LABEL) as CategoryKey[]).map((cat) => (
              <button
                key={cat}
                onClick={() => { void setCategory(menuItem.id, cat); void refresh(); setMenuItem(null) }}
                className={`rounded-input border px-3 py-2 text-left text-[12px] ${
                  normalizeCategory(menuItem.category) === cat ? 'border-cyan/40 bg-cyan/[0.1] text-cyan' : 'border-white/10 bg-white/[0.04] text-fg-muted'
                }`}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
          <button
            onClick={() => { void deleteItem(menuItem.id); void refresh(); setMenuItem(null) }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-input border border-danger/30 bg-danger/[0.08] py-3 font-mono text-[12px] text-danger"
          >
            <Trash2 size={14} /> Poista tuote
          </button>
        </Sheet>
      )}

      {/* Name prompt (for the "who took what" baskets) */}
      {needName && (
        <Sheet open onClose={() => setNeedName(false)} title="Kuka olet?">
          <p className="mb-3 text-[12px] leading-relaxed text-fg-muted">
            Nimi näytetään korissa, jotta näette kuka otti mitäkin.
          </p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            placeholder="Nimesi"
            autoFocus
            className="mb-3 w-full rounded-input border border-white/10 bg-black/[0.45] px-[13px] py-[12px] text-sm text-text"
          />
          <Button variant="primary" onClick={saveName} disabled={!nameInput.trim()} className="w-full">
            <Check size={16} /> Valmis
          </Button>
        </Sheet>
      )}
    </div>
  )
}
