// 格式化工具函數
export const formatCurrency = (amount, currency = 'HKD') => {
  return new Intl.NumberFormat('zh-HK', {
    style: 'currency',
    currency: currency
  }).format(amount)
}

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('zh-HK', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
