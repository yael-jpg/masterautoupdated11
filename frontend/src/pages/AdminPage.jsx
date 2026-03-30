import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiDownload, pushToast } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'

const PAGE_SIZE = 8

const emptyUserForm = { fullName: '', email: '', password: '', roleId: '' }

export function AdminPage({ token, user }) {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [masterData, setMasterData] = useState(null)
  const [error, setError] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userForm, setUserForm] = useState(emptyUserForm)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, name } of user to delete
  const [deleting, setDeleting] = useState(false)

  const isSuperAdmin = user?.role === 'SuperAdmin'

  const [usersPage, setUsersPage] = useState(1)
  const [activeTab, setActiveTab] = useState('payment')

  // Client Management state
  const [clients, setClients] = useState([])
  const [clientSearch, setClientSearch] = useState('')
  const [clientsPage, setClientsPage] = useState(1)
  const [blockingId, setBlockingId] = useState(null)

  // Backup & Export state
  const [lastBackup, setLastBackup] = useState(null)
  const [backupSchedule, setBackupSchedule] = useState('Daily')
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
              const [usersData, logs, master, rolesData, clientsData, backupStatus] = await Promise.all([
          apiGet('/admin/users', token),
          apiGet('/admin/audit-logs', token).catch(() => []),
          apiGet('/admin/master-data', token),
          apiGet('/admin/roles', token).catch(() => []),
          apiGet('/customers', token, { limit: 200, portal: 'true' }).catch(() => ({ data: [] })),
          apiGet('/admin/backup/status', token).catch(() => ({})),
        ])

        setUsers(
          usersData.map((u) => ({
            key: `user-${u.id}`,
            cells: [
              u.full_name,
              u.email,
              u.role,
              u.is_active ? '● Active' : '○ Inactive',
            ],
            raw: u,
          })),
        )

        setAuditLogs(
          (logs || []).map((log) => ({
            key: `log-${log.id}`,
            cells: [
              new Date(log.created_at).toLocaleString('en-PH', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              log.action,
              log.entity,
              log.entity_id ?? '—',
              log.user_id,
            ],
            raw: log,
          })),
        )

        setMasterData(master)
        setRoles(rolesData || [])
        setClients(
          (clientsData?.data || []).slice().sort((a, b) => {
            const at = a?.created_at ? new Date(a.created_at).getTime() : 0
            const bt = b?.created_at ? new Date(b.created_at).getTime() : 0
            if (bt !== at) return bt - at
            return Number(b?.id || 0) - Number(a?.id || 0)
          }),
        )
        // Set default roleId to the first role returned (SuperAdmin)
        if (rolesData && rolesData.length > 0) {
          setUserForm((prev) => ({ ...prev, roleId: String(rolesData[0].id) }))
        }

        // Backup panel
        if (backupStatus && typeof backupStatus === 'object') {
          if (backupStatus.schedule) setBackupSchedule(String(backupStatus.schedule))
          if (backupStatus.lastBackupAt) {
            try {
              setLastBackup(new Date(backupStatus.lastBackupAt).toLocaleString('en-PH'))
            } catch {
              setLastBackup(String(backupStatus.lastBackupAt))
            }
          }
        }
      } catch (loadError) {
        setError(loadError.message)
      }
    }
    load()
  }, [token])

  const handleBackupScheduleChange = async (next) => {
    const nextSchedule = String(next || '').trim()
    setBackupSchedule(nextSchedule)
    try {
      await apiPut('/admin/backup/schedule', token, { schedule: nextSchedule })
      pushToast('success', 'Backup schedule saved')
    } catch (err) {
      pushToast('error', err.message)
    }
  }

  useEffect(() => {
    if (!token) return
    let stopped = false

    const refreshClientsSilent = async () => {
      try {
        const clientsData = await apiGet('/customers', token, { limit: 200, portal: 'true' })
        if (stopped) return
        setClients(
          (clientsData?.data || []).slice().sort((a, b) => {
            const at = a?.created_at ? new Date(a.created_at).getTime() : 0
            const bt = b?.created_at ? new Date(b.created_at).getTime() : 0
            if (bt !== at) return bt - at
            return Number(b?.id || 0) - Number(a?.id || 0)
          }),
        )
      } catch {
        // silent
      }
    }

    const handleFocus = () => refreshClientsSilent()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshClientsSilent()
    }

    const intervalMs = 5000
    const id = setInterval(refreshClientsSilent, intervalMs)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stopped = true
      clearInterval(id)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [token])

  const refreshClients = async () => {
    try {
      const clientsData = await apiGet('/customers', token, { limit: 200, portal: 'true' })
      setClients(
        (clientsData?.data || []).slice().sort((a, b) => {
          const at = a?.created_at ? new Date(a.created_at).getTime() : 0
          const bt = b?.created_at ? new Date(b.created_at).getTime() : 0
          if (bt !== at) return bt - at
          return Number(b?.id || 0) - Number(a?.id || 0)
        }),
      )
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  const handleBlockToggle = async (client) => {
    setBlockingId(client.id)
    try {
      await apiPatch(`/customers/${client.id}/block`, token, { block: !client.is_blocked })
      pushToast(
        client.is_blocked ? 'success' : 'error',
        `${client.full_name} ${client.is_blocked ? 'unblocked' : 'blocked'} successfully`,
      )
      await refreshClients()
    } catch (err) {
      pushToast('error', err.message)
    } finally {
      setBlockingId(null)
    }
  }

  const refreshUsers = async () => {
    try {
      const usersData = await apiGet('/admin/users', token)
      setUsers(
        usersData.map((u) => ({
          key: `user-${u.id}`,
          cells: [
            u.full_name,
            u.email,
            u.role,
            u.is_active ? '● Active' : '○ Inactive',
          ],
          raw: u,
        })),
      )
    } catch (e) {
      setError(e.message)
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await apiPost('/admin/users', token, {
        fullName: userForm.fullName,
        email: userForm.email,
        password: userForm.password,
        roleId: Number(userForm.roleId),
      })
      pushToast('add', `User "${userForm.fullName}" created successfully`)
      setShowAddUser(false)
      setUserForm({ ...emptyUserForm, roleId: roles.length > 0 ? String(roles[0].id) : '' })
      await refreshUsers()
    } catch (err) {
      pushToast('error', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await apiDelete(`/admin/users/${confirmDelete.id}`, token)
      pushToast('success', `User "${confirmDelete.name}" deleted successfully`)
      setConfirmDelete(null)
      await refreshUsers()
    } catch (err) {
      pushToast('error', err.message)
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleCloseAddUser = () => {
    setShowAddUser(false)
    setUserForm({ ...emptyUserForm, roleId: roles.length > 0 ? String(roles[0].id) : '' })
  }

  // Backup handler
  const handleManualBackup = async () => {
    setIsBackingUp(true)
    try {
      const filename = `db-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`
      await apiDownload('/admin/backup/download', token, filename)
      // Refresh displayed last-backup timestamp from server (more accurate)
      const st = await apiGet('/admin/backup/status', token).catch(() => ({}))
      if (st?.lastBackupAt) {
        try { setLastBackup(new Date(st.lastBackupAt).toLocaleString('en-PH')) } catch { setLastBackup(String(st.lastBackupAt)) }
      } else {
        setLastBackup(new Date().toLocaleString('en-PH'))
      }
      pushToast('success', 'Database backup downloaded')
    } catch (err) {
      pushToast('error', `Backup failed: ${err.message}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  // Export handlers
  const handleExportReports = async (format) => {
    setIsExporting(true)
    try {
      await apiDownload(`/admin/export?format=${format}`, token, `reports.${format}`)
      pushToast('success', `Reports exported to ${format.toUpperCase()}`)
    } catch (err) {
      pushToast('error', `Export failed: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  /* ---- paginated slices ---- */
  const usersTotalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
  const pagedUsers = useMemo(() => {
    const s = (usersPage - 1) * PAGE_SIZE
    return users.slice(s, s + PAGE_SIZE)
  }, [users, usersPage])

  const CLIENT_PAGE_SIZE = 8
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients
    const q = clientSearch.toLowerCase()
    return clients.filter(c =>
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.mobile?.toLowerCase().includes(q)
    )
  }, [clients, clientSearch])
  const clientsTotalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENT_PAGE_SIZE))
  const pagedClients = useMemo(() => {
    const s = (clientsPage - 1) * CLIENT_PAGE_SIZE
    return filteredClients.slice(s, s + CLIENT_PAGE_SIZE)
  }, [filteredClients, clientsPage])
  const blockedCount = useMemo(() => clients.filter(c => c.is_blocked).length, [clients])

  // Filter critical actions
  const criticalActions = useMemo(() => {
    return auditLogs.filter((log) => {
      const action = log.raw.action?.toLowerCase() || ''
      const entity = log.raw.entity?.toLowerCase() || ''
      return (
        action.includes('delete') || 
        action.includes('edit') || 
        action.includes('void') ||
        entity.includes('invoice') || 
        entity.includes('discount') || 
        entity.includes('payment')
      )
    })
  }, [auditLogs])

  /* ---- master-data tab rows ---- */
  const masterTabs = [
    { key: 'payment', label: 'Payment Methods' },
    { key: 'discount', label: 'Discount Rules' },
    { key: 'commission', label: 'Commissions' },
    { key: 'template', label: 'Templates' },
  ]

  const masterTableData = useMemo(() => {
    if (!masterData) return { headers: [], rows: [] }

    switch (activeTab) {
      case 'payment':
        return {
          headers: ['Method', 'Status'],
          rows: masterData.paymentMethods.map((m) => [
            m.method_name,
            m.is_active ? '● Active' : '○ Inactive',
          ]),
        }
      case 'discount':
        return {
          headers: ['Rule', 'Type', 'Value', 'Approval'],
          rows: masterData.discountRules.map((d) => [
            d.rule_name,
            d.discount_type,
            d.discount_type === 'percent' ? `${d.value}%` : `₱${Number(d.value).toLocaleString()}`,
            d.requires_approval ? 'Required' : 'Auto',
          ]),
        }
      case 'commission':
        return {
          headers: ['Staff', 'Service Category', 'Commission %'],
          rows: masterData.commissionRules.map((c) => [
            c.staff_name,
            c.service_category,
            `${c.commission_percent}%`,
          ]),
        }
      case 'template':
        return {
          headers: ['Channel', 'Template Name', 'Message'],
          rows: masterData.notificationTemplates.map((t) => [
            t.channel,
            t.template_name,
            t.message_template.length > 60
              ? `${t.message_template.slice(0, 60)}…`
              : t.message_template,
          ]),
        }
      default:
        return { headers: [], rows: [] }
    }
  }, [masterData, activeTab])

  return (
    <div className="page-grid">
      {error ? <p className="page-error">{error}</p> : null}

      {/* ── Stats Strip ── */}
      <div className="adm-stats-strip">
        <div className="adm-stat">
          <span className="adm-stat-label">Total Users</span>
          <span className="adm-stat-value">{users.length}</span>
          <span className="adm-stat-sub">registered accounts</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Active</span>
          <span className="adm-stat-value" style={{ color: '#22c55e' }}>
            {users.filter(u => u.raw?.is_active).length}
          </span>
          <span className="adm-stat-sub">users online</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Critical Actions</span>
          <span className="adm-stat-value" style={{ color: criticalActions.length > 0 ? '#f59e0b' : '#e2e8f0' }}>
            {criticalActions.length}
          </span>
          <span className="adm-stat-sub">in audit log</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Payment Methods</span>
          <span className="adm-stat-value">{masterData ? masterData.paymentMethods.length : '—'}</span>
          <span className="adm-stat-sub">configured</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Discount Rules</span>
          <span className="adm-stat-value">{masterData ? masterData.discountRules.length : '—'}</span>
          <span className="adm-stat-sub">configured</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Total Clients</span>
          <span className="adm-stat-value">{clients.length}</span>
          <span className="adm-stat-sub">{blockedCount > 0 ? <span style={{ color: '#f87171' }}>{blockedCount} blocked</span> : 'all active'}</span>
        </div>
      </div>

      {/* ── Users ── */}
      <SectionCard
        title="Users & Roles"
        subtitle="Registered system users, roles, and account status"
        actionLabel="+ Add User"
        onActionClick={() => setShowAddUser(true)}
      >
        <DataTable
          headers={['Name', 'Email', 'Role', 'Status']}
          rows={pagedUsers}
          rowActions={isSuperAdmin ? (u) => (
            <div className="row-actions">
              <button
                type="button"
                className="btn-icon action-danger"
                title="Delete user permanently"
                onClick={() => setConfirmDelete({ id: u.id, name: u.full_name })}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ) : undefined}
        />
        {users.length > PAGE_SIZE && (
          <PaginationBar
            page={usersPage}
            totalPages={usersTotalPages}
            total={users.length}
            onPageChange={setUsersPage}
          />
        )}

        <Modal isOpen={showAddUser} onClose={handleCloseAddUser} title="Add New User">
          <form className="entity-form" onSubmit={handleAddUser}>
            <div className="form-group">
              <label>Full Name <span className="required-star">*</span></label>
              <input
                placeholder="Full name"
                value={userForm.fullName}
                onChange={(e) => setUserForm((p) => ({ ...p, fullName: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Email <span className="required-star">*</span></label>
              <input
                type="email"
                placeholder="user@masterauto.com"
                value={userForm.email}
                onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Min 6 characters"
                value={userForm.password}
                onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select
                value={userForm.roleId}
                onChange={(e) => setUserForm((p) => ({ ...p, roleId: e.target.value }))}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="form-actions full-width">
              <button type="button" className="btn-secondary" onClick={handleCloseAddUser}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      </SectionCard>

      {/* ── Client Management ── */}
      <SectionCard
        title="Client Management"
        subtitle="Clients who created an account in the online booking system — block or unblock portal access"
      >
        <div className="adm-client-toolbar">
          <div className="adm-client-search-wrap">
            <svg className="adm-client-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="adm-client-search"
              placeholder="Search by name, email or mobile…"
              value={clientSearch}
              onChange={(e) => { setClientSearch(e.target.value); setClientsPage(1) }}
            />
          </div>
          <div className="adm-client-counts">
            <span className="adm-client-badge adm-client-badge--total">{clients.length} clients</span>
            {blockedCount > 0 && (
              <span className="adm-client-badge adm-client-badge--blocked">{blockedCount} blocked</span>
            )}
          </div>
        </div>

        {pagedClients.length === 0 ? (
          <p className="adm-stat-sub" style={{ padding: '12px 0', fontSize: '0.9rem' }}>
            {clientSearch ? 'No clients match your search.' : 'No clients registered yet.'}
          </p>
        ) : (
          <div className="adm-client-table-wrap">
            <table className="adm-client-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Registered</th>
                  <th>Vehicles</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedClients.map((client) => (
                  <tr key={client.id} className={client.is_blocked ? 'adm-client-row--blocked' : ''}>
                    <td className="adm-client-name">{client.full_name}</td>
                    <td>{client.mobile || <span className="adm-client-empty">—</span>}</td>
                    <td>{client.email || <span className="adm-client-empty">—</span>}</td>
                    <td>
                      {client.created_at
                        ? new Date(client.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                        : <span className="adm-client-empty">—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{client.vehicle_count ?? 0}</td>
                    <td>
                      <span className={`adm-client-status ${client.is_blocked ? 'adm-client-status--blocked' : 'adm-client-status--active'}`}>
                        {client.is_blocked ? '● Blocked' : '● Active'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`adm-block-btn ${client.is_blocked ? 'adm-block-btn--unblock' : 'adm-block-btn--block'}`}
                        onClick={() => handleBlockToggle(client)}
                        disabled={blockingId === client.id}
                      >
                        {blockingId === client.id
                          ? '…'
                          : client.is_blocked ? 'Unblock' : 'Block'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredClients.length > CLIENT_PAGE_SIZE && (
          <PaginationBar
            page={clientsPage}
            totalPages={clientsTotalPages}
            total={filteredClients.length}
            onPageChange={setClientsPage}
          />
        )}
      </SectionCard>

      {/* ── Audit Log ── */}
      <SectionCard
        title="Audit Log - Critical Actions"
        subtitle="Delete/edit invoices, discount changes, payment edits - track all sensitive operations"
        actionNode={
          criticalActions.length > 0
            ? <span className="adm-log-badge">{criticalActions.length}</span>
            : null
        }
      >
        {criticalActions.length === 0 ? (
          <p className="adm-stat-sub" style={{ fontSize: '0.9rem', padding: '8px 0' }}>No critical actions logged yet.</p>
        ) : (
          <div className="adm-log-wrap">
            <DataTable
              headers={['Timestamp', 'Action', 'Entity', 'Entity ID', 'User ID']}
              rows={criticalActions}
            />
          </div>
        )}
      </SectionCard>

      {/* ── Master Data ── */}
      <SectionCard
        title="Master Data"
        subtitle="Payment methods, discount rules, commissions, and notification templates"
      >
        <div className="admin-tabs">
          {masterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`admin-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {masterData ? (
          <DataTable headers={masterTableData.headers} rows={masterTableData.rows} />
        ) : (
          <p className="adm-stat-sub" style={{ fontSize: '0.9rem', padding: '8px 0' }}>Loading master data…</p>
        )}
      </SectionCard>

      {/* ── Data Management & Backups ── */}
      <SectionCard
        title="Data Management & Backups"
        subtitle="Automated backups and data export for reporting"
      >
        <div className="adm-data-grid">

          {/* Backup Panel */}
          <div className="adm-panel">
            <div className="adm-panel-head">
              <div className="adm-panel-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <div>
                <p className="adm-panel-title">Database Backup</p>
                <p className="adm-panel-sub">Automated scheduled backups</p>
              </div>
            </div>
            <span className="adm-last-backup">Last backup: {lastBackup || 'Never'}</span>
            <div className="adm-schedule-field">
              <label className="adm-schedule-label">Schedule</label>
              <select
                className="adm-schedule-select"
                value={backupSchedule}
                onChange={(e) => handleBackupScheduleChange(e.target.value)}
              >
                <option>Hourly</option>
                <option>Daily</option>
                <option>Weekly</option>
              </select>
            </div>
            <button type="button" className="adm-backup-btn" onClick={handleManualBackup} disabled={isBackingUp}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              {isBackingUp ? 'Backing up…' : 'Manual Backup'}
            </button>
          </div>

          {/* Export Panel */}
          <div className="adm-panel">
            <div className="adm-panel-head">
              <div className="adm-panel-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div>
                <p className="adm-panel-title">Export Reports</p>
                <p className="adm-panel-sub">Download financial &amp; operational data</p>
              </div>
            </div>
            <div className="adm-export-btns">
              <button type="button" className="adm-export-btn" onClick={() => handleExportReports('xlsx')} disabled={isExporting}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18M3 15h18M9 3v18"/>
                </svg>
                {isExporting ? 'Exporting…' : 'Excel (.xlsx)'}
              </button>
              <button type="button" className="adm-export-btn" onClick={() => handleExportReports('csv')} disabled={isExporting}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>
                {isExporting ? 'Exporting…' : 'CSV (.csv)'}
              </button>
            </div>
          </div>

        </div>
      </SectionCard>

      {/* ── Info Panels ── */}
      <section className="quick-panels">
        <article>
          <h3>Critical Controls</h3>
          <p>Full audit trail for deleted/edited invoices, discounts, and payment changes with user accountability.</p>
        </article>
        <article>
          <h3>Data Protection</h3>
          <p>Daily automated backups + manual backup option. Export to Excel/CSV for reports and compliance.</p>
        </article>
        <article>
          <h3>System Info</h3>
          <p>
            {masterData
              ? `${masterData.paymentMethods.length} payment methods · ${masterData.discountRules.length} discount rules · ${masterData.commissionRules.length} commissions · ${masterData.notificationTemplates.length} templates`
              : 'Loading…'}
          </p>
        </article>
      </section>

      {/* ── Delete User Confirm Modal ── */}
      {confirmDelete && (
        <Modal isOpen={true} onClose={() => setConfirmDelete(null)} title="Delete User">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '14px',
              padding: '16px', background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: '#ef4444', fontSize: '0.92rem' }}>This action is permanent</p>
                <p style={{ margin: '6px 0 0', color: 'rgba(189,200,218,0.8)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  You are about to permanently delete the user account for <strong style={{ color: '#e2e8f0' }}>{confirmDelete.name}</strong>.
                  This cannot be undone.
                </p>
              </div>
            </div>
            <div className="form-actions full-width">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                onClick={handleDeleteUser}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
