import React, { useState } from 'react'
import { SectionCard } from '../components/SectionCard'

export function PMSPage() {
  const [activeTab, setActiveTab] = useState('tracking')

  const stats = [
    { label: 'ACTIVE PMS BOOKINGS', value: '0', trend: 'Current' },
    { label: 'VEHICLES DUE THIS WEEK', value: '0', trend: 'Upcoming' },
    { label: 'COMPLETED SERVICES', value: '0', trend: 'Total' },
    { label: 'TOTAL PMS REVENUE', value: '$0', trend: 'Accumulated' },
  ]

  const renderHeaders = () => {
    switch (activeTab) {
      case 'tracking':
        return (
          <>
            <th>Subscription</th>
            <th>Vehicle</th>
            <th>Due Date</th>
            <th>Status</th>
          </>
        )
      case 'requests':
      case 'history':
        return (
          <>
            <th>Reference</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Status</th>
          </>
        )
      default:
        return <th>Data</th>
    }
  }

  return (
    <div className="page-grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">PMS Management</h1>
          <p className="page-subtitle">Preventive Maintenance Service overview & tracking</p>
        </div>
      </header>

      <section className="kpi-grid">
        {stats.map((st, i) => (
          <article key={i} className="stat-card">
            <p className="stat-label">{st.label}</p>
            <h3>{st.value}</h3>
            <span>{st.trend}</span>
          </article>
        ))}
      </section>

      <div className="tabs-nav">
        <button className={activeTab === 'tracking' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('tracking')}>Service Tracking</button>
        <button className={activeTab === 'requests' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('requests')}>Service Requests</button>
        <button className={activeTab === 'history' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('history')}>Service History</button>
      </div>

      <SectionCard 
        title={'PMS ' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        actionLabel="Refresh"
        onActionClick={() => console.log('refresh')}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {renderHeaders()}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" className="table-empty">No data found for {activeTab}.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
