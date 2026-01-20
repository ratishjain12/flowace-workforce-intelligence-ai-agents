/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import {
  getClassificationRules,
  getPendingClassifications,
  classifyApp,
  approveClassification,
  rejectClassification,
} from '../api';

interface Rule {
  id: string;
  app_name: string;
  classification: string;
  confidence: string;
  reasoning?: string;
}

interface PendingClassification {
  id: string;
  app_name: string;
  suggested_classification: string;
  confidence: string;
  reasoning: string;
  status: string;
}

export default function Classifications() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [pending, setPending] = useState<PendingClassification[]>([]);
  const [newAppName, setNewAppName] = useState('');
  const [classifyResult, setClassifyResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'rules' | 'pending' | 'classify'>('rules');

  useEffect(() => {
    loadRules();
    loadPending();
  }, []);

  const loadRules = async () => {
    try {
      const data = await getClassificationRules(100);
      setRules(data.items);
    } catch (err) {
      console.error('Failed to load rules:', err);
    }
  };

  const loadPending = async () => {
    try {
      const data = await getPendingClassifications();
      setPending(data.items);
    } catch (err) {
      console.error('Failed to load pending:', err);
    }
  };

  const handleClassify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;

    setLoading(true);
    setClassifyResult(null);

    try {
      const result = await classifyApp(newAppName.trim());
      setClassifyResult(result);
      setNewAppName('');
      loadPending();
      loadRules();
    } catch (err: any) {
      setClassifyResult({ error: err.response?.data?.error || 'Classification failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, override?: string) => {
    try {
      await approveClassification(id, override ? { overrideClassification: override } : undefined);
      loadPending();
      loadRules();
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      await rejectClassification(id, reason);
      loadPending();
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  const getClassBadge = (classification: string) => {
    const colors: Record<string, string> = {
      productive: '#22c55e',
      neutral: '#f59e0b',
      unproductive: '#ef4444',
    };
    return (
      <span className="badge" style={{ backgroundColor: colors[classification] || '#6b7280' }}>
        {classification}
      </span>
    );
  };

  return (
    <div className="classifications-container">
      <div className="view-tabs">
        <button
          className={activeView === 'rules' ? 'active' : ''}
          onClick={() => setActiveView('rules')}
        >
          Rules ({rules.length})
        </button>
        <button
          className={activeView === 'pending' ? 'active' : ''}
          onClick={() => setActiveView('pending')}
        >
          Pending ({pending.length})
        </button>
        <button
          className={activeView === 'classify' ? 'active' : ''}
          onClick={() => setActiveView('classify')}
        >
          Classify New
        </button>
      </div>

      {activeView === 'rules' && (
        <div className="rules-list">
          <h3>Classification Rules</h3>
          <table>
            <thead>
              <tr>
                <th>Application</th>
                <th>Classification</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.app_name}</td>
                  <td>{getClassBadge(rule.classification)}</td>
                  <td>{(parseFloat(rule.confidence) * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'pending' && (
        <div className="pending-list">
          <h3>Pending Approvals</h3>
          {pending.length === 0 ? (
            <p className="empty">No pending classifications</p>
          ) : (
            <div className="pending-cards">
              {pending.map((item) => (
                <div key={item.id} className="pending-card">
                  <h4>{item.app_name}</h4>
                  <p>
                    Suggested: {getClassBadge(item.suggested_classification)}
                    <span className="confidence">
                      ({(parseFloat(item.confidence) * 100).toFixed(0)}% confidence)
                    </span>
                  </p>
                  <p className="reasoning">{item.reasoning}</p>
                  <div className="actions">
                    <button
                      className="btn-approve"
                      onClick={() => handleApprove(item.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-override"
                      onClick={() => {
                        const override = prompt(
                          'Override classification (productive/neutral/unproductive):',
                          item.suggested_classification
                        );
                        if (override) handleApprove(item.id, override);
                      }}
                    >
                      Override
                    </button>
                    <button
                      className="btn-reject"
                      onClick={() => handleReject(item.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'classify' && (
        <div className="classify-form">
          <h3>Classify New Application</h3>
          <form onSubmit={handleClassify}>
            <input
              type="text"
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              placeholder="Enter application name (e.g., Notion, Canva)"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !newAppName.trim()}>
              {loading ? 'Classifying...' : 'Classify'}
            </button>
          </form>

          {classifyResult && (
            <div className={`result ${classifyResult.error ? 'error' : 'success'}`}>
              {classifyResult.error ? (
                <p>{classifyResult.error}</p>
              ) : (
                <>
                  <h4>{classifyResult.appName}</h4>
                  <p>
                    Classification: {getClassBadge(classifyResult.suggestedClassification)}
                  </p>
                  <p>Confidence: {(classifyResult.confidence * 100).toFixed(0)}%</p>
                  <p>Reasoning: {classifyResult.reasoning}</p>
                  <p>
                    {classifyResult.requiresApproval
                      ? 'Status: Pending approval'
                      : 'Status: Auto-approved'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
