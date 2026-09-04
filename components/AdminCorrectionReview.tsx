import React, { useState, useEffect } from 'react';
import { getFirebaseAuth } from '../services/firebase';

interface Correction {
  id: string;
  factId: string;
  category: string;
  statement: string;
  source: string;
  confidence: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface AdminCorrectionReviewProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminCorrectionReview: React.FC<AdminCorrectionReviewProps> = ({ isOpen, onClose }) => {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch pending corrections
  const fetchCorrections = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const response = await fetch('/api/v1/admin/corrections', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch corrections');
      }

      const { corrections } = await response.json();
      setCorrections(corrections);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error('[AdminCorrectionReview] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCorrections();
    }
  }, [isOpen]);

  // Approve or reject a correction
  const handleAction = async (correctionId: string, action: 'approve' | 'reject', confidence?: number) => {
    setProcessingId(correctionId);
    try {
      const auth = getFirebaseAuth();
      const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
      const response = await fetch('/api/v1/admin/corrections/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ correctionId, action, confidence }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update correction');
      }

      // Refresh the list
      await fetchCorrections();
    } catch (err: any) {
      alert(`Failed to ${action} correction: ${err.message}`);
      console.error('[AdminCorrectionReview] Action error:', err);
    } finally {
      setProcessingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Admin Correction Review</h2>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <div style={styles.content}>
          {loading && <p style={styles.loading}>Loading corrections...</p>}
          {error && <p style={styles.error}>Error: {error}</p>}
          
          {!loading && !error && corrections.length === 0 && (
            <p style={styles.empty}>No pending corrections to review.</p>
          )}

          {!loading && !error && corrections.length > 0 && (
            <div style={styles.table}>
              <table style={styles.tableElement}>
                <thead>
                  <tr>
                    <th style={styles.th}>Statement</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Source</th>
                    <th style={styles.th}>Created</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map((correction) => (
                    <tr key={correction.id} style={styles.tr}>
                      <td style={styles.tdStatement}>
                        <div style={styles.statement}>{correction.statement}</div>
                        {correction.tags.length > 0 && (
                          <div style={styles.tags}>
                            {correction.tags.map((tag, idx) => (
                              <span key={idx} style={styles.tag}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>{correction.category}</td>
                      <td style={styles.td}>{correction.source}</td>
                      <td style={styles.td}>
                        {new Date(correction.createdAt).toLocaleDateString()}
                      </td>
                      <td style={styles.tdActions}>
                        <ApprovalActions
                          correction={correction}
                          processingId={processingId}
                          onApprove={async (confidence) => handleAction(correction.id, 'approve', confidence)}
                          onReject={() => handleAction(correction.id, 'reject')}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button onClick={fetchCorrections} style={styles.refreshButton} disabled={loading}>
            Refresh
          </button>
          <button onClick={onClose} style={styles.closeModalButton}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-component for approval/rejection actions
const ApprovalActions: React.FC<{
  correction: Correction;
  processingId: string | null;
  onApprove: (confidence?: number) => Promise<void>;
  onReject: () => Promise<void>;
}> = ({ correction, processingId, onApprove, onReject }) => {
  const [showConfidence, setShowConfidence] = useState(false);
  const [confidenceValue, setConfidenceValue] = useState(correction.confidence * 100);

  const isProcessing = processingId === correction.id;

  const handleApproveClick = () => {
    setShowConfidence(true);
  };

  const handleApproveConfirm = async () => {
    await onApprove(confidenceValue / 100);
    setShowConfidence(false);
  };

  const handleRejectClick = async () => {
    if (window.confirm('Reject this correction?')) {
      await onReject();
    }
  };

  if (showConfidence) {
    return (
      <div style={styles.confidenceContainer}>
        <input
          type="number"
          min="0"
          max="100"
          value={confidenceValue}
          onChange={(e) => setConfidenceValue(Number(e.target.value))}
          style={styles.confidenceInput}
          autoFocus
        />
        <span>%</span>
        <button onClick={handleApproveConfirm} style={styles.confirmButton} disabled={isProcessing}>
          {isProcessing ? '...' : 'Confirm'}
        </button>
        <button onClick={() => setShowConfidence(false)} style={styles.cancelButton}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={styles.actionButtons}>
      <button
        onClick={handleApproveClick}
        style={{ ...styles.approveButton, opacity: isProcessing ? 0.5 : 1 }}
        disabled={isProcessing}
      >
        {isProcessing ? '...' : 'Approve'}
      </button>
      <button
        onClick={handleRejectClick}
        style={{ ...styles.rejectButton, opacity: isProcessing ? 0.5 : 1 }}
        disabled={isProcessing}
      >
        {isProcessing ? '...' : 'Reject'}
      </button>
    </div>
  );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '1200px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #e0e0e0',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: '#333',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#666',
    padding: '0',
    lineHeight: 1,
  },
  content: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
  },
  loading: {
    textAlign: 'center',
    color: '#666',
    padding: '40px',
  },
  error: {
    color: '#d32f2f',
    backgroundColor: '#ffebee',
    padding: '12px',
    borderRadius: '4px',
    border: '1px solid #d32f2f',
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '40px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableElement: {
    width: '100%',
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    borderBottom: '2px solid #e0e0e0',
    fontWeight: 600,
    color: '#555',
    fontSize: '14px',
  },
  tr: {
    borderBottom: '1px solid #e0e0e0',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#333',
    verticalAlign: 'top',
  },
  tdStatement: {
    padding: '12px',
    fontSize: '14px',
    color: '#333',
    verticalAlign: 'top',
    maxWidth: '400px',
  },
  tdActions: {
    padding: '12px',
    fontSize: '14px',
    color: '#333',
    verticalAlign: 'top',
    width: '150px',
  },
  statement: {
    marginBottom: '8px',
    lineHeight: 1.5,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  tag: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '12px',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  approveButton: {
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  rejectButton: {
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  confidenceContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  confidenceInput: {
    width: '60px',
    padding: '4px 8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '13px',
  },
  confirmButton: {
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  cancelButton: {
    backgroundColor: '#9e9e9e',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderTop: '1px solid #e0e0e0',
  },
  refreshButton: {
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  closeModalButton: {
    backgroundColor: '#757575',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
};
