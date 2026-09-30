import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, AlertOctagon, Flame, ArrowRightLeft, TrendingUp } from 'lucide-react';
import axios from 'axios';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function Analytics() {
  const [densityData, setDensityData] = useState(null);
  const [odData, setOdData] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [trends, setTrends] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [denRes, odRes, botRes, trRes] = await Promise.all([
        axios.get('/api/analytics/density'),
        axios.get('/api/analytics/od-matrix'),
        axios.get('/api/analytics/bottlenecks'),
        axios.get('/api/analytics/trends')
      ]);

      setDensityData(denRes.data);
      setOdData(odRes.data);
      setBottlenecks(botRes.data.bottlenecks || []);
      setTrends(trRes.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  return (
    <div className="h-[calc(100vh-65px)] p-6 bg-darkBg text-gray-100 overflow-y-auto space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-xl font-extrabold flex items-center space-x-2 text-white">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            <span>Macro Traffic Flow & Urban Analytics</span>
          </h1>
          <p className="text-xs text-gray-400">
            Real-time urban traffic density, origin-destination matrix, & congestion bottleneck monitoring.
          </p>
        </div>
      </div>

      {/* Top Grid: Congestion Bottlenecks List */}
      <div className="bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center space-x-2">
          <AlertOctagon className="w-4 h-4" />
          <span>Active Congestion Bottlenecks (Level of Service Rating)</span>
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {bottlenecks.length === 0 ? (
            <div className="col-span-3 text-xs text-gray-500 py-4 text-center">No severe congestion bottlenecks detected</div>
          ) : (
            bottlenecks.map((b) => (
              <div key={b.cameraId} className="p-3 bg-darkBg/80 border border-gray-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-200">{b.cameraName}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      b.severity === 'CRITICAL'
                        ? 'bg-red-900/60 text-red-400 border border-red-800/50'
                        : 'bg-yellow-900/60 text-yellow-400 border border-yellow-800/50'
                    }`}
                  >
                    {b.levelOfService}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">Zone: {b.zone}</p>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-gray-400">Avg Speed:</span>
                  <span className="font-bold text-red-400">{b.measuredSpeedKmh} / {b.speedLimitKmh} km/h</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Second Grid: Density Chart + O-D Matrix */}
      <div className="grid grid-cols-12 gap-6">
        {/* Zone Traffic Density */}
        <div className="col-span-6 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 flex items-center space-x-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Zone Traffic Density (Vehicles / Min)</span>
          </h2>

          <div className="h-64">
            {densityData && densityData.zoneDensity ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={densityData.zoneDensity}>
                  <XAxis dataKey="zone" stroke="#9CA3AF" fontSize={10} />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }} />
                  <Bar dataKey="vehiclesPerMin" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">Loading density data...</div>
            )}
          </div>
        </div>

        {/* Origin-Destination Matrix */}
        <div className="col-span-6 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 flex items-center space-x-2">
            <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
            <span>Top Origin-Destination (O-D) Trip Corridors</span>
          </h2>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {odData && odData.topODPairs ? (
              odData.topODPairs.map((od, idx) => (
                <div key={idx} className="p-2.5 bg-darkBg/60 border border-gray-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-200">{od.origin}</span>
                    <span className="text-gray-500">&rarr;</span>
                    <span className="font-bold text-blue-400">{od.destination}</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400">{od.count} Trips</span>
                </div>
              ))
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-gray-500">Loading O-D matrix...</div>
            )}
          </div>
        </div>
      </div>

      {/* Third Grid: Hourly Flow & Vehicle Mix */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200 flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span>Hourly Flow & Peak Hour Detection</span>
          </h2>

          <div className="h-56">
            {trends && trends.hourlyFlow ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.hourlyFlow}>
                  <XAxis dataKey="hour" stroke="#9CA3AF" fontSize={10} />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">Loading hourly trend...</div>
            )}
          </div>
        </div>

        <div className="col-span-4 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Vehicle Class Mix</h2>
          <div className="h-56 flex items-center justify-center">
            {trends && trends.vehicleMix ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={trends.vehicleMix} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70} label>
                    {trends.vehicleMix.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-gray-500">Loading mix...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
