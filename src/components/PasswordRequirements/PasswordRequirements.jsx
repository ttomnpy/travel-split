import { useTranslation } from '../../hooks/useTranslation'
import './PasswordRequirements.css'

function PasswordRequirements({ requirements }) {
  const { t } = useTranslation()

  if (!requirements) return null

  const requirementsList = [
    {
      key: 'minLength',
      label: t('auth.passwordRequirement.minLength')
    },
    // {
    //   key: 'hasUpperCase',
    //   label: t('auth.passwordRequirement.hasUpperCase')
    // },
    {
      key: 'hasLowerCase',
      label: t('auth.passwordRequirement.hasLowerCase')
    },
    {
      key: 'hasNumber',
      label: t('auth.passwordRequirement.hasNumber')
    },
    // {
    //   key: 'hasSpecialChar',
    //   label: t('auth.passwordRequirement.hasSpecialChar')
    // }
  ]

  const allMet = Object.values(requirements).every(v => v === true)

  return (
    <div className={`password-requirements ${allMet ? 'all-met' : ''}`}>
      <div className="requirements-title">
        {allMet ? '✓ ' : ''}{t('auth.passwordRequirements')}
      </div>
      <ul className="requirements-list">
        {requirementsList.map((req) => (
          <li key={req.key} className={requirements[req.key] ? 'met' : 'unmet'}>
            <span className="requirement-icon">
              {requirements[req.key] ? '✓' : '○'}
            </span>
            <span className="requirement-text">{req.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default PasswordRequirements
