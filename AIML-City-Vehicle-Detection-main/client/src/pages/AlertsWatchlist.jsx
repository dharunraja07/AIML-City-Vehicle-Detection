import React, { useState, useEffect } from 'react';
import { Bell, ShieldAlert, Plus, CheckCircle, XCircle, AlertTriangle, Eye, Shield } from 'lucide-react';
import axios from 'axios';

export default function AlertsWatchlist({ liveAlerts }) {
  const [activeTab, setActiveTab] = useState('ALERTS_FEED'); // ALERTS_FEED | WATCHLIST_CRUD
  const [alerts, setAlerts] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [severityFilter, setSeverityFilter] = useState('');

  // Watchlist form state
  const [newPlate, setNewPlate] = useState('');
  const [newReason, setNewReason] = useState('STOLEN');
  const [newPriority, setNewPriority] = useState('HIGH');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    fetchAlerts();
    fetchWatchlist();
  }, [severityFilter]);

  const fetchAlerts = async () => {
    try {
      let url = '/api/alerts?limit=50';
      if (severityFilter) url += `&severity=${severityFilter}`;
      const res = await axios.get(url);
      setAlerts(res.data.alerts || []);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const res = await axios.get('/api/watchlist');
      setWatchlist(res.data || []);
    } catch (err) {
      console.error('Error fetching watchlist:', err);
    }
  };

  const handleUpdateStatus = async (alertId, newStatus) => {
    try {
      await axios.put(`/api/alerts/${alertId}/status`, {
        status: newStatus,
        operatorNotes: `Updated to ${newStatus} by Operator`
      });
      fetchAlerts();
    } catch (err) {
      console.error('Error updating alert:', err);
    }
  };

  const handleAddWatchlist = async (e) => {
    e.preventDefault();
    if (!newPlate.trim()) return;
    try {
      await axios.post('/api/watchlist', {
        plateText: newPlate,
        reason: newReason,
        priority: newPriority,
        notes: newNotes,
        addedBy: 'Control Room Officer'
      });
      setNewPlate('');
      setNewNotes('');
      fetchWatchlist();
      alert(`Plate ${newPlate} successfully blacklisted!`);
    } catch (err) {
      console.error('Error adding watchlist plate:', err);
    }
  };

  const handleRemoveWatchlist = async (id) => {
    try {
      await axios.delete(`/api/watchlist/${id}`);
      fetchWatchlist();
    } catch (err) {
      console.error('Error deleting watchlist entry:', err);
    }
  };

  return (
    <div className="h-[calc(100vh-65px)] p-6 bg-darkBg text-gray-100 overflow-y-auto space-y-6">
      {/* Header & Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-xl font-extrabold flex items-center space-x-2 text-white">
            <ShieldAlert className="w-6 h-6 text-red-400" />
            <span>Alerts & Blacklist Watchlist Management</span>
          </h1>
          <p className="text-xs text-gray-400">
            Real-time security alert lifecycle, anomaly explainability, & vehicle blacklist manager.
          </p>
        </div>

        <div className="flex bg-cardBg p-1 rounded-xl border border-gray-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('ALERTS_FEED')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              activeTab === 'ALERTS_FEED' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Live Alert Feed ({alerts.length})
          </button>
          <button
            onClick={() => setActiveTab('WATCHLIST_CRUD')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              activeTab === 'WATCHLIST_CRUD' ? 'bg-red-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Blacklist Watchlist ({watchlist.length})
          </button>
        </div>
      </div>

      {activeTab === 'ALERTS_FEED' ? (
        <div className="space-y-4">
          {/* Severity Filter Bar */}
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-gray-400 font-medium">Filter Severity:</span>
            {['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 rounded-lg font-bold border transition-all ${
                  severityFilter === sev
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-cardBg border-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {sev === '' ? 'ALL SEVERITIES' : sev}
              </button>
            ))}
          </div>

          {/* Alerts Feed Cards */}
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="text-xs text-gray-500 py-12 text-center">No alerts found for selected filter</div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.alertId} className="p-4 bg-cardBg border border-gray-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="px-3 py-1 bg-red-950/80 text-red-400 border border-red-800/60 font-mono font-bold text-sm rounded-lg">
                        {alert.plateText}
                      </span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-darkBg text-gray-300 border border-gray-700">
                        {alert.type}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-600 text-white'
                            : alert.severity === 'HIGH'
                            ? 'bg-orange-600 text-white'
                            : 'bg-yellow-600 text-white'
                        }`}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-[10px] text-gray-400">{new Date(alert.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Reason Explanation (WHY IT FIRED) */}
                  <div className="p-3 bg-darkBg/80 rounded-xl border border-gray-800 text-xs space-y-1">
                    <p className="font-bold text-gray-300">Alert Explanation (Explainable AI Rules Engine):</p>
                    <p className="text-gray-400 leading-relaxed">{alert.reasonDetails}</p>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400">Status:</span>
                      <span className="font-bold text-blue-400 uppercase">{alert.status}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {alert.status === 'NEW' && (
                        <button
                          onClick={() => handleUpdateStatus(alert.alertId, 'ACKNOWLEDGED')}
                          className="px-3 py-1 bg-yellow-600/20 text-yellow-400 border border-yellow-600/40 rounded-lg hover:bg-yellow-600/30"
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleUpdateStatus(alert.alertId, 'RESOLVED')}
                          className="px-3 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 rounded-lg hover:bg-emerald-600/30"
                        >
                          Resolve Alert
                        </button>
                      )}
                      {alert.status !== 'FALSE_POSITIVE' && (
                        <button
                          onClick={() => handleUpdateStatus(alert.alertId, 'FALSE_POSITIVE')}
                          className="px-3 py-1 bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700"
                        >
                          Mark False Positive
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Blacklist Watchlist CRUD */
        <div className="grid grid-cols-12 gap-6">
          {/* Add Blacklist Form */}
          <div className="col-span-5 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 flex items-center space-x-2 border-b border-gray-800 pb-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Add Vehicle to Blacklist Watchlist</span>
            </h2>

            <form onSubmit={handleAddWatchlist} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-semibold">License Plate Number</label>
                <input
                  type="text"
                  placeholder="e.g. TN37AB1234"
                  value={newPlate}
                  onChange={(e) => setNewPlate(e.target.value)}
                  className="w-full bg-darkBg text-blue-400 font-mono font-bold border border-gray-700 rounded-lg px-3 py-2 uppercase"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1 font-semibold">Reason Category</label>
                  <select
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="w-full bg-darkBg text-gray-200 border border-gray-700 rounded-lg px-3 py-2"
                  >
                    <option value="STOLEN">STOLEN</option>
                    <option value="WANTED">WANTED</option>
                    <option value="EXPIRED_INSURANCE">EXPIRED INSURANCE</option>
                    <option value="SUSPICIOUS">SUSPICIOUS</option>
                    <option value="CUSTOM">CUSTOM</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1 font-semibold">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full bg-darkBg text-gray-200 border border-gray-700 rounded-lg px-3 py-2"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-semibold">Notes & Case Case Details</label>
                <textarea
                  rows="3"
                  placeholder="Enter FIR / Case references or alert instructions..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-darkBg text-gray-200 border border-gray-700 rounded-lg p-2.5"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all"
              >
                Blacklist Vehicle
              </button>
            </form>
          </div>

          {/* Active Watchlist Items */}
          <div className="col-span-7 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 flex items-center space-x-2 border-b border-gray-800 pb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Active Blacklisted Vehicles ({watchlist.length})</span>
            </h2>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {watchlist.map((item) => (
                <div key={item._id} className="p-3 bg-darkBg/80 border border-gray-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-red-400 text-sm">{item.plateText}</span>
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-red-900/60 text-red-300">
                        {item.reason}
                      </span>
                    </div>
                    <p className="text-gray-400 text-[11px]">{item.notes}</p>
                    <p className="text-gray-500 text-[10px]">Added by: {item.addedBy}</p>
                  </div>

                  <button
                    onClick={() => handleRemoveWatchlist(item._id)}
                    className="p-1.5 bg-gray-800 hover:bg-red-900/40 text-gray-400 hover:text-red-400 rounded-lg transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
