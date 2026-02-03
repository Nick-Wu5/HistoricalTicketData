import React from 'react'

function PriceDisplay({ prices, change24h, selectedMetric }) {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price)
  }

  const formatChange = (change) => {
    const sign = change >= 0 ? '+' : ''
    return `${sign}${change.toFixed(1)}%`
  }

  return (
    <div className="price-display">
      <div className="price-grid">
        <div className={`price-item ${selectedMetric === 'min' ? 'selected' : ''}`}>
          <div className="price-label">Min</div>
          <div className="price-value">{formatPrice(prices.min)}</div>
        </div>
        
        <div className={`price-item ${selectedMetric === 'avg' ? 'selected' : ''}`}>
          <div className="price-label">Avg</div>
          <div className="price-value">{formatPrice(prices.avg)}</div>
        </div>
        
        <div className={`price-item ${selectedMetric === 'max' ? 'selected' : ''}`}>
          <div className="price-label">Max</div>
          <div className="price-value">{formatPrice(prices.max)}</div>
        </div>
      </div>

      <div className={`change-indicator ${change24h >= 0 ? 'positive' : 'negative'}`}>
        <span className="change-arrow">{change24h >= 0 ? '↑' : '↓'}</span>
        <span className="change-value">{formatChange(change24h)}</span>
        <span className="change-label">24h</span>
      </div>
    </div>
  )
}

export default PriceDisplay
