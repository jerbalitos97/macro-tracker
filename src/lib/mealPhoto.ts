import { supabase } from './supabase'

// Kuva → arvio. Selainpuolen osa: kuvan kutistus ja kutsu omalle funktiolle.
//
// Kuvaa ei tallenneta mihinkään — se lähtee analysoitavaksi ja katoaa. Kantaan
// päätyvät vain luvut ja kuvaus, ja vain jos käyttäjä hyväksyy ne.

export interface MealAnalysis {
  description: string
  items: string[]
  calories: number
  protein: number
  confidence: 'low' | 'medium' | 'high'
}

/** Pisin sivu skaalattuna. 1024 px riittää annoksen tunnistukseen ja
 *  annoskoon päättelyyn; puhelimen täysi 12 MP kuva olisi kymmenkertainen
 *  siirto ilman että arvio paranee, ja se tuntuisi hitaalta juuri siinä
 *  hetkessä kun käyttäjä odottaa vastausta. */
const MAX_EDGE = 1024
const JPEG_QUALITY = 0.82

/** Kutistaa kuvan ja palauttaa base64-datan ilman data-URL-etuliitettä. */
export async function shrinkToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kuvan käsittely ei onnistu tässä selaimessa')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Kuvan käsittely ei onnistu')
  return { base64: dataUrl.slice(comma + 1), mediaType: 'image/jpeg' }
}

/** Paikallinen esikatselu-URL. Soittajan vastuu vapauttaa se. */
export const previewUrl = (file: File): string => URL.createObjectURL(file)

export async function analyseMealPhoto(
  file: File,
  correction?: string
): Promise<MealAnalysis> {
  if (!supabase) throw new Error('Kuva-analyysi vaatii kirjautumisen')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Istunto on vanhentunut — kirjaudu uudelleen')

  const { base64, mediaType } = await shrinkToBase64(file)

  const res = await fetch('/api/ruoka-analysoi', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageBase64: base64, mediaType, userCorrection: correction ?? '' }),
  })

  // Virheteksti tulee palvelimelta suomeksi; näytetään se sellaisenaan sen
  // sijaan että keksittäisiin geneerinen "jotain meni pieleen".
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Analyysi ei onnistunut (${res.status})`)
  }
  return (await res.json()) as MealAnalysis
}
