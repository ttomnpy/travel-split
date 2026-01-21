import { useAuth } from '../../contexts/AuthContext'
import { useTranslation } from '../../hooks/useTranslation'
import { Button } from '../../components'
import { BiMoney, BiPlus, BiHistory, BiTrendingUp, BiLogOut } from 'react-icons/bi'
import './HomePage.css'

function HomePage({ onLogout }) {
  const { user } = useAuth()
  const { t, setLanguage, currentLanguage } = useTranslation()

  // Dummy data for display
  const totalExpenses = 2450.50
  const yourShare = 1225.00
  const groupsCount = 3
  const recentTransactions = [
    {
      id: 1,
      name: t('common.appName'),
      amount: 250.00,
      date: '2 days ago',
      you: 'paid'
    },
    {
      id: 2,
      name: t('common.appName'),
      amount: 125.50,
      date: '5 days ago',
      you: 'owed'
    },
    {
      id: 3,
      name: t('common.appName'),
      amount: 399.99,
      date: '1 week ago',
      you: 'paid'
    }
  ]

  return (
    <div className="home-container">
      {/* Header */}
      <div className="home-header">
        <div className="header-top">
          <div className="logo-section">
            <div className="logo-icon">
              <BiMoney />
            </div>
            <div>
              <h1>{t('common.appName')}</h1>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className={`lang-btn ${currentLanguage === 'zh-HK' ? 'active' : ''}`}
              onClick={() => setLanguage('zh-HK')}
              title="繁体中文"
            >
              繁
            </button>
            <button
              className={`lang-btn ${currentLanguage === 'en-US' ? 'active' : ''}`}
              onClick={() => setLanguage('en-US')}
              title="English"
            >
              EN
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onLogout}
              className="logout-btn"
            >
              <BiLogOut /> {t('common.logout')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="home-content">
        {/* Quick Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">
              <BiTrendingUp />
            </div>
            <div className="stat-info">
              <p className="stat-label">{currentLanguage === 'zh-HK' ? '總支出' : 'Total Expenses'}</p>
              <p className="stat-value">${totalExpenses.toFixed(2)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon yourshare">
              <BiMoney />
            </div>
            <div className="stat-info">
              <p className="stat-label">{currentLanguage === 'zh-HK' ? '您的份額' : 'Your Share'}</p>
              <p className="stat-value">${yourShare.toFixed(2)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon groups">
              <BiPlus />
            </div>
            <div className="stat-info">
              <p className="stat-label">{currentLanguage === 'zh-HK' ? '群組' : 'Groups'}</p>
              <p className="stat-value">{groupsCount}</p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="recent-section">
          <div className="section-header">
            <BiHistory />
            <h2>{currentLanguage === 'zh-HK' ? '最近交易' : 'Recent Transactions'}</h2>
          </div>

          <div className="transactions-list">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="transaction-item">
                <div className="transaction-info">
                  <p className="transaction-name">{transaction.name}</p>
                  <p className="transaction-date">{transaction.date}</p>
                </div>
                <div className={`transaction-amount ${transaction.you}`}>
                  <span className="amount-text">
                    {transaction.you === 'paid' ? '+' : '-'}${transaction.amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <Button
            variant="primary"
            size="lg"
            className="action-btn new-expense"
          >
            <BiPlus /> {currentLanguage === 'zh-HK' ? '新增支出' : 'New Expense'}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="action-btn new-group"
          >
            <BiMoney /> {currentLanguage === 'zh-HK' ? '新建群組' : 'New Group'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default HomePage
