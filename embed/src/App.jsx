import React, { useState, useEffect } from 'react'
import PriceChart from './components/PriceChart'
import PriceDisplay from './components/PriceDisplay'

function App({ eventId, theme = 'light' }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [eventData, setEventData] = useState(null)
  const [chartData, setChartData] = useState([])
  const [selectedMetric, setSelectedMetric] = useState('avg') // 'min', 'avg', 'max'
  const [timeRange, setTimeRange] = useState('3day') // '3day', 'alltime'

  useEffect(() => {
    // Simulate data fetching (will be replaced with real Supabase call)
    const fetchData = async () => {
      setLoading(true)
      try {
        // Mock data for development
        const mockEventData = {
          title: 'Lakers vs Celtics',
          url: 'https://onlylocaltickets.com/events/lakers-celtics',
          currentPrices: {
            min: 125,
            avg: 285,
            max: 450
          },
          change24h: 5.2 // percentage
        }

        const mockChartData = generateMockChartData(timeRange)

        setEventData(mockEventData)
        setChartData(mockChartData)
        setLoading(false)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    }

    fetchData()
  }, [eventId, timeRange])

  if (loading) {
    return <div className="widget-loading">Loading ticket data...</div>
  }

  if (error) {
    return <div className="widget-error">Error: {error}</div>
  }

  if (!eventData) {
    return <div className="widget-error">No data available</div>
  }

  return (
    <div className={`ticket-widget theme-${theme}`}>
      {/* Event Title */}
      <div className="widget-header">
        <h3 className="event-title">
          <a href={eventData.url} target="_blank" rel="noopener noreferrer">
            {eventData.title}
          </a>
        </h3>
      </div>

      {/* Current Prices */}
      <PriceDisplay 
        prices={eventData.currentPrices}
        change24h={eventData.change24h}
        selectedMetric={selectedMetric}
      />

      {/* Toggle Controls */}
      <div className="widget-controls">
        <div className="metric-toggles">
          <button 
            className={selectedMetric === 'min' ? 'active' : ''}
            onClick={() => setSelectedMetric('min')}
          >
            Min
          </button>
          <button 
            className={selectedMetric === 'avg' ? 'active' : ''}
            onClick={() => setSelectedMetric('avg')}
          >
            Avg
          </button>
          <button 
            className={selectedMetric === 'max' ? 'active' : ''}
            onClick={() => setSelectedMetric('max')}
          >
            Max
          </button>
        </div>

        <div className="time-toggles">
          <button 
            className={timeRange === '3day' ? 'active' : ''}
            onClick={() => setTimeRange('3day')}
          >
            3 Days
          </button>
          <button 
            className={timeRange === 'alltime' ? 'active' : ''}
            onClick={() => setTimeRange('alltime')}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Chart */}
      <PriceChart 
        data={chartData}
        metric={selectedMetric}
        timeRange={timeRange}
      />

      {/* CTA Button */}
      <div className="widget-footer">
        <a 
          href={eventData.url} 
          className="cta-button"
          target="_blank" 
          rel="noopener noreferrer"
        >
          View Tickets
        </a>
      </div>
    </div>
  )
}

// Helper function to generate mock chart data
function generateMockChartData(timeRange) {
  const data = []
  const points = timeRange === '3day' ? 72 : 30 // 72 hours or 30 days
  const now = Date.now()
  const interval = timeRange === '3day' ? 3600000 : 86400000 // 1 hour or 1 day

  for (let i = points; i >= 0; i--) {
    const timestamp = now - (i * interval)
    data.push({
      timestamp,
      min: 100 + Math.random() * 50,
      avg: 250 + Math.random() * 100,
      max: 400 + Math.random() * 100
    })
  }

  return data
}

export default App
