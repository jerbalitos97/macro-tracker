// The Friday app mark — renders the PWA icon as a rounded badge. Used in the
// launcher header and the login screen so the in-app brand matches the
// home-screen / PWA icon exactly.
interface Props {
  size?: number
}

export function AppMark({ size = 48 }: Props) {
  return (
    <img
      src="/icons/friday-icon-512.png"
      alt="Friday"
      width={size}
      height={size}
      className="rounded-[24%] shadow-[0_8px_24px_-8px_rgba(34,211,238,0.55)]"
      style={{ display: 'block', flexShrink: 0 }}
    />
  )
}
