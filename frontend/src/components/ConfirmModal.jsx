import { Modal } from './Modal'

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  onClose, // Alias for onCancel to ensure all modals behave correctly
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  variant = 'danger', 
  confirmColor,
  loading = false, 
  children 
}) {
  if (!isOpen) return null

  const handleCancel = onCancel || onClose
  const btnStyle = confirmColor ? { background: confirmColor, borderColor: confirmColor, color: '#fff' } : {}

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title={title}>
      <div className="confirm-content">
        {children ? children : <p>{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn-secondary" onClick={handleCancel} disabled={loading}>
            {cancelText}
          </button>
          <button 
            type="button" 
            className={confirmColor ? 'btn-primary' : `btn-${variant}`} 
            style={btnStyle}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  )
}
