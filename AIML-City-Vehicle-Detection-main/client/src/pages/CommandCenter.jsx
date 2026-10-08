import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Activity, Camera, AlertTriangle, Gauge, Search, Flame, RefreshCw, Zap, Mic } from 'lucide-react';
import axios from 'axios';

// Custom Camera Marker Icons
const cameraIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const alertCameraIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function CommandCenter({ liveEvents, liveAlerts, cameras, onSearchPlate }) {
  const [stats, setStats] = useState({
    vehiclesToday: 0,
    activeCameras: 30,
    openAlerts: 0,
    avgCitySpeedKmh: 48
  });

  const [nlQuery, setNlQuery] = useState('');
  const [nlResult, setNlResult] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // Check browser Web Speech API support
  const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const handleMicClick = () => {
    if (!SpeechRecognition) return;
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setNlQuery(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (e) {
      console.warn('Speech recognition start failed:', e);
      setIsListening(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/events/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleNlSearch = async (e) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    try {
      const res = await axios.post('/api/llm/query', { prompt: nlQuery });
      setNlResult(res.data);
      if (res.data.structuredFilters && res.data.structuredFilters.plateText) {
        onSearchPlate(res.data.structuredFilters.plateText);
      }
    } catch (err) {
      console.error('LLM query error:', err);
    }
  };

  const coimbatoreCenter = [11.0168, 76.9656];

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col bg-darkBg text-gray-100 overflow-hidden">
      {/* Top KPI Bar */}
      <div className="grid grid-cols-4 gap-4 p-4 bg-cardBg border-b border-gray-800">
        <div className="bg-darkBg/60 p-3 rounded-xl border border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Vehicles Detected Today</p>
            <h3 className="text-2xl font-black text-white font-mono">{stats.vehiclesToday.toLocaleString()}</h3>
          </div>
          <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-darkBg/60 p-3 rounded-xl border border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Active CCTV Cameras</p>
            <h3 className="text-2xl font-black text-emerald-400 font-mono">{stats.activeCameras} / 30</h3>
          </div>
          <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-lg">
            <Camera className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-darkBg/60 p-3 rounded-xl border border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Active Security Alerts</p>
            <h3 className="text-2xl font-black text-red-400 font-mono">{stats.openAlerts}</h3>
          </div>
          <div className="p-2.5 bg-red-600/20 text-red-400 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-darkBg/60 p-3 rounded-xl border border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Avg City Traffic Speed</p>
            <h3 className="text-2xl font-black text-yellow-400 font-mono">{stats.avgCitySpeedKmh} <span className="text-xs">km/h</span></h3>
          </div>
          <div className="p-2.5 bg-yellow-600/20 text-yellow-400 rounded-lg">
            <Gauge className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Grid: GIS Map + Real-time Tickers */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Left Side: Interactive GIS Map */}
        <div className="col-span-8 bg-cardBg rounded-2xl border border-gray-800 flex flex-col relative overflow-hidden">
          {/* Map Controls Header */}
          <div className="p-3 border-b border-gray-800 bg-panelBg/50 flex items-center justify-between z-10">
            <form onSubmit={handleNlSearch} className="flex-1 max-w-md relative">
              <input
                type="text"
                placeholder="Ask AI: 'Where was TN34AB1234 between 6pm and 9pm?'"
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                className="w-full bg-darkBg text-xs text-gray-200 border border-gray-700 rounded-lg pl-9 pr-9 py-1.5 focus:outline-none focus:border-blue-500"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
              {SpeechRecognition && (
                <button
                  type="button"
                  onClick={handleMicClick}
                  title="Voice Search (Web Speech API)"
                  className={`absolute right-2 top-1.5 p-1 rounded-md transition ${
                    isListening ? 'bg-red-600 text-white animate-pulse' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                showHeatmap
                  ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{showHeatmap ? 'Heatmap Active' : 'Toggle Density Heatmap'}</span>
            </button>
          </div>

          {/* Leaflet Map */}
          <div className="flex-1 z-0">
            <MapContainer
              center={coimbatoreCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              className="z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {cameras.map((cam) => {
                const hasActiveAlert = liveAlerts.some((a) => a.cameraId === cam.cameraId);
                return (
                  <Marker
                    key={cam.cameraId}
                    position={[cam.location.coordinates[1], cam.location.coordinates[0]]}
                    icon={hasActiveAlert ? alertCameraIcon : cameraIcon}
                  >
                    <Popup>
                      <div className="text-xs space-y-1">
                        <p className="font-bold text-blue-400">{cam.name}</p>
                        <p className="text-gray-300">ID: {cam.cameraId}</p>
                        <p className="text-gray-300">Zone: {cam.zone}</p>
                        <p className="text-gray-300">Speed Limit: {cam.speedLimitKmh} km/h</p>
                        <p className="text-emerald-400 font-semibold">Status: {cam.status}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        {/* Right Side: Real-Time Live Ticker Feed */}
        <div className="col-span-4 flex flex-col space-y-4 overflow-hidden">
          {/* Security Alert Feed */}
          <div className="flex-1 bg-cardBg rounded-2xl border border-gray-800 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Real-Time Security Alerts</h2>
              </div>
              <span className="text-[10px] bg-red-900/40 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-800/50">
                LIVE
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {liveAlerts.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  No active security alerts
                </div>
              ) : (
                liveAlerts.map((alert, idx) => (
                  <div
                    key={alert.alertId || idx}
                    className="p-2.5 bg-red-950/30 border border-red-800/50 rounded-xl space-y-1 text-xs animate-fadeIn"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-red-400">{alert.plateText}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-900/60 text-red-300">
                        {alert.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-tight">{alert.reasonDetails}</p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
                      <span>Camera: {alert.cameraId}</span>
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live ANPR Event Stream Ticker */}
          <div className="flex-1 bg-cardBg rounded-2xl border border-gray-800 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">Live ANPR Detection Stream</h2>
              </div>
              <span className="text-[10px] bg-blue-900/40 text-blue-400 font-bold px-2 py-0.5 rounded-full border border-blue-800/50">
                SOCKET.IO
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {liveEvents.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  Waiting for live camera detections...
                </div>
              ) : (
                liveEvents.map((evt, idx) => (
                  <div
                    key={evt.eventId || idx}
                    onClick={() => onSearchPlate(evt.plateText)}
                    className="p-2 bg-darkBg/80 border border-gray-800 hover:border-blue-500/50 rounded-xl flex items-center justify-between cursor-pointer transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-1 bg-blue-950/60 text-blue-400 font-mono font-bold text-xs rounded border border-blue-800/40">
                        {evt.plateText}
                      </span>
                      <div>
                        <p className="text-xs text-gray-200 font-semibold">{evt.cameraName || evt.cameraId}</p>
                        <p className="text-[10px] text-gray-400">{evt.vehicleType} &bull; {evt.speedEstimate} km/h</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-400 font-bold block">
                        {(evt.confidence * 100).toFixed(0)}% OCR
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
