import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Search, Download, Calendar, Play, Pause, AlertCircle, Clock, MapPin, ArrowRight } from 'lucide-react';
import axios from 'axios';

// Custom Numbered Leaflet Markers
const createNumberedIcon = (number) => {
  return L.divIcon({
    html: `<div style="background-color:#2563EB;color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:2px solid white;box-shadow:0 4px 6px rgba(0,0,0,0.3);">${number}</div>`,
    className: 'custom-number-icon',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
};

export default function TrajectoryTracker({ selectedPlate, setSelectedPlate }) {
  const [searchPlate, setSearchPlate] = useState(selectedPlate || 'TN37AB1234');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);

  const [trajectoryData, setTrajectoryData] = useState(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Co-occurrence tab state
  const [activeSubTab, setActiveSubTab] = useState('SINGLE_PLATE'); // SINGLE_PLATE | CO_OCCURRENCE
  const [camA, setCamA] = useState('CAM-CBE-001');
  const [camB, setCamB] = useState('CAM-CBE-008');
  const [windowMins, setWindowMins] = useState(30);
  const [coOccurrenceResults, setCoOccurrenceResults] = useState(null);

  useEffect(() => {
    if (selectedPlate) {
      setSearchPlate(selectedPlate);
      fetchTrajectory(selectedPlate);
    } else {
      fetchTrajectory('TN37AB1234');
    }
  }, [selectedPlate]);

  useEffect(() => {
    let timer;
    if (isPlaying && trajectoryData && trajectoryData.sightings.length > 0) {
      timer = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= trajectoryData.sightings.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [isPlaying, trajectoryData]);

  const fetchTrajectory = async (plateToQuery) => {
    const plate = plateToQuery || searchPlate;
    if (!plate.trim()) return;
    setLoading(true);
    try {
      let url = `/api/trajectory/${plate.trim().toUpperCase()}`;
      if (fromDate || toDate) {
        url += `?from=${fromDate}&to=${toDate}`;
      }
      const res = await axios.get(url);
      setTrajectoryData(res.data);
      setPlaybackIndex(res.data.sightings.length > 0 ? res.data.sightings.length - 1 : 0);
    } catch (err) {
      console.error('Error fetching trajectory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCoOccurrenceSearch = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.get(`/api/trajectory/co-occurrence/search?camA=${camA}&camB=${camB}&windowMins=${windowMins}`);
      setCoOccurrenceResults(res.data);
    } catch (err) {
      console.error('Co-occurrence query error:', err);
    }
  };

  const exportCSV = () => {
    if (!trajectoryData || trajectoryData.sightings.length === 0) return;
    const headers = ['Sighting #', 'Camera ID', 'Camera Name', 'Zone', 'Timestamp', 'Speed Estimate (km/h)', 'Confidence'];
    const rows = trajectoryData.sightings.map((s, idx) => [
      idx + 1,
      s.cameraId,
      `"${s.cameraName}"`,
      `"${s.zone}"`,
      s.timestamp,
      s.speedEstimate,
      s.confidence
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Trajectory_${trajectoryData.matchedPlate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const coimbatoreCenter = [11.0168, 76.9656];

  return (
    <div className="h-[calc(100vh-65px)] flex flex-col bg-darkBg text-gray-100 overflow-hidden">
      {/* Top Search Controls Bar */}
      <div className="p-4 bg-cardBg border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Sub-tab switches */}
          <div className="flex bg-darkBg/80 p-1 rounded-lg border border-gray-800 text-xs font-semibold">
            <button
              onClick={() => setActiveSubTab('SINGLE_PLATE')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeSubTab === 'SINGLE_PLATE' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Single Plate Trajectory
            </button>
            <button
              onClick={() => setActiveSubTab('CO_OCCURRENCE')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeSubTab === 'CO_OCCURRENCE' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Co-Occurrence Query
            </button>
          </div>
        </div>

        {activeSubTab === 'SINGLE_PLATE' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchTrajectory();
            }}
            className="flex items-center space-x-3"
          >
            <div className="relative">
              <input
                type="text"
                placeholder="Enter License Plate (e.g. TN37AB1234)"
                value={searchPlate}
                onChange={(e) => setSearchPlate(e.target.value)}
                className="w-64 bg-darkBg text-xs font-mono font-bold text-blue-400 uppercase border border-gray-700 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-blue-500"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all"
            >
              {loading ? 'Searching...' : 'Track Trajectory'}
            </button>

            {trajectoryData && trajectoryData.sightings.length > 0 && (
              <button
                type="button"
                onClick={exportCSV}
                className="flex items-center space-x-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            )}
          </form>
        ) : (
          <form onSubmit={handleCoOccurrenceSearch} className="flex items-center space-x-3 text-xs">
            <span>Camera A:</span>
            <input
              type="text"
              value={camA}
              onChange={(e) => setCamA(e.target.value)}
              className="bg-darkBg border border-gray-700 rounded px-2 py-1 text-xs"
            />
            <span>Camera B:</span>
            <input
              type="text"
              value={camB}
              onChange={(e) => setCamB(e.target.value)}
              className="bg-darkBg border border-gray-700 rounded px-2 py-1 text-xs"
            />
            <span>Window (mins):</span>
            <input
              type="number"
              value={windowMins}
              onChange={(e) => setWindowMins(e.target.value)}
              className="bg-darkBg border border-gray-700 rounded w-16 px-2 py-1 text-xs"
            />
            <button type="submit" className="px-3 py-1 bg-blue-600 text-white font-bold rounded">
              Run Query
            </button>
          </form>
        )}
      </div>

      {/* Main Grid: Trajectory Map + Chronological Sightings Panel */}
      {activeSubTab === 'SINGLE_PLATE' ? (
        <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
          {/* Leaflet Trajectory Map */}
          <div className="col-span-8 bg-cardBg rounded-2xl border border-gray-800 flex flex-col relative overflow-hidden">
            {/* Playback Scrubber overlay */}
            {trajectoryData && trajectoryData.sightings.length > 0 && (
              <div className="p-3 bg-panelBg/80 border-b border-gray-800 flex items-center justify-between z-10">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <span className="text-xs text-gray-300 font-medium">
                    Sighting {playbackIndex + 1} of {trajectoryData.sightings.length}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max={trajectoryData.sightings.length - 1}
                  value={playbackIndex}
                  onChange={(e) => setPlaybackIndex(parseInt(e.target.value))}
                  className="flex-1 max-w-md mx-4 accent-blue-500"
                />

                <span className="text-xs font-mono text-blue-400 font-bold">
                  {new Date(trajectoryData.sightings[playbackIndex]?.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}

            <div className="flex-1 z-0">
              <MapContainer
                center={coimbatoreCenter}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                {/* Draw Route Polyline */}
                {trajectoryData && trajectoryData.sightings.length > 1 && (
                  <Polyline
                    positions={trajectoryData.sightings.map((s) => [s.location.coordinates[1], s.location.coordinates[0]])}
                    color="#3B82F6"
                    weight={4}
                    dashArray="8, 8"
                  />
                )}

                {/* Numbered Sightings Markers */}
                {trajectoryData &&
                  trajectoryData.sightings.slice(0, playbackIndex + 1).map((s, idx) => (
                    <Marker
                      key={s.eventId || idx}
                      position={[s.location.coordinates[1], s.location.coordinates[0]]}
                      icon={createNumberedIcon(idx + 1)}
                    >
                      <Popup>
                        <div className="text-xs space-y-1">
                          <p className="font-bold text-blue-400">Sighting #{idx + 1}</p>
                          <p className="text-gray-200 font-semibold">{s.cameraName}</p>
                          <p className="text-gray-400">Time: {new Date(s.timestamp).toLocaleString()}</p>
                          <p className="text-gray-400">Speed Est: {s.speedEstimate} km/h</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
          </div>

          {/* Right Panel: Chronological Sightings & Fuzzy Match List */}
          <div className="col-span-4 bg-cardBg rounded-2xl border border-gray-800 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-200">
                Sightings History ({trajectoryData ? trajectoryData.sightings.length : 0})
              </h2>
            </div>

            {trajectoryData && trajectoryData.isFuzzy && trajectoryData.fuzzyMatches.length > 0 && (
              <div className="p-3 bg-yellow-950/30 border border-yellow-800/50 rounded-xl mb-3 space-y-2">
                <div className="flex items-center space-x-2 text-yellow-400 text-xs font-bold">
                  <AlertCircle className="w-4 h-4" />
                  <span>Exact match not found. Fuzzy OCR Candidates:</span>
                </div>
                <div className="space-y-1">
                  {trajectoryData.fuzzyMatches.map((fm) => (
                    <button
                      key={fm.plateText}
                      onClick={() => {
                        setSelectedPlate(fm.plateText);
                        fetchTrajectory(fm.plateText);
                      }}
                      className="w-full text-left p-2 bg-darkBg hover:bg-gray-800 rounded border border-gray-700 flex items-center justify-between text-xs"
                    >
                      <span className="font-mono font-bold text-yellow-300">{fm.plateText}</span>
                      <span className="text-gray-400 text-[10px]">
                        {(fm.similarity * 100).toFixed(0)}% Similarity ({fm.sightingCount} hits)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {trajectoryData && trajectoryData.sightings.length > 0 ? (
                trajectoryData.sightings.map((s, idx) => (
                  <div
                    key={s.eventId || idx}
                    onClick={() => setPlaybackIndex(idx)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      playbackIndex === idx
                        ? 'bg-blue-950/40 border-blue-500 shadow-md'
                        : 'bg-darkBg/60 border-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-gray-200">{s.cameraName}</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold">{(s.confidence * 100).toFixed(0)}% OCR</span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                      <span>Zone: {s.zone}</span>
                      <span>{new Date(s.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                  Enter a plate string to search single-plate trajectory
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Co-occurrence Results Panel */
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-base font-bold mb-4">Co-Occurrence Vehicle Search Results</h2>
          {coOccurrenceResults && coOccurrenceResults.matches ? (
            <div className="space-y-2 max-w-4xl">
              {coOccurrenceResults.matches.map((m, idx) => (
                <div key={idx} className="p-3 bg-cardBg border border-gray-800 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-blue-400 text-sm">{m.plateText}</span>
                  <span>Sighted at {camA} &rarr; {camB}</span>
                  <span>Time Gap: {m.timeGapMinutes} mins</span>
                  <span className="text-gray-400">{m.vehicleType}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Run co-occurrence search to find vehicles seen at both cameras within time window.</p>
          )}
        </div>
      )}
    </div>
  );
}
