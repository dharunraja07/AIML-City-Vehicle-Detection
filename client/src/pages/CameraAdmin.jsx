import React from 'react';
import { Camera, CheckCircle, AlertCircle, Settings } from 'lucide-react';

export default function CameraAdmin({ cameras }) {
  return (
    <div className="h-[calc(100vh-65px)] p-6 bg-darkBg text-gray-100 overflow-y-auto space-y-6">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-xl font-extrabold flex items-center space-x-2 text-white">
            <Camera className="w-6 h-6 text-blue-400" />
            <span>Camera Network & Sensor Management</span>
          </h1>
          <p className="text-xs text-gray-400">
            View status, spatial coordinates, lane configuration, & speed limits for 30 city camera nodes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {cameras.map((cam) => (
          <div key={cam.cameraId} className="p-4 bg-cardBg border border-gray-800 rounded-2xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-200">{cam.name}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold">
                {cam.status}
              </span>
            </div>
            <p className="text-gray-400">ID: <span className="font-mono text-blue-400">{cam.cameraId}</span></p>
            <p className="text-gray-400">Zone: {cam.zone}</p>
            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-800 text-gray-400">
              <span>Lanes: {cam.laneCount}</span>
              <span>Direction: {cam.direction}</span>
              <span>Limit: {cam.speedLimitKmh} km/h</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
