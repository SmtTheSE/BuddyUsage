import { motion } from 'framer-motion'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}

/** iOS-style toggle: glass track, sprung knob, tinted glow when on. */
export function Switch({ checked, onChange, disabled = false, label }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={checked ? 'switch switch--on' : 'switch'}
      onClick={() => onChange(!checked)}
    >
      <motion.span
        className="switch__knob"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
      />
    </button>
  )
}
