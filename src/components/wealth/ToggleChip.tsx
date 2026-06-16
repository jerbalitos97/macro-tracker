import { Chip } from '../ui'

type Props = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  swatch?: string
}

export default function ToggleChip({ active, onClick, children, swatch }: Props) {
  return (
    <Chip type="button" active={active} onClick={onClick}>
      {swatch ? (
        <span
          aria-hidden
          className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: swatch, opacity: active ? 1 : 0.45 }}
        />
      ) : null}
      {children}
    </Chip>
  )
}
