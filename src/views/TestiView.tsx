// Palautteesta #1: tyhjä paikanvaraaja, jolla osoitetaan että palautesilmukka
// (palaute → toteutus → PR) toimii päästä päähän. Ei tallenna mitään, joten
// se ei koske vientiin eikä kantaan.
export function TestiView() {
  return (
    <div className="flex min-h-dvh flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-7">
      <h1 className="text-xl font-semibold">Testi</h1>
      <p className="text-[14px] text-muted">
        Tämä näkymä syntyi palautteesta. Palautesilmukka toimii.
      </p>
    </div>
  )
}
