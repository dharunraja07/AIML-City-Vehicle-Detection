import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

import Navbar from './components/Navbar';
import CommandCenter from './pages/CommandCenter';
import TrajectoryTracker from './pages/TrajectoryTracker';
import AnprLab from './pages/AnprLab';
import Analytics from './pages/Analytics';
import AlertsWatchlist from './pages/AlertsWatchlist';
import CameraAdmin from './pages/CameraAdmin';
import EvaluationReport from './pages/EvaluationReport';

const DEFAULT_CAMERAS = [
  { cameraId: "CAM-CBE-001", name: "Gandhipuram Junction North", location: { type: "Point", coordinates: [76.9656, 11.0168] }, zone: "Gandhipuram", speedLimitKmh: 50, status: "ACTIVE" },
  { cameraId: "CAM-CBE-002", name: "Gandhipuram Flyover South", location: { type: "Point", coordinates: [76.9660, 11.0145] }, zone: "Gandhipuram", speedLimitKmh: 60, status: "ACTIVE" },
  { cameraId: "CAM-CBE-004", name: "Lakshmi Mills Signal East", location: { type: "Point", coordinates: [76.9825, 11.0120] }, zone: "Avinashi Road", speedLimitKmh: 60, status: "ACTIVE" },
  { cameraId: "CAM-CBE-006", name: "Nava India Junction", location: { type: "Point", coordinates: [76.9920, 11.0165] }, zone: "Avinashi Road", speedLimitKmh: 60, status: "ACTIVE" },
  { cameraId: "CAM-CBE-008", name: "Hope College Junction", location: { type: "Point", coordinates: [77.0165, 11.0280] }, zone: "Peelamedu", speedLimitKmh: 60, status: "ACTIVE" },
  { cameraId: "CAM-CBE-012", name: "RS Puram DB Road Signal", location: { type: "Point", coordinates: [76.9530, 11.0080] }, zone: "RS Puram", speedLimitKmh: 40, status: "ACTIVE" },
  { cameraId: "CAM-CBE-018", name: "Town Hall Clock Tower", location: { type: "Point", coordinates: [76.9600, 10.9950] }, zone: "Town Hall", speedLimitKmh: 30, status: "ACTIVE" },
  { cameraId: "CAM-CBE-025", name: "Sulur Toll Gate East", location: { type: "Point", coordinates: [77.1250, 10.9850] }, zone: "Sulur", speedLimitKmh: 80, status: "ACTIVE" }
];

const socket = io('/', { autoConnect: true });

export default function App() {
  const [activeTab, setActiveTab] = useState('command');
  const [role, setRole] = useState('operator');

  const [liveEvents, setLiveEvents] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [cameras, setCameras] = useState(DEFAULT_CAMERAS);

  const [selectedPlate, setSelectedPlate] = useState('TN37AB1234');
  const [isDemoActive, setIsDemoActive] = useState(false);

  useEffect(() => {
    fetchInitialData();

    socket.on('connect', () => {
      console.log('[Socket.IO Connected]');
    });

    socket.on('detection:new', (evt) => {
      setLiveEvents((prev) => [evt, ...prev.slice(0, 49)]);
    });

    socket.on('alert:new', (alert) => {
      setLiveAlerts((prev) => [alert, ...prev.slice(0, 29)]);
    });

    return () => {
      socket.off('connect');
      socket.off('detection:new');
      socket.off('alert:new');
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const [camRes, evtRes, altRes] = await Promise.allSettled([
        axios.get('/api/cameras'),
        axios.get('/api/events/recent?limit=20'),
        axios.get('/api/alerts?limit=20')
      ]);

      if (camRes.status === 'fulfilled' && Array.isArray(camRes.value.data) && camRes.value.data.length > 0) {
        setCameras(camRes.value.data);
      }
      if (evtRes.status === 'fulfilled' && evtRes.value.data && evtRes.value.data.events) {
        setLiveEvents(evtRes.value.data.events);
      }
      if (altRes.status === 'fulfilled' && altRes.value.data && altRes.value.data.alerts) {
        setLiveAlerts(altRes.value.data.alerts);
      }
    } catch (err) {
      console.error('Error fetching initial app data:', err);
    }
  };

  const handleTriggerDemo = async () => {
    setIsDemoActive(true);
    alert('NetraTrack 3-Minute Pitch Demo Mode Activated! Watch live camera detections & alerts fire on the map.');
    setTimeout(() => {
      setIsDemoActive(false);
    }, 180000);
  };

  const handleSearchPlate = (plate) => {
    setSelectedPlate(plate);
    setActiveTab('trajectory');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-darkBg overflow-hidden select-none">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onTriggerDemo={handleTriggerDemo}
        isDemoActive={isDemoActive}
        activeAlertCount={liveAlerts.length}
        role={role}
        setRole={setRole}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab === 'command' && (
          <CommandCenter
            liveEvents={liveEvents}
            liveAlerts={liveAlerts}
            cameras={cameras}
            onSearchPlate={handleSearchPlate}
          />
        )}

        {activeTab === 'trajectory' && (
          <TrajectoryTracker
            selectedPlate={selectedPlate}
            setSelectedPlate={setSelectedPlate}
          />
        )}

        {activeTab === 'anpr_lab' && (
          <AnprLab onSelectPlate={handleSearchPlate} />
        )}

        {activeTab === 'analytics' && <Analytics />}

        {activeTab === 'alerts' && <AlertsWatchlist liveAlerts={liveAlerts} />}

        {activeTab === 'admin' && <CameraAdmin cameras={cameras} />}

        {activeTab === 'evaluation' && <EvaluationReport />}
      </main>
    </div>
  );
}
