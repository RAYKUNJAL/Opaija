import { useEffect, useState, useCallback, useRef } from "react";
import {
  CheckCircle2,
  Clapperboard,
  Edit3,
  Film,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  Captions,
  GalleryHorizontalEnd,
  Wand2,
  GripVertical,
} from "lucide-react";
import { apiUrl } from "../lib/api";
import {
  STYLE_PRESETS,
  CAMERA_PRESETS,
  MOOD_PRESETS,
  TRANSITION_PRESETS,
  CHARACTER_LIST,
  buildPromptFromPresets,
  type Preset,
} from "../data/presets";

type Beat = {
  idx: number;
  text: string;
  prompt?: string;
  negativePrompt?: string;
  characters?: string[];
  referenceImage?: string;
  referenceImageUrls?: string[];
  mode?: string;
  durSec?: number;
  startSec?: number;
  endSec?: number;
};

type Episode = {
  id: string;
  episode_num?: number;
  title: string;
  status: string;
  hook?: string;
  conflict?: string;
  reveal?: string;
  escalation?: string;
  cliffhanger?: string;
  characters?: string[];
  location?: string;
  island?: string;
  narrator_script?: string;
  [key: string]: unknown;
};

type ShotLabData = {
  epId: string;
  beats: Record<string, Array<{ file: string; url: string }>>;
  approvals: Record<string, string>;
};

type VideoClip = {
  beatIdx: number;
  url: string;
  status: "queued" | "processing" | "completed" | "failed";
};

type TimelineTab = "episodes" | "trailer";

