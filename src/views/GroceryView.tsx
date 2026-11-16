import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Check, Share2, Trash2, ShoppingBasket, Tag } from 'lucide-react'
import { Card, Button, Sheet } from '../components/ui'
import { celebrate } from '../lib/flash'
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

  const openCount = todo.length
  const basketPct = items.length > 0 ? Math.round((done.length / items.length) * 100) : 0

  return (
    <div className="flex flex-col gap-3 px-4 pb-28 pt-2">
      {/* Store switcher + share. The tool title lives in the AppBar. */}
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Kauppa"
          className="flex min-w-0 flex-1 gap-1 rounded-[24px] border border-white/[0.08] bg-[var(--surface-1)] p-1"
        >
          {STORES.map((s) => {
            const active = store === s
            return (
              <button
                key={s}
                role="tab"
                aria-selected={active}
                onClick={() => { void setStore(list.id, s); setList({ ...list, store: s }) }}
                className={`min-h-10 min-w-0 flex-1 cursor-pointer rounded-[20px] text-[14px] font-medium transition-colors ${
                  active ? 'bg-[rgba(248,113,113,0.2)] text-[#fecaca]' : 'bg-transparent text-fg-muted'
                }`}
              >
                {STORE_LABEL[s]}
              </button>
            )
          })}
        </div>
        <button
          onClick={share}
          className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.18] bg-transparent px-4 text-[14px] font-medium text-text"
        >
          <Share2 size={16} /> {copied ? 'Kopioitu' : 'Jaa'}
        </button>
      </div>

      {/* Hero: the screen's one number — what is still to take. */}
      <section
        className="flex flex-col gap-2 rounded-[36px_36px_36px_12px] border border-[rgba(248,113,113,0.38)] p-5"
        style={{ background: 'linear-gradient(135deg, rgba(248,113,113,0.28), rgba(167,139,250,0.24))' }}
      >
        <span className="text-[14px] leading-5 text-[#fde2e2]">{STORE_LABEL[store]}</span>
        <div className="flex items-baseline gap-2.5">
          <span className="num-display text-[52px] leading-[56px]">{openCount}</span>
          <span className="text-[18px] text-[#fde2e2]">{openCount === 1 ? 'tuote jäljellä' : 'tuotetta jäljellä'}</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-[5px] bg-white/[0.14]"
          role="progressbar"
          aria-label="Korissa"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={basketPct}
        >
          <div
            className="h-2.5 rounded-[5px] transition-[width] duration-500 ease-[cubic-bezier(.2,0,0,1)]"
            style={{ width: `${basketPct}%`, background: 'linear-gradient(90deg, #f87171, #a78bfa)' }}
          />
        </div>
        <span className="text-[14px] leading-5 text-[#fde2e2]">
          Korissa <span className="font-mono">{done.length} / {items.length}</span>
        </span>
      </section>

      {/* Add bar */}
      <Card variant="panel" className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Lisää tuote…"
            aria-label="Tuote"
            className="h-12 min-w-0 flex-1 rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-3.5 text-base text-text placeholder:text-fg-muted"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            inputMode="decimal"
            placeholder="Määrä"
            aria-label="Määrä"
            className="h-12 w-16 shrink-0 rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-1 text-center font-mono text-base text-text placeholder:font-sans placeholder:text-fg-muted"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              aria-pressed={unit === u}
              className={`min-h-9 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[14px] font-medium transition-colors ${
                unit === u
                  ? 'border border-transparent bg-[rgba(248,113,113,0.18)] text-[#fecaca]'
                  : 'border border-white/[0.18] bg-transparent text-text'
              }`}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
          <span className="flex-1" />
          <button
            onClick={handleAdd}
            disabled={!itemName.trim()}
            aria-label="Lisää"
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-bg disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #f87171, #a78bfa)' }}
          >
            <Plus size={22} strokeWidth={2.4} />
          </button>
        </div>
      </Card>

      {/* To-take sections */}
      {todo.length === 0 && done.length === 0 && (
        <p className="px-1 py-2 text-[14px] leading-5 text-fg-muted">
          Lista on tyhjä. Lisää ensimmäinen tuote yltä.
        </p>
      )}

      {sections.map(({ cat, items: secItems }) => (
        <div key={cat} className="flex flex-col gap-2">
          <div className="px-1 pt-1 text-[14px] font-medium leading-5 text-fg-muted">
            {CATEGORY_LABEL[cat]} · {secItems.length}
          </div>
          <div className="flex flex-col gap-0.5 overflow-hidden rounded-[20px]">
            {secItems.map((it) => (
              <div
                key={it.id}
                data-flash
                className="relative flex min-h-[60px] items-center gap-3 bg-[var(--surface-1)] py-2 pl-3 pr-1"
              >
                <button
                  onClick={(e) => { celebrate(e.currentTarget); void toggle(it, true) }}
                  aria-label={`Merkitse otetuksi: ${it.name}`}
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-white/30 bg-transparent text-transparent transition-colors active:border-transparent active:bg-gradient-to-br active:from-[#f87171] active:to-violet active:text-bg"
                >
                  <Check size={18} strokeWidth={3} />
                </button>
                <button
                  onClick={(e) => { celebrate(e.currentTarget); void toggle(it, true) }}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col bg-transparent p-0 text-left"
                >
                  <span className="truncate text-[16px] leading-6 text-text">{it.name}</span>
                  {amountLabel(it) && (
                    <span className="font-mono text-[12px] leading-4 text-fg-muted">{amountLabel(it)}</span>
                  )}
                </button>
                <button
                  onClick={() => setMenuItem(it)}
                  aria-label={`Osasto ja poisto: ${it.name}`}
                  className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-fg-muted"
                >
                  <Tag size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Done — baskets per person */}
      {done.length > 0 && (
        <Card variant="panel" className="mt-1 flex flex-col gap-2.5">
          <div className="flex items-center">
            <span className="flex-1 text-[16px] font-medium leading-6 text-text">
              Korissa · <span className="font-mono">{done.length}</span>
            </span>
            <button
              onClick={() => clearDone(list.id)}
              className="min-h-10 cursor-pointer rounded-full bg-transparent px-3 text-[14px] font-semibold text-cyan"
            >
              Tyhjennä
            </button>
          </div>
          {baskets.map(([who, basketItems]) => (
            <div key={who} className="flex flex-col">
              <div className="flex items-center gap-2 text-[12px] leading-4 text-fg-muted">
                <ShoppingBasket size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{who}</span>
              </div>
              {basketItems.map((it) => (
                <div key={it.id} className="flex min-h-11 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[15px] text-fg-muted line-through">
                    {it.name}{amountLabel(it) && <> · <span className="font-mono">{amountLabel(it)}</span></>}
                  </span>
                  <button
                    onClick={() => toggle(it, false)}
                    aria-label={`Palauta listalle: ${it.name}`}
                    className="min-h-10 shrink-0 cursor-pointer rounded-full bg-transparent px-3 text-[14px] font-semibold text-cyan"
                  >
                    Palauta
                  </button>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}

      {/* Per-item options: recategorise / delete */}
      {menuItem && (
        <Sheet open onClose={() => setMenuItem(null)} title={menuItem.name}>
          <div className="mb-2 text-[12px] leading-4 text-fg-muted">Siirrä osastoon</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CATEGORY_LABEL) as CategoryKey[]).map((cat) => {
              const on = normalizeCategory(menuItem.category) === cat
              return (
                <button
                  key={cat}
                  aria-pressed={on}
                  onClick={() => { void setCategory(menuItem.id, cat); void refresh(); setMenuItem(null) }}
                  className={`min-h-9 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[14px] font-medium ${
                    on
                      ? 'border border-transparent bg-[rgba(248,113,113,0.18)] text-[#fecaca]'
                      : 'border border-white/[0.18] bg-transparent text-text'
                  }`}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => { void deleteItem(menuItem.id); void refresh(); setMenuItem(null) }}
            className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-white/[0.18] bg-transparent px-4 text-[14px] font-medium text-[#FFB4AB]"
          >
            <Trash2 size={16} /> Poista tuote
          </button>
        </Sheet>
      )}

      {/* Name prompt (for the "who took what" baskets) */}
      {needName && (
        <Sheet open onClose={() => setNeedName(false)} title="Kuka olet?">
          <p className="mb-3 text-[14px] leading-5 text-fg-muted">
            Nimi näytetään korissa, jotta näette kuka otti mitäkin.
          </p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            placeholder="Nimesi"
            aria-label="Nimesi"
            autoFocus
            className="mb-3 h-12 w-full rounded-xl border border-white/[0.18] bg-[var(--surface-2)] px-3.5 text-base text-text placeholder:text-fg-muted"
          />
          <Button variant="primary" onClick={saveName} disabled={!nameInput.trim()} className="w-full">
            <Check size={16} /> Valmis
          </Button>
        </Sheet>
      )}
    </div>
  )
}
