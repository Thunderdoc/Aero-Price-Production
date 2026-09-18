/* InputField and SelectField — styled with design system CSS variables */

interface FieldBase {
  label?: string
  description?: string
  disabled?: boolean
  className?: string
}

interface InputFieldProps extends FieldBase {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  type?: string
}

interface SelectFieldProps extends FieldBase {
  value: string
  options: { value: string; label: string }[]
  placeholder?: string
  onChange: (v: string) => void
}

const inputBase = [
  'w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)]',
  'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]',
  'px-[var(--space-lg)] py-[var(--space-md)]',
  'text-[length:var(--text-body-size)] font-[var(--font-sans)]',
  'placeholder:text-[var(--color-text-tertiary)]',
  'focus:outline-none focus:border-[var(--color-brand-primary)] focus:ring-2 focus:ring-[var(--color-brand-primary)] focus:ring-opacity-20',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'transition-colors duration-[var(--transition-fast)]',
].join(' ')

export function InputField({ label, description, value, placeholder, onChange, disabled, className = '', type = 'text' }: InputFieldProps) {
  return (
    <div className={`flex flex-col gap-[var(--space-xs)] ${className}`}>
      {label && <label className="text-label text-[var(--color-text-primary)]">{label}</label>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={inputBase}
      />
      {description && <p className="text-caption text-[var(--color-text-tertiary)]">{description}</p>}
    </div>
  )
}

export function SelectField({ label, description, value, options, placeholder, onChange, disabled, className = '' }: SelectFieldProps) {
  return (
    <div className={`flex flex-col gap-[var(--space-xs)] ${className}`}>
      {label && <label className="text-label text-[var(--color-text-primary)]">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={inputBase + ' cursor-pointer appearance-none pr-[var(--space-3xl)]'}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {description && <p className="text-caption text-[var(--color-text-tertiary)]">{description}</p>}
    </div>
  )
}
