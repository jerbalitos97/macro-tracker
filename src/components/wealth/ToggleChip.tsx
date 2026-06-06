import { chip } from '../../lib/wealth/ui'

type Props = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  swatch?: string
}

export default function ToggleChip({ active, onClick, children, swatch }: Props) {
  return (
    <button type="button" onClick={onClick} style={chip(active)}>
      {swatch ? (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: swatch,
            opacity: active ? 1 : 0.45,
          }}
        />
      ) : null}
      {children}
    </button>
  )
}
