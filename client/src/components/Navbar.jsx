import React from 'react';
import { Shield, MapPin, Activity, Cpu, Bell, BarChart3, Settings, Play, Database } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onTriggerDemo, isDemoActive, activeAlertCount, role, setRole }) {
  const tabs = [
    { id: 'command', label: 'Command Center', icon: MapPin },
    { id: 'anpr_lab', label: 'ANPR Lab', icon: Cpu },
    { id: 'trajectory', label: 'Trajectory Tracker', icon: Activity },
    { id: 'analytics', label: 'Urban Analytics', icon: BarChart3 },
    { id: 'alerts', label: 'Alerts & Watchlist', icon: Bell, badge: activeAlertCount },
    { id: 'admin', label: 'Camera Admin', icon: Settings },
    { id: 'evaluation', label: 'ANPR Evaluation', icon: Database },
  ];

  return (
    <header className="bg-cardBg border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Brand & Tagline */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-blue-600/20 border border-blue-500/40 rounded-lg text-blue-400">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-extrabold tracking-wide text-white">NetraTrack</h1>
            <span className="text-[10px] bg-blue-900/60 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-700/50">BEL SIH-26127</span>
          </div>
          <p className="text-xs text-gray-400">One city, every camera, one trajectory.</p>
        </div>
      </div>

      {/* Nav Tabs */}
      <nav className="flex space-x-1 bg-darkBg/80 p-1 rounded-xl border border-gray-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Demo Controls & Role Selector */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onTriggerDemo}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            isDemoActive
              ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300 animate-pulse'
              : 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-600/30'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isDemoActive ? 'Demo Playing (3m)...' : 'Run 3-Min Demo'}</span>
        </button>

        {/* Role Selector */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-gray-800 text-gray-200 text-xs border border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="admin">Role: Admin</option>
          <option value="operator">Role: Operator</option>
          <option value="viewer">Role: Viewer</option>
        </select>
      </div>
    </header>
  );
}
