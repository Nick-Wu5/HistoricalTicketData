import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

function PriceChart({ data, metric, timeRange }) {
  // Format timestamp for X-axis
  const formatXAxis = (timestamp) => {
    const date = new Date(timestamp)
    if (timeRange === '3day') {
      // Show hour format for 3-day view
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric',
        hour12: true 
      })
    } else {
      // Show date format for all-time view
      return date.toLocaleDateString('en-US', { 
        month: 'short',
        day: 'numeric' 
      })
    }
  }

  // Format price for Y-axis
  const formatYAxis = (value) => {
    return `$${value}`
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const date = new Date(data.timestamp)
      
      return (
        <div className="chart-tooltip">
          <div className="tooltip-date">
            {date.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </div>
          <div className="tooltip-price">
            ${data[metric].toFixed(0)}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="price-chart">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            tickFormatter={formatYAxis}
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey={metric}
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default PriceChart
