import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, Check, RotateCcw, X } from 'lucide-react'
import { analyseMealPhoto, previewUrl, type MealAnalysis } from '../../lib/mealPhoto'

interface Props {
  onAccept: (meal: { kcal: number; protein: number; description: string; items: string[] }) => void
}

type Phase = 'idle' | 'analysing' | 'result' | 'error'

const CONFIDENCE_TEXT: Record<MealAnalysis['confidence'], string> = {
  high: 'Selkeä kuva',
  medium: 'Kohtuullinen arvio',
  low: 'Epävarma — tarkista luvut',
}

/**
 * Kuvaa → arvio → hyväksyntä.
 *
 * Arvio ei koskaan kirjaudu itsestään. Malli arvaa annoskoon kuvasta, ja
 * väärä luku päiväkirjassa on pahempi kuin yksi ylimääräinen painallus —
 * joten luvut ovat muokattavissa ja kirjaus tapahtuu vain napista.
 */
export function MealCapture({ onAccept }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<MealAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [correction, setCorrection] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Esikatselu-URL on objektiviittaus, ei tavallinen linkki: jos sitä ei
  // vapauteta, jokainen otettu kuva jää muistiin koko istunnon ajaksi.
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const reset = () => {
    setPhase('idle')
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setCorrection('')
    setKcal('')
    setProtein('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const run = async (f: File, corr?: string) => {
    setPhase('analysing')
    setError(null)
    try {
      const r = await analyseMealPhoto(f, corr)
      setResult(r)
      setKcal(String(r.calories))
      setProtein(String(r.protein))
      setPhase('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyysi ei onnistunut')
      setPhase('error')
    }
  }

  const pick = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setPreview(previewUrl(f))
    void run(f)
  }

  const accept = () => {
    const k = Math.round(Number(kcal))
    const p = Math.round(Number(protein))
    if (!Number.isFinite(k) || k <= 0) return
    onAccept({
      kcal: k,
      protein: Number.isFinite(p) && p > 0 ? p : 0,
      description: result?.description ?? '',
      items: result?.items ?? [],
    })
    reset()
  }

  return (
    <div className="mt-3 rounded-panel border border-sky/25 bg-sky/[0.05] p-4 [backdrop-filter:blur(14px)]">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // capture avaa kameran suoraan puhelimessa; työpöydällä selain
        // jättää sen huomiotta ja näyttää tiedostovalitsimen.
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {phase === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-input border border-sky/40 bg-sky/[0.10] py-3.5 font-mono text-[12px] uppercase tracking-[0.06em] text-sky"
        >
          <Camera size={15} />
          Kuvaa ateria
        </button>
      )}

      {phase !== 'idle' && preview && (
        <div className="mb-3 overflow-hidden rounded-input border border-white/10">
          <img src={preview} alt="Kuvattu ateria" className="max-h-44 w-full object-cover" />
        </div>
      )}

      {phase === 'analysing' && (
        <p className="flex items-center justify-center gap-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-sky">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-sky" aria-hidden />
          Analysoidaan…
        </p>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-2">
          <p role="status" className="flex items-start gap-2 text-[13px] text-danger">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
          <div className="flex gap-2">
            {file && (
              <button
                type="button"
                onClick={() => void run(file, correction || undefined)}
                className="flex-1 cursor-pointer rounded-input border border-white/10 bg-black/30 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text"
              >
                Yritä uudelleen
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="flex-1 cursor-pointer rounded-input border border-white/10 bg-black/30 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-muted"
            >
              Peruuta
            </button>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="font-display text-[16px] font-semibold text-text">{result.description}</div>
            {result.items.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.items.map((it, i) => (
                  <span
                    key={`${it}-${i}`}
                    className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[11px] text-fg-muted"
                  >
                    {it}
                  </span>
                ))}
              </div>
            )}
            <div
              className={`mt-2 font-mono text-[10px] uppercase tracking-[0.08em] ${
                result.confidence === 'low' ? 'text-danger' : 'text-fg-ghost'
              }`}
            >
              {CONFIDENCE_TEXT[result.confidence]}
            </div>
          </div>

          {/* Luvut ovat muokattavissa. Malli arvaa annoskoon kuvasta, ja
              käyttäjä tietää sen paremmin — pakotettu arvio olisi huonompi
              kuin ehdotus jota voi korjata. */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">kcal</span>
              <input
                type="number"
                inputMode="numeric"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
                className="w-full rounded-input border border-white/10 bg-black/[0.45] px-3 py-2.5 text-base text-text [color-scheme:dark]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-fg-dim">proteiini g</span>
              <input
                type="number"
                inputMode="numeric"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                className="w-full rounded-input border border-white/10 bg-black/[0.45] px-3 py-2.5 text-base text-text [color-scheme:dark]"
              />
            </label>
          </div>

          {/* Uudelleenanalyysi korjauksella: käyttäjä kertoo mitä kuvassa
              oikeasti on, ja malli päivittää myös luvut sen mukaan. */}
          <div className="flex gap-2">
            <input
              type="text"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Väärin tunnistettu? Kerro mitä siinä on…"
              className="min-w-0 flex-1 rounded-input border border-white/10 bg-black/[0.45] px-3 py-2.5 text-base text-text placeholder:text-fg-ghost [color-scheme:dark]"
            />
            <button
              type="button"
              disabled={!file || !correction.trim()}
              onClick={() => file && void run(file, correction.trim())}
              aria-label="Analysoi uudelleen korjauksella"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-input border border-white/10 bg-black/30 px-3 text-fg-muted disabled:opacity-40"
            >
              <RotateCcw size={15} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={accept}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-input bg-gradient-to-br from-cyan to-blue py-3 font-mono text-[13px] font-bold tracking-[0.03em] text-bg shadow-[0_0_20px_rgba(34,211,238,0.45)]"
            >
              <Check size={15} strokeWidth={2.5} />
              Lisää päiväkirjaan
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Hylkää"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-input border border-white/10 bg-black/30 px-3.5 text-fg-muted"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
