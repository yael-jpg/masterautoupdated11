import React, { useState } from 'react'
import { SectionCard } from '../components/SectionCard'

export function SubscriptionsPage({ token }) {
  const [activeTab, setActiveTab] = useState('active')
  const [search, setSearch] = useState('')

  const stats = [
    { label: 'ACTIVE SUBSCRIPTIONS', value: '0', trend: 'Healthy' },
    { label: 'EXPIRING SOON', value: '0', trend: '7 days' },
    { label: 'EXPIRED', value: '0', trend: 'Action needed' },
    { label: 'CANCELLED', value: '0', trend: 'Archived' },
    { label: 'MONTHLY REVENUE', value: '₱0', trend: 'Total' },
  ]

  return (
    <div className="page-grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">Subscription Management</h1>
          <p className="page-subtitle">Track and manage vehicle subscriptions</p>
        </div>
        <button className="btn-primary">+ Create Subscription</button>
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

      <SectionCard title="Subscriptions Directory">
        <div className="filter-bar">
          <div className="subscriptions-search">
            <svg className="subscriptions-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search customer, vehicle, package..."
              className="input-field subscriptions-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={() => setSearch('')}>Clear</button>
        </div>

        <div className="tabs-nav">
          <button className={activeTab === 'active' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('active')}>Active (0)</button>
          <button className={activeTab === 'expiring' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('expiring')}>Expiring (0)</button>
          <button className={activeTab === 'cancelled' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('cancelled')}>Cancelled (0)</button>
          <button className={activeTab === 'expired' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('expired')}>Expired (0)</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Package</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>End Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="6" className="table-empty">No subscriptions found in this view.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
