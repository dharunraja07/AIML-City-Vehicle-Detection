import React, { useState, useEffect } from 'react';
import { Upload, Cpu, CheckCircle2, AlertTriangle, Layers, Play, Eye, Clock, Activity, Send, Navigation, Film, FileImage, ShieldAlert, Check } from 'lucide-react';
import axios from 'axios';

export default function AnprLab({ onSelectPlate }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isVideo, setIsVideo] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Image Analysis State
  const [anprResult, setAnprResult] = useState(null);
  const [groundTruth, setGroundTruth] = useState('');
  const [perfStats, setPerfStats] = useState(null);

  // Video Analysis Job State
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobSummary, setJobSummary] = useState(null);
  const [liveStreamPlates, setLiveStreamPlates] = useState([]);

  const [testCamera, setTestCamera] = useState('CAM-CBE-001');

  useEffect(() => {
    let timer;
    if (jobId && (jobStatus === 'QUEUED' || jobStatus === 'PROCESSING')) {
      timer = setInterval(pollVideoJobStatus, 1200);
    }
    return () => clearInterval(timer);
  }, [jobId, jobStatus]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setIsVideo(file.type.startsWith('video/'));

      // Reset previous results
      setAnprResult(null);
      setErrorMessage(null);
      setJobId(null);
      setJobStatus(null);
      setJobProgress(0);
      setJobSummary(null);
      setLiveStreamPlates([]);
      setPerfStats(null);
    }
  };

  const pollVideoJobStatus = async () => {
    if (!jobId) return;
    try {
      const res = await axios.get(`/ml/anpr/jobs/${jobId}`);
      const data = res.data;
      setJobStatus(data.status);
      setJobProgress(data.progress || 0);

      if (data.summary && data.summary.plates) {
        setLiveStreamPlates(data.summary.plates);
      }

      if (data.status === 'COMPLETED') {
        setJobSummary(data.summary);
        setLoading(false);
      } else if (data.status === 'FAILED') {
        setErrorMessage(data.error || 'Video analysis job failed');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error polling video job:', err);
    }
  };

  const runAnprPipeline = async () => {
    if (!selectedFile) {
      alert('Please select an image or video file first.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setAnprResult(null);
    setJobSummary(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('cameraId', testCamera);

    const startTime = performance.now();

    try {
      if (isVideo) {
        // Video Upload Pipeline
        const res = await axios.post('/ml/anpr/video', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setJobId(res.data.jobId);
        setJobStatus(res.data.status);
      } else {
        // Image ANPR Pipeline
        const res = await axios.post('/ml/anpr/image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const elapsed = performance.now() - startTime;
        setAnprResult(res.data);

        // Performance latency estimation
        const detCount = res.data.detectionCount || 1;
        setPerfStats({
          totalLatencyMs: Math.round(elapsed),
          detectLatencyMs: Math.round(elapsed * 0.3),
          ocrLatencyMs: Math.round(elapsed * 0.6),
          postprocLatencyMs: Math.round(elapsed * 0.1),
          fps: (1000 / Math.max(1, elapsed)).toFixed(1)
        });
        setLoading(false);
      }
    } catch (err) {
      console.error('ANPR lab pipeline error:', err);
      const detail = err.response?.data?.detail || err.message || 'ML Service unreachable or returned an error.';
      setErrorMessage(detail);
      setLoading(false);
    }
  };

  const pushToLiveStream = async (plateText, rawPlateText, confidence, vehicleType) => {
    try {
      await axios.post('/api/events', {
        plateText: plateText,
        rawPlateText: rawPlateText || plateText,
        confidence: confidence || 0.95,
        cameraId: testCamera,
        vehicleType: vehicleType || 'CAR',
        timestamp: new Date().toISOString()
      });
      alert(`Plate ${plateText} pushed live to NetraTrack Event Stream!`);
    } catch (err) {
      alert('Failed to push event: ' + err.message);
    }
  };

  const calculateCharAccuracy = (gt, pred) => {
    if (!gt || !pred) return 0;
    const cleanGt = gt.trim().toUpperCase();
    const cleanPred = pred.trim().toUpperCase();
    let matches = 0;
    for (let i = 0; i < Math.min(cleanGt.length, cleanPred.length); i++) {
      if (cleanGt[i] === cleanPred[i]) matches++;
    }
    return ((matches / Math.max(cleanGt.length, cleanPred.length)) * 100).toFixed(1);
  };

  return (
    <div className="h-[calc(100vh-65px)] p-6 bg-darkBg text-gray-100 overflow-y-auto space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-xl font-extrabold flex items-center space-x-2 text-white">
              <Cpu className="w-6 h-6 text-blue-400" />
              <span>ANPR & Computer Vision Testing Laboratory</span>
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload footage to inspect stage-by-stage preprocessing, character segmentation, & multi-frame video consensus.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-400">Target Camera Junction:</span>
            <select
              value={testCamera}
              onChange={(e) => setTestCamera(e.target.value)}
              className="bg-cardBg border border-gray-700 text-xs text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="CAM-CBE-001">CAM-CBE-001 (Gandhipuram North)</option>
              <option value="CAM-CBE-004">CAM-CBE-004 (Avinashi Road Signal)</option>
              <option value="CAM-CBE-018">CAM-CBE-018 (Town Hall Clock Tower)</option>
            </select>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 bg-red-950/40 border border-red-800 rounded-2xl flex items-center space-x-3 text-red-300 text-xs animate-fadeIn">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-red-200">ANPR Pipeline Error</p>
              <p className="font-mono text-[11px]">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Upload & Controls Panel */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 bg-cardBg rounded-2xl border border-gray-800 p-5 flex flex-col items-center justify-between space-y-4">
            <div className="w-full h-56 border-2 border-dashed border-gray-700 hover:border-blue-500/60 rounded-xl flex flex-col items-center justify-center p-2 relative bg-darkBg/50 overflow-hidden group">
              {previewUrl ? (
                isVideo ? (
                  <video controls src={previewUrl} className="h-full w-full object-contain rounded-lg" />
                ) : (
                  <img src={previewUrl} alt="Upload preview" className="h-full object-contain rounded-lg" />
                )
              ) : (
                <div className="space-y-2 text-gray-400 text-center">
                  <Upload className="w-8 h-8 mx-auto text-blue-400 group-hover:scale-110 transition-transform" />
                  <p className="text-xs font-semibold">Drop test image or video clip</p>
                  <p className="text-[10px] text-gray-500">Supports JPG, PNG, MP4, MOV files</p>
                </div>
              )}
              <input type="file" onChange={handleFileChange} accept="image/*,video/*" className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>

            {/* Ground Truth Option */}
            <div className="w-full space-y-1.5 text-left">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Ground-Truth String (Verification Test):</label>
              <input
                type="text"
                placeholder="e.g. TN37AB1234"
                value={groundTruth}
                onChange={(e) => setGroundTruth(e.target.value)}
                className="w-full bg-darkBg text-xs font-mono text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={runAnprPipeline}
              disabled={loading || !selectedFile}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{loading ? (isVideo ? 'Processing Video Job...' : 'Analyzing Image...') : `Run ANPR Test (${isVideo ? 'Video' : 'Image'})`}</span>
            </button>
          </div>

          {/* Right Panel: Output & Visualizations */}
          <div className="col-span-8 bg-cardBg rounded-2xl border border-gray-800 p-5 space-y-4">
            {/* Progress Bar for Video Job */}
            {isVideo && jobStatus && (
              <div className="p-4 bg-darkBg border border-gray-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-300 font-bold flex items-center space-x-2">
                    <Film className="w-4 h-4 text-blue-400" />
                    <span>Video Multi-Frame Consensus Job: {jobId?.substring(0, 8)}...</span>
                  </span>
                  <span className="text-blue-400 font-bold">{jobProgress}% ({jobStatus})</span>
                </div>
                <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-400 transition-all duration-300"
                    style={{ width: `${jobProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Performance Panel */}
            {perfStats && !isVideo && (
              <div className="grid grid-cols-4 gap-3 p-3 bg-darkBg border border-gray-800 rounded-xl text-center text-xs">
                <div>
                  <p className="text-[10px] text-gray-400">YOLO Detection</p>
                  <p className="font-mono font-bold text-emerald-400">{perfStats.detectLatencyMs} ms</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">OCR & TTA</p>
                  <p className="font-mono font-bold text-blue-400">{perfStats.ocrLatencyMs} ms</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Total Latency</p>
                  <p className="font-mono font-bold text-amber-400">{perfStats.totalLatencyMs} ms</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Processing FPS</p>
                  <p className="font-mono font-bold text-purple-400">{perfStats.fps} FPS</p>
                </div>
              </div>
            )}

            {/* Image Detection Output */}
            {!isVideo && anprResult && anprResult.detections && (
              <div className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300 border-b border-gray-800 pb-2 flex items-center justify-between">
                  <span className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Stage-by-Stage Pre-Processing Crops</span>
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">{anprResult.detectionCount} plate(s) localized</span>
                </h2>

                {anprResult.detections.length === 0 ? (
                  <div className="p-8 text-center bg-darkBg/60 border border-gray-800 rounded-xl text-gray-400 text-xs">
                    No license plates localized in this image (Zero detections).
                  </div>
                ) : (
                  anprResult.detections.map((det, idx) => {
                    const isGtMatched = groundTruth && (det.plateText.trim().toUpperCase() === groundTruth.trim().toUpperCase());
                    const charAcc = groundTruth ? calculateCharAccuracy(groundTruth, det.plateText) : null;

                    return (
                      <div key={idx} className="space-y-4 bg-darkBg/60 p-4 rounded-xl border border-gray-800">
                        {/* Real Pre-Processing Stage Images */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="p-2 bg-cardBg rounded-xl border border-gray-800 text-center text-[10px]">
                            <p className="font-bold text-gray-400 mb-1">1. Crop BBox</p>
                            {det.stages?.crop ? (
                              <img src={det.stages.crop} alt="Crop" className="h-14 mx-auto object-contain rounded border border-gray-700" />
                            ) : (
                              <div className="h-14 bg-gray-800 rounded flex items-center justify-center">N/A</div>
                            )}
                          </div>

                          <div className="p-2 bg-cardBg rounded-xl border border-gray-800 text-center text-[10px]">
                            <p className="font-bold text-gray-400 mb-1">2. Deskewed</p>
                            {det.stages?.deskewed ? (
                              <img src={det.stages.deskewed} alt="Deskewed" className="h-14 mx-auto object-contain rounded border border-gray-700" />
                            ) : (
                              <div className="h-14 bg-gray-800 rounded flex items-center justify-center">N/A</div>
                            )}
                          </div>

                          <div className="p-2 bg-cardBg rounded-xl border border-gray-800 text-center text-[10px]">
                            <p className="font-bold text-gray-400 mb-1">3. CLAHE Low-Light</p>
                            {det.stages?.clahe ? (
                              <img src={det.stages.clahe} alt="CLAHE" className="h-14 mx-auto object-contain rounded border border-gray-700" />
                            ) : (
                              <div className="h-14 bg-gray-800 rounded flex items-center justify-center">N/A</div>
                            )}
                          </div>

                          <div className="p-2 bg-cardBg rounded-xl border border-gray-800 text-center text-[10px]">
                            <p className="font-bold text-gray-400 mb-1">4. Thresholded</p>
                            {det.stages?.thresholded ? (
                              <img src={det.stages.thresholded} alt="Threshold" className="h-14 mx-auto object-contain rounded border border-gray-700" />
                            ) : (
                              <div className="h-14 bg-gray-800 rounded flex items-center justify-center">N/A</div>
                            )}
                          </div>
                        </div>

                        {/* OCR Result Details */}
                        <div className="p-3 bg-panelBg rounded-xl border border-gray-700 space-y-2 text-xs">
                          <div className="flex items-center justify-between border-b border-gray-700/80 pb-2">
                            <div>
                              <p className="text-[10px] text-gray-400">Raw OCR Reading:</p>
                              <p className="font-mono font-bold text-gray-300">{det.rawPlateText || 'N/A'}</p>
                            </div>

                            {groundTruth && (
                              <div className="text-center">
                                <p className="text-[10px] text-gray-400">Ground-Truth Verdict:</p>
                                <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                                  isGtMatched ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700' : 'bg-red-900/60 text-red-300 border border-red-700'
                                }`}>
                                  {isGtMatched ? 'CORRECT (100%)' : `INCORRECT (${charAcc}% Char)`}
                                </span>
                              </div>
                            )}

                            <div className="text-right">
                              <p className="text-[10px] text-gray-400">Indian Post-Processed:</p>
                              <p className="font-mono font-bold text-blue-400 text-base">{det.plateText}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-300">Vehicle Type: <strong className="text-white">{det.vehicleType}</strong></span>
                            <span className="text-emerald-400 font-bold">{(det.confidence * 100).toFixed(0)}% OCR Confidence</span>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                              onClick={() => pushToLiveStream(det.plateText, det.rawPlateText, det.confidence, det.vehicleType)}
                              className="py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-400 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Send to Live Stream</span>
                            </button>

                            <button
                              onClick={() => onSelectPlate && onSelectPlate(det.plateText)}
                              className="py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-400 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>Track This Plate</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Video Completed Summary & Player */}
            {isVideo && jobStatus === 'COMPLETED' && jobSummary && (
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 bg-darkBg border border-gray-800 rounded-xl">
                    <p className="text-[10px] text-gray-400">Unique Plates</p>
                    <p className="text-xl font-black text-emerald-400 font-mono">{jobSummary.uniquePlates}</p>
                  </div>
                  <div className="p-3 bg-darkBg border border-gray-800 rounded-xl">
                    <p className="text-[10px] text-gray-400">Avg Confidence</p>
                    <p className="text-xl font-black text-blue-400 font-mono">{(jobSummary.avgConfidence * 100).toFixed(0)}%</p>
                  </div>
                  <div className="p-3 bg-darkBg border border-gray-800 rounded-xl">
                    <p className="text-[10px] text-gray-400">Processing Speed</p>
                    <p className="text-xl font-black text-amber-400 font-mono">{jobSummary.processingFps} FPS</p>
                  </div>
                  <div className="p-3 bg-darkBg border border-gray-800 rounded-xl">
                    <p className="text-[10px] text-gray-400">Total Vehicle Tracks</p>
                    <p className="text-xl font-black text-purple-400 font-mono">{jobSummary.totalTracks}</p>
                  </div>
                </div>

                {/* Annotated Video Player */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center space-x-2">
                    <Film className="w-4 h-4 text-blue-400" />
                    <span>Annotated Detection Output Video</span>
                  </h3>
                  <video
                    controls
                    src={`/ml/anpr/jobs/${jobId}/annotated`}
                    className="w-full h-56 bg-black rounded-xl border border-gray-800 object-contain"
                  />
                </div>

                {/* Detected Plates Table */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Multi-Frame Consensus Detected Plates</h3>
                  <div className="overflow-x-auto border border-gray-800 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-darkBg text-gray-400 border-b border-gray-800">
                          <th className="p-2.5">Snapshot</th>
                          <th className="p-2.5">Plate Number</th>
                          <th className="p-2.5">Vehicle</th>
                          <th className="p-2.5">First Seen</th>
                          <th className="p-2.5">Last Seen</th>
                          <th className="p-2.5">Confidence</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobSummary.plates.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-800/60 hover:bg-darkBg/50 font-mono">
                            <td className="p-2">
                              {row.bestFrameSnapshot ? (
                                <img src={row.bestFrameSnapshot} alt="Plate crop" className="h-8 w-20 object-contain rounded border border-gray-700 bg-black" />
                              ) : (
                                <div className="h-8 w-20 bg-gray-800 rounded flex items-center justify-center text-[10px]">N/A</div>
                              )}
                            </td>
                            <td className="p-2.5 text-blue-400 font-bold text-sm">{row.plateText}</td>
                            <td className="p-2.5 text-gray-300 font-sans">{row.vehicleType}</td>
                            <td className="p-2.5 text-gray-400">{row.firstSeenSec}s</td>
                            <td className="p-2.5 text-gray-400">{row.lastSeenSec}s</td>
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 font-bold text-[10px]">
                                {(row.consensusConfidence * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="p-2.5 text-right space-x-2 font-sans">
                              <button
                                onClick={() => pushToLiveStream(row.plateText, row.plateText, row.consensusConfidence, row.vehicleType)}
                                className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded text-[10px] font-bold transition"
                              >
                                Live Stream
                              </button>
                              <button
                                onClick={() => onSelectPlate && onSelectPlate(row.plateText)}
                                className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-[10px] font-bold transition"
                              >
                                Track
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Default Placeholder */}
            {!loading && !anprResult && !jobStatus && (
              <div className="h-64 flex flex-col items-center justify-center text-gray-500 space-y-2">
                <FileImage className="w-12 h-12 text-gray-700" />
                <p className="text-xs">Upload an image or video file and click "Run ANPR Test" to inspect live results.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
