import { BiLogOut } from 'react-icons/bi'
import './HeaderControls.css'

function HeaderControls({ 
  currentLanguage, 
  onLanguageChange, 
  onLogout, 
  user, 
  displayName 
}) {
  return (
    <div className="header-controls">
      <button
        className={`lang-btn ${currentLanguage === 'zh-HK' ? 'active' : ''}`}
        onClick={() => onLanguageChange('zh-HK')}
        title="繁體中文"
      >
        繁
      </button>
      <button
        className={`lang-btn ${currentLanguage === 'en-US' ? 'active' : ''}`}
        onClick={() => onLanguageChange('en-US')}
        title="English"
      >
        EN
      </button>
      <button
        className="logout-btn"
        onClick={onLogout}
        title="Logout"
        aria-label="Logout"
      >
        <BiLogOut />
      </button>
      {user?.photoURL && (
        <div className="user-avatar">
          <img src={user.photoURL} alt={displayName} />
        </div>
      )}
    </div>
  )
}

export default HeaderControls
