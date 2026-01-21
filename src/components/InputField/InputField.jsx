import './InputField.css'

function InputField({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  ...props
}) {
  return (
    <div className="input-group">
      {label && <label>{label}</label>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={error ? 'input-error' : ''}
        {...props}
      />
      {error && <span className="error-text">{error}</span>}
    </div>
  )
}

export default InputField