export function PipelineView({ token }: { token: string | null }) {
  const [tab, setTab] = useState<TimelineTab>("episodes");
  return (
    <div className="pipeline-container">
      <div className="pipeline-tabs">
        <button className={tab === "episodes" ? "pipe-tab active" : "pipe-tab"} onClick={() => setTab("episodes")}>
          <Clapperboard size={16} /> Episodes
        </button>
        <button className={tab === "trailer" ? "pipe-tab active" : "pipe-tab"} onClick={() => setTab("trailer")}>
          <Film size={16} /> Trailer Builder
        </button>
      </div>
      {tab === "episodes" ? <EpisodePipeline token={token} /> : <TrailerBuilder token={token} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EPISODE PIPELINE WITH TIMELINE EDITOR
// ════════════════════════════════════════════════════════════════════════════

function EpisodePipeline({ token }: { token: string | null }) {
  const [queue, setQueue] = useState<{ episodes: Episode[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEp, setSelectedEp] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ beats: Beat[]; runtimeSeconds: number; title: string } | null>(null);
  const [shotlab, setShotlab] = useState<ShotLabData | null>(null);
  const [generatingBeat, setGeneratingBeat] = useState<number | null>(null);
  const [renderingBeat, setRenderingBeat] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingEp, setCreatingEp] = useState(false);
  const [editingEp, setEditingEp] = useState(false);
  const [editingBeat, setEditingBeat] = useState<number | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [selectedBeat, setSelectedBeat] = useState<number | null>(null);
  const [videoClips, setVideoClips] = useState<Record<number, VideoClip>>({});
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ── New visual editing state ──
  const [zoom, setZoom] = useState(15); // px per second
  const [showCaptions, setShowCaptions] = useState(true);
  const [showGallery, setShowGallery] = useState(false);
  const [beatChars, setBeatChars] = useState<string[]>([]); // characters for selected beat
  const [transitions, setTransitions] = useState<Record<number, string>>({}); // beatIdx -> transition id
  const [transitionPickerFor, setTransitionPickerFor] = useState<number | null>(null);
  const dragBeatIdx = useRef<number | null>(null);

  const authHeaders: Record<string, string> = token ? { "x-admin-session": token } : {};

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/episodes"), { headers: authHeaders });
      if (!res.ok) { setQueue(null); setLoading(false); return; }
      const data = await res.json();
      if (data?.episodes) setQueue(data);
    } catch { setQueue(null); }
    setLoading(false);
  }, [token]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const loadParsed = useCallback(async (epId: string) => {
    try {
      const res = await fetch(`/episodes/${epId}/parsed.json`, { headers: authHeaders });
      if (!res.ok) { setParsed(null); return; }
      const data = await res.json();
      setParsed(data);
    } catch { setParsed(null); }
  }, [token]);

  const loadShotlab = useCallback(async (epId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/shotlab/${epId}`), { headers: authHeaders });
      if (!res.ok) return;
      setShotlab(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  const loadVideoClips = useCallback(async (epId: string) => {
    try {
      const res = await fetch(`/episodes/${epId}/clips-meta.json`, { headers: authHeaders });
      if (!res.ok) return;
      const meta = await res.json();
      const clips: Record<number, VideoClip> = {};
      for (const c of meta) {
        const beatIdx = c.idx ?? c.beatIdx;
        clips[beatIdx] = {
          beatIdx,
          url: `/episodes/${epId}/clips/beat-${String(beatIdx).padStart(2, "0")}.mp4`,
          status: c.provider === "mock" ? "failed" : "completed",
        };
      }
      setVideoClips(clips);
    } catch { /* ignore */ }
  }, [token]);

  const selectEpisode = (epId: string) => {
    setSelectedEp(epId);
    setSelectedBeat(null);
    setEditingEp(false);
    setEditingBeat(null);
    setShowScript(false);
    setShowGallery(false);
    setBeatChars([]);
    setTransitions({});
    void loadParsed(epId);
    void loadShotlab(epId);
    void loadVideoClips(epId);
    const ep = queue?.episodes.find(e => e.id === epId);
    setScriptText(ep?.narrator_script ?? "");
  };

  // Sync beatChars when selected beat changes
  useEffect(() => {
    if (selectedBeat !== null && parsed) {
      const beat = parsed.beats.find(b => b.idx === selectedBeat);
      setBeatChars(beat?.characters ?? []);
    }
  }, [selectedBeat, parsed]);

  // Audio playback sync
  useEffect(() => {
    if (!audioRef.current) return;
    if (playing) { void audioRef.current.play(); }
    else { audioRef.current.pause(); }
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", () => { setPlaying(false); setCurrentTime(0); });
    return () => { audio.removeEventListener("timeupdate", onTime); };
  }, [selectedEp]);

  const generateArt = async (beatIdx: number) => {
    const beat = parsed?.beats.find(b => b.idx === beatIdx);
    if (!beat?.prompt) return;
    setGeneratingBeat(beatIdx);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/shotlab/${selectedEp}/generate`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ beatIdx, prompt: beat.prompt, count: 2 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Generation failed");
      } else {
        await loadShotlab(selectedEp!);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    setGeneratingBeat(null);
  };

  const approveArt = async (beatIdx: number, file: string) => {
    try {
      await fetch(apiUrl(`/api/shotlab/${selectedEp}/approve`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ beatIdx, file }),
      });
      await loadShotlab(selectedEp!);
    } catch (e) { setError(e instanceof Error ? e.message : "Approve failed"); }
  };

  const pushToRender = async (beatIdx: number) => {
    const beat = parsed?.beats.find(b => b.idx === beatIdx);
    if (!beat) return;
    setRenderingBeat(beatIdx);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/video/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          prompt: beat.prompt,
          negativePrompt: beat.negativePrompt,
          durationSec: 6,
          aspectRatio: "9:16",
          episodeId: selectedEp,
          label: `${selectedEp} Beat ${beatIdx}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Push to render failed");
      } else {
        const data = await res.json();
        setError(`Beat ${beatIdx} pushed to render — Job: ${data.jobId} — Cost: $${data.cost}`);
        setTimeout(() => setError(null), 5000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    setRenderingBeat(null);
  };

  const parseScript = async () => {
    if (!selectedEp || !scriptText.trim()) return;
    setParsing(true);
    setError(null);
    try {
      await fetch(apiUrl(`/api/episodes/${selectedEp}/script`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ script: scriptText }),
      });
      const res = await fetch(apiUrl(`/api/episodes/${selectedEp}/parse-script`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ script: scriptText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Parse failed");
      } else {
        const data = await res.json();
        setError(`✓ Parsed into ${data.beatCount} beats (${data.runtimeSeconds.toFixed(1)}s)`);
        await loadParsed(selectedEp);
        await loadQueue();
        setTimeout(() => setError(null), 4000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Network error"); }
    setParsing(false);
  };

  const saveBeatEdit = async (beatIdx: number, prompt: string) => {
    try {
      await fetch(apiUrl(`/api/episodes/${selectedEp}/beats/${beatIdx}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ prompt }),
      });
      setEditingBeat(null);
      await loadParsed(selectedEp!);
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  };

  const deleteEpisode = async (epId: string) => {
    if (!confirm(`Delete ${epId}?`)) return;
    try {
      await fetch(apiUrl(`/api/episodes/${epId}`), { method: "DELETE", headers: authHeaders });
      await loadQueue();
      setSelectedEp(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
  };

  // ── Drag-reorder beats: swap two beats and recalc startSec/durSec ──
  const reorderBeats = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || !parsed) return;
    const beats = [...parsed.beats];
    const fromI = beats.findIndex(b => b.idx === fromIdx);
    const toI = beats.findIndex(b => b.idx === toIdx);
    if (fromI < 0 || toI < 0) return;
    // Swap positions in array
    [beats[fromI], beats[toI]] = [beats[toI], beats[fromI]];
    // Recalc startSec/durSec based on new order — preserve durations
    let cursor = 0;
    const reordered = beats.map((b, i) => {
      const dur = b.durSec ?? 2;
      const updated = { ...b, idx: parsed.beats[i].idx, startSec: cursor, endSec: cursor + dur, durSec: dur };
      cursor += dur;
      return updated;
    });
    const newRuntime = cursor;
    setParsed({ ...parsed, beats: reordered, runtimeSeconds: newRuntime });
  };

  const episode = queue?.episodes.find(e => e.id === selectedEp);
  const beats = parsed?.beats ?? [];
  const runtime = parsed?.runtimeSeconds ?? 0;
  const approvedCount = shotlab ? Object.keys(shotlab.approvals).length : 0;

  const getBeatStatus = (beatIdx: number): "none" | "generating" | "generated" | "approved" | "rendered" => {
    if (videoClips[beatIdx]?.status === "completed") return "rendered";
    const key = String(beatIdx);
    if (shotlab?.approvals?.[key]) return "approved";
    if (shotlab?.beats?.[key]?.length) return "generated";
    if (generatingBeat === beatIdx) return "generating";
    return "none";
  };

  // ── Loading ──
  if (loading) return <div className="pipeline-loading"><Loader2 size={32} className="spin" /><p>Loading…</p></div>;

  // ── Create Episode ──
  if (creatingEp) return <EpisodeCreator token={token} onDone={() => { setCreatingEp(false); void loadQueue(); }} onCancel={() => setCreatingEp(false)} />;

  // ── Empty / Episode List ──
  if (!selectedEp) {
    if (!queue?.episodes?.length) {
      return (
        <div className="pipeline-empty">
          <Clapperboard size={48} />
          <h2>No episodes yet</h2>
          <button className="action-btn generate" onClick={() => setCreatingEp(true)}><Plus size={16} /> Create Episode</button>
        </div>
      );
    }
    return (
      <div className="pipeline-ep-list">
        <div className="pipeline-header">
          <div>
            <h2>Production Pipeline</h2>
            <p>Select an episode to open the timeline editor.</p>
          </div>
          <button className="action-btn generate" onClick={() => setCreatingEp(true)}><Plus size={16} /> New Episode</button>
        </div>
        <div className="ep-cards">
          {queue.episodes.map((ep) => (
            <button key={ep.id} className="ep-card" onClick={() => selectEpisode(ep.id)}>
              <div className="ep-card-num">{ep.episode_num ?? "?"}</div>
              <div className="ep-card-body"><strong>{ep.title}</strong><span className="ep-card-id">{ep.id}</span></div>
              <div className="ep-card-status"><span className={`status-pill status-${ep.status.toLowerCase()}`}>{ep.status}</span></div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Generations Gallery view ──
  if (showGallery && shotlab) {
    const allArts: Array<{ beatIdx: number; url: string; file: string; approved: boolean }> = [];
    for (const [key, arr] of Object.entries(shotlab.beats)) {
      const approvedFile = shotlab.approvals?.[key];
      for (const a of arr) {
        allArts.push({ beatIdx: Number(key), url: a.url, file: a.file, approved: approvedFile === a.file });
      }
    }
    return (
      <div className="timeline-editor">
        <div className="timeline-toolbar">
          <button onClick={() => setShowGallery(false)} className="crumb-back">← Back to Timeline</button>
          <strong className="toolbar-title">{episode?.title} — Gallery</strong>
          <span className="approval-count">{allArts.length} images · {approvedCount} approved</span>
        </div>
        {allArts.length === 0 ? (
          <div className="pipeline-empty"><ImageIcon size={36} /><p>No generated art yet.</p></div>
        ) : (
          <div className="gallery-grid">
            {allArts.map((art, i) => (
              <div key={`${art.beatIdx}-${art.file}-${i}`} className="gallery-card" onClick={() => { setSelectedBeat(art.beatIdx); setShowGallery(false); }}>
                <img src={art.url} alt={`Beat ${art.beatIdx}`} />
                <div className="gallery-card-info">
                  <span className="gallery-beat-num">Beat {art.beatIdx}</span>
                  {art.approved && <span className="gallery-approved"><CheckCircle2 size={12} /> Approved</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Timeline Editor View ──
  const timelineWidth = Math.max(800, runtime * zoom);
  const tickInterval = zoom < 10 ? 5 : zoom < 20 ? 2 : 1;

  return (
    <div className="timeline-editor">
      {/* Hidden audio for playback sync */}
      <audio ref={audioRef} src={`/episodes/${selectedEp}/narration.mp3`} preload="metadata" />

      {/* Breadcrumb + Actions */}
      <div className="timeline-toolbar">
        <button onClick={() => { setSelectedEp(null); setParsed(null); setShotlab(null); }} className="crumb-back">← All Episodes</button>
        <strong className="toolbar-title">{episode?.title}</strong>
        <span className={`status-pill status-${episode?.status?.toLowerCase()}`}>{episode?.status}</span>
        <div className="toolbar-spacer" />
        <button className="action-btn regenerate" onClick={() => setShowGallery(!showGallery)} disabled={!shotlab}>
          <GalleryHorizontalEnd size={14} /> Gallery
        </button>
        <button className="action-btn regenerate" onClick={() => setEditingEp(!editingEp)}><Edit3 size={14} /> Edit</button>
        <button className="action-btn regenerate" onClick={() => setShowScript(!showScript)}>Script</button>
        <button className="action-btn" style={{ color: "#fca5a5", borderColor: "rgba(198,40,30,0.3)" }} onClick={() => deleteEpisode(episode!.id)}><Trash2 size={14} /></button>
      </div>

      {error && (
        <div className={`pipeline-error ${error.startsWith("✓") ? "success" : ""}`}>
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* Edit form */}
      {editingEp && episode && (
        <EpisodeEditor ep={episode} token={token} onDone={() => { setEditingEp(false); void loadQueue(); }} onCancel={() => setEditingEp(false)} />
      )}

      {/* Script editor */}
      {showScript && (
        <div className="script-section">
          <textarea value={scriptText} onChange={(e) => setScriptText(e.target.value)}
            placeholder="Write narrator script. Separate beats with blank lines." className="script-textarea" rows={6} />
          <button className="action-btn generate" onClick={parseScript} disabled={parsing || !scriptText.trim()}>
            {parsing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} Save & Parse
          </button>
        </div>
      )}

      {/* Playback controls */}
      <div className="playback-bar">
        <button className="play-btn" onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <span className="time-display">{currentTime.toFixed(1)}s</span>
        <span className="time-display muted">/ {runtime.toFixed(1)}s</span>
        <div className="playback-progress">
          <div className="playback-progress-fill" style={{ width: `${runtime ? (currentTime / runtime) * 100 : 0}%` }} />
        </div>
        <span className="approval-count">{approvedCount}/{beats.length} approved</span>
      </div>

      {/* Zoom + Captions toggle controls */}
      <div className="timeline-controls">
        <label className="zoom-control">
          <ZoomIn size={14} />
          <input type="range" min={5} max={40} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
          <span>{zoom}px/s</span>
        </label>
        <button className={`action-btn ${showCaptions ? "generate" : "regenerate"}`} onClick={() => setShowCaptions(!showCaptions)}>
          <Captions size={14} /> Captions {showCaptions ? "On" : "Off"}
        </button>
      </div>

      {/* TIMELINE — the core visual */}
      {beats.length === 0 ? (
        <div className="pipeline-empty">
          <FileText size={36} />
          <p>No beats. Write a script and click "Save & Parse".</p>
        </div>
      ) : (
        <div className="timeline-scroll" ref={timelineRef}>
          <div className="timeline-track" style={{ width: timelineWidth }}>
            {/* Time ruler */}
            <div className="timeline-ruler">
              {Array.from({ length: Math.ceil(runtime / tickInterval) + 1 }).map((_, i) => (
                <div key={i} className="ruler-tick" style={{ left: i * tickInterval * zoom }}>
                  <span>{i * tickInterval}s</span>
                </div>
              ))}
            </div>

            {/* Audio track */}
            <div className="timeline-row">
              <div className="track-label"><Mic size={14} /> Audio</div>
              <div className="track-content audio-track">
                <div className="audio-waveform" style={{ width: runtime * zoom }} />
              </div>
            </div>

            {/* Beats track — draggable for reorder */}
            <div className="timeline-row">
              <div className="track-label"><GripVertical size={14} /> Beats</div>
              <div className="track-content beats-track">
                {beats.map((beat) => {
                  const left = (beat.startSec ?? 0) * zoom;
                  const width = (beat.durSec ?? 0) * zoom;
                  const status = getBeatStatus(beat.idx);
                  const isSelected = selectedBeat === beat.idx;
                  const approvedImg = shotlab?.approvals?.[String(beat.idx)];
                  return (
                    <div
                      key={beat.idx}
                      className={`timeline-beat ${status} ${isSelected ? "selected" : ""}`}
                      style={{ left, width }}
                      draggable
                      onDragStart={() => { dragBeatIdx.current = beat.idx; }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDrop={() => { if (dragBeatIdx.current !== null && dragBeatIdx.current !== beat.idx) reorderBeats(dragBeatIdx.current, beat.idx); dragBeatIdx.current = null; }}
                      onClick={() => setSelectedBeat(isSelected ? null : beat.idx)}
                    >
                      <span className="beat-label">{beat.idx}</span>
                      {approvedImg && <ImageIcon size={10} className="beat-has-art" />}
                      {videoClips[beat.idx]?.status === "completed" && <Film size={10} className="beat-has-video" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transition icons between beats */}
            <div className="timeline-row">
              <div className="track-label">Trans</div>
              <div className="track-content transitions-track">
                {beats.slice(0, -1).map(beat => {
                  const left = (beat.endSec ?? (beat.startSec ?? 0) + (beat.durSec ?? 0)) * zoom;
                  const transId = transitions[beat.idx] ?? "cut";
                  const trans = TRANSITION_PRESETS.find(t => t.id === transId);
                  return (
                    <div key={beat.idx} className="transition-icon" style={{ left: left - 12 }} onClick={(e) => { e.stopPropagation(); setTransitionPickerFor(transitionPickerFor === beat.idx ? null : beat.idx); }}>
                      <div className="trans-thumb" style={{ background: trans?.color }} title={trans?.label} />
                      {transitionPickerFor === beat.idx && (
                        <div className="transition-picker" onClick={e => e.stopPropagation()}>
                          {TRANSITION_PRESETS.map(t => (
                            <button key={t.id} className={`trans-option ${transId === t.id ? "active" : ""}`} onClick={() => { setTransitions({ ...transitions, [beat.idx]: t.id }); setTransitionPickerFor(null); }}>
                              <div className="trans-thumb-sm" style={{ background: t.color }} />
                              <span>{t.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Images track */}
            <div className="timeline-row">
              <div className="track-label"><ImageIcon size={14} /> Art</div>
              <div className="track-content art-track">
                {beats.map(beat => {
                  const left = (beat.startSec ?? 0) * zoom;
                  const width = (beat.durSec ?? 0) * zoom;
                  const approvedFile = shotlab?.approvals?.[String(beat.idx)];
                  const candidates = shotlab?.beats?.[String(beat.idx)] ?? [];
                  return (
                    <div key={beat.idx} className="timeline-art-slot" style={{ left, width }} onClick={() => setSelectedBeat(beat.idx)}>
                      {approvedFile ? (
                        <img src={`/shotlab/${selectedEp}/beat-${String(beat.idx).padStart(2, "0")}/${approvedFile}`} alt={`Beat ${beat.idx}`} />
                      ) : candidates.length > 0 ? (
                        <div className="art-pending"><ImageIcon size={12} /></div>
                      ) : generatingBeat === beat.idx ? (
                        <div className="art-loading"><Loader2 size={12} className="spin" /></div>
                      ) : (
                        <div className="art-empty" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Video track */}
            <div className="timeline-row">
              <div className="track-label"><Film size={14} /> Video</div>
              <div className="track-content video-track">
                {beats.map(beat => {
                  const left = (beat.startSec ?? 0) * zoom;
                  const width = (beat.durSec ?? 0) * zoom;
                  const clip = videoClips[beat.idx];
                  return (
                    <div key={beat.idx} className="timeline-video-slot" style={{ left, width }} onClick={() => setSelectedBeat(beat.idx)}>
                      {clip?.status === "completed" ? (
                        <video src={clip.url} muted preload="metadata" />
                      ) : renderingBeat === beat.idx ? (
                        <div className="art-loading"><Loader2 size={12} className="spin" /></div>
                      ) : (
                        <div className="art-empty" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Captions track */}
            <div className="timeline-row">
              <div className="track-label"><Captions size={14} /> Captions</div>
              <div className="track-content captions-track" style={{ display: showCaptions ? "block" : "none" }}>
                {beats.map(beat => {
                  const left = (beat.startSec ?? 0) * zoom;
                  const width = (beat.durSec ?? 0) * zoom;
                  return (
                    <div key={beat.idx} className="timeline-caption" style={{ left, width }} onClick={() => setSelectedBeat(beat.idx)}>
                      <span className="caption-text">{beat.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Playhead */}
            <div className="timeline-playhead" style={{ left: currentTime * zoom }} />
          </div>
        </div>
      )}

      {/* Beat detail panel (when a beat is selected) */}
      {selectedBeat !== null && beats.length > 0 && (() => {
        const beat = beats.find(b => b.idx === selectedBeat);
        if (!beat) return null;
        const key = String(beat.idx);
        const candidates = shotlab?.beats?.[key] ?? [];
        const approvedFile = shotlab?.approvals?.[key];
        const status = getBeatStatus(beat.idx);
        return (
          <div className="beat-detail-panel">
            <div className="beat-detail-header">
              <h3>Beat {beat.idx}</h3>
              <span className="beat-time">{(beat.startSec ?? 0).toFixed(1)}s — {(beat.endSec ?? 0).toFixed(1)}s ({(beat.durSec ?? 0).toFixed(1)}s)</span>
              <button className="action-btn regenerate" onClick={() => setEditingBeat(editingBeat === beat.idx ? null : beat.idx)}><Edit3 size={12} /> Prompt</button>
              <button onClick={() => setSelectedBeat(null)} className="close-detail"><X size={16} /></button>
            </div>
            <p className="beat-narration">"{beat.text}"</p>

            {/* Character chips with @-mention */}
            <div className="char-chips-row">
              {CHARACTER_LIST.map(ch => {
                const selected = beatChars.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    className={`char-chip ${selected ? "selected" : ""}`}
                    onClick={() => {
                      const next = selected ? beatChars.filter(c => c !== ch.id) : [...beatChars, ch.id];
                      setBeatChars(next);
                    }}
                  >
                    <img src={ch.image} alt={ch.name} className="char-chip-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span>{ch.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Prompt editor with visual presets */}
            {editingBeat === beat.idx && (
              <BeatPromptEditor beat={beat} onSave={(p) => saveBeatEdit(beat.idx, p)} onCancel={() => setEditingBeat(null)} />
            )}

            {/* Art candidates */}
            {candidates.length > 0 && (
              <div className="beat-candidates">
                {candidates.map(c => (
                  <div key={c.file} className={`candidate ${approvedFile === c.file ? "approved" : ""}`}>
                    <img src={c.url} alt={c.file} />
                    {approvedFile === c.file && <div className="approved-badge"><CheckCircle2 size={20} /></div>}
                    <button className="approve-btn" onClick={() => approveArt(beat.idx, c.file)} disabled={!!approvedFile}>
                      {approvedFile === c.file ? "Approved" : "Approve"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="beat-actions">
              {(status === "none" || status === "generating") && (
                <button className="action-btn generate" onClick={() => generateArt(beat.idx)} disabled={generatingBeat !== null}>
                  {generatingBeat === beat.idx ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                  Generate Art ($0.003)
                </button>
              )}
              {status === "generated" && (
                <button className="action-btn regenerate" onClick={() => generateArt(beat.idx)} disabled={generatingBeat !== null}>
                  <RefreshCw size={16} /> Regenerate
                </button>
              )}
              {status === "approved" && (
                <>
                  <span className="beat-approved-tag"><CheckCircle2 size={16} /> Approved</span>
                  <button className="action-btn push-render" onClick={() => pushToRender(beat.idx)} disabled={renderingBeat !== null}>
                    {renderingBeat === beat.idx ? <Loader2 size={16} className="spin" /> : <Film size={16} />}
                    Push to Render
                  </button>
                </>
              )}
              {status === "rendered" && (
                <span className="beat-approved-tag" style={{ color: "#22d3ee" }}><Film size={16} /> Video Ready</span>
              )}
            </div>

            {/* Video preview */}
            {videoClips[beat.idx]?.status === "completed" && (
              <div className="video-preview-inline">
                <video src={videoClips[beat.idx].url} controls preload="metadata" />
              </div>
            )}
          </div>
        );
      })()}

      {/* Episode preview video */}
      <div className="video-preview">
        <Film size={16} />
        <span>Episode preview:</span>
        <video controls preload="none" width="100%"><source src={`/episodes/${selectedEp}/${selectedEp}-preview.mp4`} type="video/mp4" /></video>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EPISODE CREATOR
// ════════════════════════════════════════════════════════════════════════════

function EpisodeCreator({ token, onDone, onCancel }: { token: string | null; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: "", hook: "", conflict: "", reveal: "", escalation: "", cliffhanger: "",
    characters: "", location: "", island: "Trinidad", narrator_script: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authHeaders: Record<string, string> = token ? { "x-admin-session": token } : {};

  const create = async () => {
    if (!form.title.trim()) { setError("Title required"); return; }
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/episodes"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ...form, characters: form.characters.split(",").map(s => s.trim()).filter(Boolean) }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed"); }
      else { onDone(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setSaving(false);
  };

  return (
    <div className="pipeline-ep-list">
      <div className="pipeline-header"><h2>Create New Episode</h2></div>
      <div className="ep-form">
        {error && <div className="pipeline-error">{error}<button onClick={() => setError(null)}><X size={14} /></button></div>}
        <label>Title <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>Hook <input value={form.hook} onChange={e => setForm({ ...form, hook: e.target.value })} /></label>
        <label>Characters <input value={form.characters} onChange={e => setForm({ ...form, characters: e.target.value })} placeholder="Kai, Mother Lall" /></label>
        <label>Location <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
        <label>Island <input value={form.island} onChange={e => setForm({ ...form, island: e.target.value })} /></label>
        <label>Conflict <input value={form.conflict} onChange={e => setForm({ ...form, conflict: e.target.value })} /></label>
        <label>Reveal <input value={form.reveal} onChange={e => setForm({ ...form, reveal: e.target.value })} /></label>
        <label>Escalation <input value={form.escalation} onChange={e => setForm({ ...form, escalation: e.target.value })} /></label>
        <label>Cliffhanger <input value={form.cliffhanger} onChange={e => setForm({ ...form, cliffhanger: e.target.value })} /></label>
        <label>Narrator Script <textarea value={form.narrator_script} onChange={e => setForm({ ...form, narrator_script: e.target.value })} className="script-textarea" rows={6} placeholder="Write narration. Double Enter between scenes." /></label>
        <div className="ep-form-actions">
          <button className="action-btn generate" onClick={create} disabled={saving}>{saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Create</button>
          <button className="action-btn regenerate" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EPISODE EDITOR
// ════════════════════════════════════════════════════════════════════════════

function EpisodeEditor({ ep, token, onDone, onCancel }: { ep: Episode; token: string | null; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: ep.title ?? "", hook: ep.hook ?? "", conflict: ep.conflict ?? "",
    reveal: ep.reveal ?? "", escalation: ep.escalation ?? "", cliffhanger: ep.cliffhanger ?? "",
    characters: (ep.characters ?? []).join(", "), location: ep.location ?? "", island: ep.island ?? "Trinidad",
  });
  const [saving, setSaving] = useState(false);
  const authHeaders: Record<string, string> = token ? { "x-admin-session": token } : {};

  const save = async () => {
    setSaving(true);
    try {
      await fetch(apiUrl(`/api/episodes/${ep.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ...form, characters: form.characters.split(",").map(s => s.trim()).filter(Boolean) }),
      });
      onDone();
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="ep-form-inline">
      <label>Title <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
      <label>Hook <input value={form.hook} onChange={e => setForm({ ...form, hook: e.target.value })} /></label>
      <label>Characters <input value={form.characters} onChange={e => setForm({ ...form, characters: e.target.value })} /></label>
      <label>Location <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
      <button className="action-btn generate" onClick={save} disabled={saving}>{saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save</button>
      <button className="action-btn regenerate" onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BEAT PROMPT EDITOR — with Higgsfield-style visual preset pickers
// ════════════════════════════════════════════════════════════════════════════

function PresetCard({ preset, selected, onClick }: { preset: Preset; selected: boolean; onClick: () => void }) {
  return (
    <button
      className={`preset-card ${selected ? "selected" : ""}`}
      onClick={onClick}
      style={{ background: preset.color }}
    >
      <span className="preset-label">{preset.label}</span>
      <span className="preset-desc">{preset.description}</span>
    </button>
  );
}

function PresetRow({ title, presets, selected, onToggle }: { title: string; presets: Preset[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="preset-row">
      <span className="preset-row-title">{title}</span>
      <div className="preset-cards">
        {presets.map(p => (
          <PresetCard key={p.id} preset={p} selected={selected.includes(p.id)} onClick={() => onToggle(p.id)} />
        ))}
      </div>
    </div>
  );
}

function BeatPromptEditor({ beat, onSave, onCancel }: { beat: Beat; onSave: (prompt: string) => void; onCancel: () => void }) {
  const [prompt, setPrompt] = useState(beat.prompt ?? "");
  const [styleIds, setStyleIds] = useState<string[]>([]);
  const [cameraIds, setCameraIds] = useState<string[]>([]);
  const [moodIds, setMoodIds] = useState<string[]>([]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const buildPrompt = () => {
    const styles = STYLE_PRESETS.filter(p => styleIds.includes(p.id));
    const cameras = CAMERA_PRESETS.filter(p => cameraIds.includes(p.id));
    const moods = MOOD_PRESETS.filter(p => moodIds.includes(p.id));
    if (styles.length === 0 && cameras.length === 0 && moods.length === 0) return;
    // Use first selected of each category for the builder, append extras as fragments
    const built = buildPromptFromPresets({
      style: styles[0],
      camera: cameras[0],
      mood: moods[0],
      characters: beat.characters ?? [],
      location: "Caribbean",
      beatText: beat.text,
    });
    // Append any additional selections
    const extras: string[] = [];
    for (const s of styles.slice(1)) extras.push(s.promptFragment);
    for (const c of cameras.slice(1)) extras.push(c.promptFragment);
    for (const m of moods.slice(1)) extras.push(m.promptFragment);
    const final = extras.length ? `${built} ${extras.join(" ")}` : built;
    setPrompt(final);
  };

  return (
    <div className="beat-prompt-editor">
      <div className="preset-editor">
        <PresetRow title="Style" presets={STYLE_PRESETS} selected={styleIds} onToggle={id => toggle(styleIds, setStyleIds, id)} />
        <PresetRow title="Camera" presets={CAMERA_PRESETS} selected={cameraIds} onToggle={id => toggle(cameraIds, setCameraIds, id)} />
        <PresetRow title="Mood" presets={MOOD_PRESETS} selected={moodIds} onToggle={id => toggle(moodIds, setMoodIds, id)} />
        <button className="action-btn generate" onClick={buildPrompt} disabled={styleIds.length === 0 && cameraIds.length === 0 && moodIds.length === 0}>
          <Wand2 size={14} /> Build Prompt from Selections
        </button>
      </div>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="script-textarea" rows={4} />
      <div className="beat-prompt-actions">
        <button className="action-btn generate" onClick={() => onSave(prompt)}><Save size={14} /> Save</button>
        <button className="action-btn regenerate" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TRAILER BUILDER (simplified)
// ════════════════════════════════════════════════════════════════════════════

function TrailerBuilder({ token }: { token: string | null }) {
  const [trailer, setTrailer] = useState<{ title: string; beats: Array<{ episodeId: string; beatIdx: number; text: string }> } | null>(null);
  const [queue, setQueue] = useState<{ episodes: Episode[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEp, setSelectedEp] = useState<string | null>(null);
  const [epBeats, setEpBeats] = useState<Beat[]>([]);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authHeaders: Record<string, string> = token ? { "x-admin-session": token } : {};

  useEffect(() => {
    (async () => {
      try {
        const [tRes, qRes] = await Promise.all([
          fetch(apiUrl("/api/trailer"), { headers: authHeaders }),
          fetch(apiUrl("/api/episodes"), { headers: authHeaders }),
        ]);
        if (tRes.ok) setTrailer(await tRes.json());
        if (qRes.ok) { const q = await qRes.json(); if (q?.episodes) setQueue(q); }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [token]);

  const loadEpBeats = async (epId: string) => {
    setSelectedEp(epId);
    try {
      const res = await fetch(`/episodes/${epId}/parsed.json`);
      if (!res.ok) { setEpBeats([]); return; }
      const data = await res.json();
      setEpBeats(data?.beats ?? []);
    } catch { setEpBeats([]); }
  };

  const addToTrailer = async (beat: Beat) => {
    if (!selectedEp || !trailer) return;
    const updated = { ...trailer, beats: [...trailer.beats, { episodeId: selectedEp, beatIdx: beat.idx, text: beat.text }] };
    await fetch(apiUrl("/api/trailer"), { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(updated) });
    setTrailer(updated);
  };

  const removeFromTrailer = async (idx: number) => {
    if (!trailer) return;
    const updated = { ...trailer, beats: trailer.beats.filter((_, i) => i !== idx) };
    await fetch(apiUrl("/api/trailer"), { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(updated) });
    setTrailer(updated);
  };

  const renderTrailer = async () => {
    if (!trailer?.beats.length) return;
    setRendering(true);
    try {
      const res = await fetch(apiUrl("/api/trailer/render"), { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders } });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed"); }
      else { const data = await res.json(); setError(`✓ ${data.submitted} beats submitted`); setTimeout(() => setError(null), 4000); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    setRendering(false);
  };

  if (loading) return <div className="pipeline-loading"><Loader2 size={32} className="spin" /></div>;

  return (
    <div className="trailer-builder">
      {error && <div className={`pipeline-error ${error.startsWith("✓") ? "success" : ""}`}>{error}<button onClick={() => setError(null)}><X size={14} /></button></div>}
      <div className="trailer-section">
        <div className="trailer-section-header">
          <h3>{trailer?.title ?? "Trailer"}</h3>
          <button className="action-btn push-render" onClick={renderTrailer} disabled={rendering || !trailer?.beats.length}>
            {rendering ? <Loader2 size={16} className="spin" /> : <Film size={16} />} Render ({trailer?.beats.length ?? 0})
          </button>
        </div>
        {trailer && trailer.beats.length > 0 ? (
          <div className="trailer-beats">
            {trailer.beats.map((b, i) => (
              <div key={i} className="trailer-beat">
                <div className="beat-num">{i + 1}</div>
                <div className="trailer-beat-body"><strong>{b.episodeId} · Beat {b.beatIdx}</strong><p>{b.text}</p></div>
                <button className="action-btn" style={{ color: "#fca5a5" }} onClick={() => removeFromTrailer(i)}><X size={14} /></button>
              </div>
            ))}
          </div>
        ) : <p className="beat-hint">Pick beats below →</p>}
      </div>
      <div className="trailer-section">
        <h3>Pick beats</h3>
        <div className="ep-cards" style={{ maxWidth: 400 }}>
          {queue?.episodes.map(ep => (
            <button key={ep.id} className={`ep-card ${selectedEp === ep.id ? "selected" : ""}`} onClick={() => loadEpBeats(ep.id)}>
              <div className="ep-card-num">{ep.episode_num ?? "?"}</div>
              <div className="ep-card-body"><strong>{ep.title}</strong></div>
            </button>
          ))}
        </div>
        {selectedEp && epBeats.length > 0 && (
          <div className="beats-list" style={{ marginTop: 12 }}>
            {epBeats.map(beat => (
              <div key={beat.idx} className="beat-card">
                <div className="beat-header">
                  <div className="beat-num">{beat.idx}</div>
                  <p className="beat-text">{beat.text}</p>
                  <button className="action-btn generate" onClick={() => addToTrailer(beat)}><Plus size={14} /> Add</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
