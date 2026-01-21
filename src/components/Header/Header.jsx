import './Header.css'

function Header({ title, actions }) {
  return (
    <header className="app-header">
      <h1>{title}</h1>
      <div className="header-actions">
        {actions}
      </div>
    </header>
  )
}

export default Header
