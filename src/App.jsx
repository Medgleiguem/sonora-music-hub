'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'jsmediatags/dist/jsmediatags.min.js';
import YouTube from 'react-youtube';
import {
  ArrowLeft, Check, ChevronRight, Clock3, Cloud, Compass, Disc3, Download,
  DownloadCloud, FolderUp, HardDrive, Headphones, Heart, Home, Library,
  ListMusic, ListPlus, LoaderCircle, Menu, MoreHorizontal, Music2, Pause,
  Play, Plus, Radio, Repeat2, Search, Settings, Shuffle, SkipBack,
  SkipForward, Sparkles, Trash2, Upload, Volume2, VolumeX, WifiOff, X
} from 'lucide-react';
import {
  deletePlaylist as removePlaylist,
  deleteTrack as removeTrack,
  getPlaylists,
  getSetting,
  getStorageEstimate,
  getTracks,
  putPlaylist,
  putTrack,
  requestPersistentStorage,
  setSetting
} from './db';
const jsmediatags = typeof window !== 'undefined' ? window.jsmediatags : null;
const ENV_CONFIG = {
  youtubeKey: process.env.NEXT_PUBLIC_YOUTUBE_ENABLED === 'true' ? 'server' : '',
  jamendoClientId: process.env.NEXT_PUBLIC_JAMENDO_CLIENT_ID?.trim() || '',
  youtubeRegion: process.env.NEXT_PUBLIC_YOUTUBE_REGION?.trim().toUpperCase() || ''
};

const ARABIC_CLASSICS_ARTISTS = [
  { name: 'Fairuz', arabic: 'فيروز', query: 'فيروز Fairuz أغاني' },
  { name: 'Umm Kulthum', arabic: 'أم كلثوم', query: 'أم كلثوم Umm Kulthum أغاني' },
  { name: 'Abdel Halim Hafez', arabic: 'عبد الحليم حافظ', query: 'عبد الحليم حافظ أغاني' },
  { name: 'Warda', arabic: 'وردة الجزائرية', query: 'وردة الجزائرية أغاني' },
  { name: 'Mohammed Abdel Wahab', arabic: 'محمد عبد الوهاب', query: 'محمد عبد الوهاب أغاني' },
  { name: 'Farid al-Atrash', arabic: 'فريد الأطرش', query: 'فريد الأطرش أغاني' },
  { name: 'Asmahan', arabic: 'أسمهان', query: 'أسمهان أغاني' },
  { name: 'Sabah Fakhri', arabic: 'صباح فخري', query: 'صباح فخري أغاني' },
  { name: 'Sabah', arabic: 'صباح', query: 'صباح الشحرورة أغاني' }
];

const formatTime = (seconds = 0) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
};

const parseIsoDuration = (value = '') => {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
};

const decodeEntities = (value = '') => {
  const node = document.createElement('textarea');
  node.innerHTML = value;
  return node.value;
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

const audioMimeType = (name = '') => {
  const extension = name.split('.').pop()?.toLowerCase();
  return ({
    mp3: 'audio/mpeg', wav: 'audio/wav', wave: 'audio/wav', m4a: 'audio/mp4',
    aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus',
    flac: 'audio/flac', webm: 'audio/webm'
  })[extension] || 'application/octet-stream';
};

const isYoutubeUrl = (value = '') => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const saveRecoveryCopy = (blob, fileName) => {
  if (!blob || typeof document === 'undefined') return;
  const backupUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = backupUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(backupUrl), 30_000);
};

const initials = (value = 'Music') => value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

function artworkGradient(id = 'sonora') {
  let hash = 0;
  for (const char of String(id)) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(145deg, hsl(${hue} 72% 58%), hsl(${(hue + 65) % 360} 52% 23%))`;
}

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`} aria-label="Sonora">
      <span className="logo-mark"><Music2 size={21} strokeWidth={2.8} /></span>
      {!compact && <span>sonora<span className="logo-dot">.</span></span>}
    </div>
  );
}

function Cover({ track, size = 'medium', className = '' }) {
  return (
    <div
      className={`cover cover-${size} ${className}`}
      style={{ background: track?.cover ? `url(${track.cover}) center/cover` : artworkGradient(track?.id) }}
    >
      {!track?.cover && <span>{initials(track?.title)}</span>}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        <div className="modal-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {children}
      </section>
    </div>
  );
}

function EmptyState({ icon: Icon = Music2, title, text, action, actionLabel }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={28} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <button className="primary-button" onClick={action}><Plus size={17} />{actionLabel}</button>}
    </div>
  );
}

function TrackRow({ track, index, active, playing, onPlay, onFavorite, onDownload, onAdd, onDelete, showAlbum = true }) {
  return (
    <div className={`track-row ${active ? 'active' : ''}`}>
      <button className="track-index" onClick={onPlay} aria-label={`${playing && active ? 'Pause' : 'Play'} ${track.title}`}>
        <span className="row-number">{index + 1}</span>
        <span className="row-play">{playing && active ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</span>
      </button>
      <Cover track={track} size="small" />
      <div className="track-name">
        <strong>{track.title}</strong>
        <span>{track.artist || 'Unknown artist'}</span>
      </div>
      {showAlbum && <span className="track-album">{track.album || 'Single'}</span>}
      <span className="track-source">
        {track.blob || track.cachedBlob
          ? <><WifiOff size={13} /> Offline</>
          : track.source === 'youtube'
            ? <><Play size={13} fill="currentColor" /> YouTube</>
            : <><Cloud size={13} /> Jamendo</>}
      </span>
      <button className={`icon-button subtle favorite ${track.favorite ? 'selected' : ''}`} onClick={onFavorite} aria-label="Favorite"><Heart size={17} fill={track.favorite ? 'currentColor' : 'none'} /></button>
      <span className="track-duration">{formatTime(track.duration)}</span>
      <div className="track-actions">
        {track.source === 'jamendo' && !track.cachedBlob && track.downloadAllowed && (
          <button className="icon-button subtle" onClick={onDownload} aria-label="Save offline"><DownloadCloud size={17} /></button>
        )}
        <button className="icon-button subtle" onClick={onAdd} aria-label="Add to playlist"><ListPlus size={17} /></button>
        <button className="icon-button subtle danger-hover" onClick={onDelete} aria-label="Remove from library"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function TrackCard({ track, onPlay, onSave, onAdd, onDownload, saved, active, playing }) {
  return (
    <article className={`track-card ${active ? 'active' : ''}`}>
      <div className="card-art-wrap">
        <Cover track={track} size="card" />
        <button className="card-play" onClick={onPlay} aria-label={`Play ${track.title}`}>
          {active && playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
        </button>
        {onSave && (
          <button className={`card-save ${saved ? 'saved' : ''}`} onClick={onSave} aria-label="Save to library">
            {saved ? <Check size={16} /> : <Plus size={16} />}
          </button>
        )}
        {onAdd && (
          <button className="card-playlist" onClick={onAdd} aria-label="Add to playlist"><ListPlus size={16} /></button>
        )}
        {onDownload && (
          <button className="card-download" onClick={onDownload} aria-label={`Download ${track.title} as audio`}>
            <Download size={15} /><span>Download</span>
          </button>
        )}
      </div>
      <h3>{track.title}</h3>
      <p>{track.artist || 'Unknown artist'}</p>
    </article>
  );
}

function UploadModal({ onClose, onFiles, onFolder, importing }) {
  const inputRef = useRef();
  const folderInputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const accept = (files) => {
    const audioFiles = [...files].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name));
    if (audioFiles.length) onFiles(audioFiles);
  };
  return (
    <Modal title="Add your music" subtitle="Your files stay private and are stored on this device." onClose={onClose}>
      <input ref={inputRef} hidden type="file" multiple accept="audio/*,.flac" onChange={(event) => accept(event.target.files)} />
      <input ref={folderInputRef} hidden type="file" multiple accept="audio/*,.flac" directory="" webkitdirectory="" onChange={(event) => onFolder?.([...event.target.files])} />
      <button
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); accept(event.dataTransfer.files); }}
      >
        <span className="upload-orb">{importing ? <LoaderCircle className="spin" size={28} /> : <FolderUp size={28} />}</span>
        <strong>{importing ? 'Reading your music…' : 'Choose audio files'}</strong>
        <span>or drag & drop MP3, WAV, M4A, OGG, AAC, or FLAC</span>
      </button>
      <button className="secondary-button full-button" onClick={() => folderInputRef.current?.click()} disabled={importing}><FolderUp size={17} />Import a phone folder</button>
      <div className="privacy-note"><HardDrive size={18} /><span><strong>Local by design.</strong> Music is saved in your browser storage for offline listening.</span></div>
    </Modal>
  );
}

function YoutubeDownloadModal({ onClose, onDownload, downloading, track }) {
  const [url, setUrl] = useState(track?.shareUrl || '');
  const [format, setFormat] = useState('mp3');
  const [confirmed, setConfirmed] = useState(false);
  const [addAfterDownload, setAddAfterDownload] = useState(Boolean(track));
  const [keepBackup, setKeepBackup] = useState(true);
  const canSubmit = isYoutubeUrl(url.trim()) && confirmed && !downloading;
  return (
    <Modal title="Download audio" subtitle="Save audio you own or have permission to download for offline listening." onClose={onClose} wide>
      <div className={`download-intro ${track ? 'selected-track' : ''}`}>
        {track ? <Cover track={track} size="small" /> : <span className="download-orb"><Download size={23} /></span>}
        <div><strong>{track?.title || 'YouTube to audio'}</strong><p>{track ? `${track.artist || 'YouTube'} · Ready to convert and store on this device.` : 'Paste a video URL. The converted file is stored only in this browser on this device.'}</p></div>
      </div>
      <label className="field-label" htmlFor="youtube-download-url">YouTube URL</label>
      <input id="youtube-download-url" className="text-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" autoFocus />
      <label className="field-label" htmlFor="youtube-download-format">Audio format</label>
      <select id="youtube-download-format" className="text-input select-input" value={format} onChange={(event) => setFormat(event.target.value)}><option value="mp3">MP3 · widest compatibility</option><option value="m4a">M4A · efficient quality</option><option value="opus">Opus · smallest file</option></select>
      <label className="consent-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I have the right to download this content and will use it in accordance with YouTube’s terms.</span></label>
      {track && <label className="consent-check playlist-after-download"><input type="checkbox" checked={addAfterDownload} onChange={(event) => setAddAfterDownload(event.target.checked)} /><span>Choose a playlist after the download finishes.</span></label>}
      <label className="consent-check playlist-after-download"><input type="checkbox" checked={keepBackup} onChange={(event) => setKeepBackup(event.target.checked)} /><span>Also keep a recovery copy in Downloads/Files.</span></label>
      <button className="primary-button full-button" disabled={!canSubmit} onClick={() => onDownload({ url: url.trim(), format, track, addAfterDownload, keepBackup })}>{downloading ? <><LoaderCircle className="spin" size={17} />Converting audio…</> : <><Download size={17} />Convert and save to device</>}</button>
      <p className="download-footnote">Requires the Sonora download service to be configured. <a href="https://github.com/Tyrrrz/YoutubeDownloader" target="_blank" rel="noreferrer">Inspired by YoutubeDownloader</a>.</p>
    </Modal>
  );
}

function PlaylistModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  return (
    <Modal title="New playlist" subtitle="Give this collection a name." onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onCreate(name.trim()); }}>
        <label className="field-label" htmlFor="playlist-name">Playlist name</label>
        <input id="playlist-name" className="text-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Late night drive" maxLength={48} />
        <button className="primary-button full-button" disabled={!name.trim()}><Plus size={17} />Create playlist</button>
      </form>
    </Modal>
  );
}

function AddToPlaylistModal({ track, playlists, onClose, onAdd, onNew }) {
  return (
    <Modal title="Add to playlist" subtitle={`Choose where to save “${track.title}”.`} onClose={onClose}>
      <button className="playlist-choice create" onClick={onNew}><span><Plus size={19} /></span><div><strong>New playlist</strong><small>Create a fresh collection</small></div></button>
      <div className="playlist-options">
        {playlists.map((playlist) => (
          <button className="playlist-choice" key={playlist.id} onClick={() => onAdd(playlist)}>
            <span><ListMusic size={18} /></span><div><strong>{playlist.name}</strong><small>{playlist.trackIds.length} tracks</small></div><ChevronRight size={17} />
          </button>
        ))}
      </div>
      {!playlists.length && <p className="modal-empty">No playlists yet. Create your first one above.</p>}
    </Modal>
  );
}

function SettingsModal({ onClose, initialClientId, initialYoutubeKey, onSave, storage, youtubeServerManaged }) {
  const [clientId, setClientId] = useState(initialClientId);
  const [youtubeKey, setYoutubeKey] = useState(initialYoutubeKey);
  const used = storage?.usage || 0;
  const quota = storage?.quota || 0;
  return (
    <Modal title="Settings" subtitle="Personalize your Sonora music hub." onClose={onClose} wide>
      <div className="settings-block">
        <div className="settings-icon youtube-icon"><Play size={20} fill="currentColor" /></div>
        <div className="settings-content">
          <h3>YouTube mainstream catalog</h3>
          <p>Search mainstream music through Sonora's protected server connection. YouTube API credentials are never sent to the browser.</p>
          {!youtubeServerManaged && <input className="text-input" value={youtubeKey} onChange={(event) => setYoutubeKey(event.target.value)} placeholder="Server connection is not configured" disabled />}
          <small className="policy-links">Uses <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</small>
        </div>
      </div>
      <div className="settings-block">
        <div className="settings-icon"><Radio size={20} /></div>
        <div className="settings-content">
          <h3>Jamendo catalog</h3>
          <p>Connect the free Jamendo API to discover independent music. Create a free app at developer.jamendo.com and paste its client ID.</p>
          <input className="text-input" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Your Jamendo client ID" />
        </div>
      </div>
      <div className="settings-block">
        <div className="settings-icon"><HardDrive size={20} /></div>
        <div className="settings-content">
          <h3>Device storage</h3>
          <p>{storage ? `${formatBytes(used)} used by this browser · ${formatBytes(quota)} available quota · ${storage.persisted ? 'persistent protection granted' : 'standard browser storage'}` : 'Storage details are not available in this browser.'}</p>
          {quota > 0 && <div className="storage-bar"><span style={{ width: `${Math.max(2, used / quota * 100)}%` }} /></div>}
          {!storage?.persisted && <small className="policy-links">Install Sonora to your home screen and use it regularly to improve the chance that your browser grants persistent storage.</small>}
        </div>
      </div>
      <button className="primary-button full-button" onClick={() => onSave({ clientId: clientId.trim(), youtubeKey: youtubeKey.trim() })}><Check size={17} />Save settings</button>
    </Modal>
  );
}

function App() {
  const audioRef = useRef(typeof window !== 'undefined' ? new Audio() : null);
  const fileInputRef = useRef();
  const youtubePlayerRef = useRef(null);
  const searchTimerRef = useRef();
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [view, setView] = useState('home');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [catalogSource, setCatalogSource] = useState('youtube');
  const [arabicArtist, setArabicArtist] = useState(ARABIC_CLASSICS_ARTISTS[0]);
  const [repeat, setRepeat] = useState('off');
  const [search, setSearch] = useState('');
  const [youtubeKey, setYoutubeKey] = useState(ENV_CONFIG.youtubeKey);
  const [catalogTracks, setCatalogTracks] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [clientId, setClientId] = useState(ENV_CONFIG.jamendoClientId);
  const [storage, setStorage] = useState(null);
  const [modal, setModal] = useState(null);
  const [importing, setImporting] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [youtubeDownloading, setYoutubeDownloading] = useState(false);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshStorage = useCallback(async () => setStorage(await getStorageEstimate()), []);

  useEffect(() => {
    Promise.all([
      getTracks(),
      getPlaylists(),
      getSetting('jamendoClientId', ENV_CONFIG.jamendoClientId),
      Promise.resolve(ENV_CONFIG.youtubeKey)
    ]).then(([storedTracks, storedPlaylists, storedClientId, storedYoutubeKey]) => {
      setTracks(storedTracks.sort((a, b) => b.addedAt - a.addedAt));
      setPlaylists(storedPlaylists.sort((a, b) => a.createdAt - b.createdAt));
      setClientId(storedClientId);
      setYoutubeKey(storedYoutubeKey);
    });
    refreshStorage();
  }, [refreshStorage]);

  const protectDeviceStorage = useCallback(async () => {
    const persisted = await requestPersistentStorage();
    if (persisted) await refreshStorage();
    return persisted;
  }, [refreshStorage]);

  const updateTrack = useCallback(async (updated) => {
    await putTrack(updated);
    setTracks((items) => items.map((item) => item.id === updated.id ? updated : item));
    setCurrent((item) => item?.id === updated.id ? updated : item);
  }, []);

  const resolvedUrl = useMemo(() => {
    if (!current) return '';
    if (current.source === 'youtube') return '';
    const blob = current.cachedBlob || current.blob;
    return blob ? URL.createObjectURL(blob) : current.audio;
  }, [current]);

  useEffect(() => () => { if (resolvedUrl?.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl); }, [resolvedUrl]);

  const playNext = useCallback(() => {
    if (!queue.length || !current) return;
    if (repeat === 'one') {
      if (current.source === 'youtube' && youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(0, true);
        youtubePlayerRef.current.playVideo();
      } else {
        audioRef.current.currentTime = 0; audioRef.current.play();
      }
      return;
    }
    const currentIndex = queue.findIndex((track) => track.id === current.id);
    const nextIndex = shuffle ? Math.floor(Math.random() * queue.length) : currentIndex + 1;
    if (nextIndex < queue.length) setCurrent(queue[nextIndex]);
    else if (repeat === 'all') setCurrent(queue[0]);
    else setPlaying(false);
  }, [current, queue, repeat, shuffle]);

  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || current?.duration || 0);
    const onEnded = () => playNext();
    const onError = () => { setPlaying(false); notify('This track could not be played. Check the source or your connection.', 'error'); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [current, notify, playNext]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!current) return;
    setProgress(0);
    setDuration(current?.duration || 0);
    if (current.source === 'youtube') {
      audio.pause();
      audio.removeAttribute('src');
    } else if (resolvedUrl) {
      audio.src = resolvedUrl;
      audio.load();
      if (playing) audio.play().catch(() => setPlaying(false));
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: current.cover ? [{ src: current.cover, sizes: '512x512' }] : []
      });
    }
  }, [current, resolvedUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;
    audio.muted = muted;
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume * 100);
      if (muted) youtubePlayerRef.current.mute();
      else youtubePlayerRef.current.unMute();
    }
  }, [volume, muted]);

  useEffect(() => {
    if (!current) return;
    if (current.source === 'youtube') {
      if (!youtubePlayerRef.current) return;
      if (playing) youtubePlayerRef.current.playVideo();
      else youtubePlayerRef.current.pauseVideo();
      return;
    }
    const audio = audioRef.current;
    if (playing) audio.play().catch(() => { setPlaying(false); notify('Tap play again to start audio.', 'error'); });
    else audio.pause();
  }, [playing, current, notify]);

  useEffect(() => {
    if (current?.source !== 'youtube') return undefined;
    const timer = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player?.getCurrentTime) return;
      setProgress(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || current.duration || 0);
    }, 500);
    return () => window.clearInterval(timer);
  }, [current]);

  const handleYoutubeReady = (event) => {
    youtubePlayerRef.current = event.target;
    event.target.setVolume(volume * 100);
    if (muted) event.target.mute();
    else event.target.unMute();
    setDuration(event.target.getDuration() || current?.duration || 0);
    if (playing) event.target.playVideo();
  };

  const handleYoutubeState = (event) => {
    if (event.data === 1) setPlaying(true);
    else if (event.data === 2) setPlaying(false);
    else if (event.data === 0) playNext();
  };

  const playPrevious = useCallback(() => {
    const elapsed = current?.source === 'youtube'
      ? youtubePlayerRef.current?.getCurrentTime?.() || 0
      : audioRef.current.currentTime;
    if (elapsed > 3) {
      if (current?.source === 'youtube') youtubePlayerRef.current?.seekTo(0, true);
      else audioRef.current.currentTime = 0;
      return;
    }
    const index = queue.findIndex((track) => track.id === current?.id);
    if (index > 0) setCurrent(queue[index - 1]);
    else if (repeat === 'all' && queue.length) setCurrent(queue[queue.length - 1]);
  }, [current, queue, repeat]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => setPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false));
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
  }, [playNext, playPrevious]);

  const playTrack = useCallback((track, list = tracks) => {
    if (current?.id === track.id) { setPlaying((value) => !value); return; }
    setQueue(list.length ? list : [track]);
    setCurrent(track);
    setPlaying(true);
  }, [current, tracks]);

  const readTags = (file) => new Promise((resolve) => {
    if (!jsmediatags) return resolve({});
    jsmediatags.read(file, {
      onSuccess: ({ tags }) => resolve(tags),
      onError: () => resolve({})
    });
  });

  const readDuration = (file) => new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { resolve(audio.duration || 0); URL.revokeObjectURL(url); };
    audio.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    audio.src = url;
  });

  const importFiles = async (files, options = {}) => {
    await protectDeviceStorage();
    setImporting(true);
    let imported = 0;
    const importedTracks = [];
    const folderCollections = new Map();
    const importedAt = Date.now();
    for (const file of files) {
      try {
        const [tags, fileDuration] = await Promise.all([readTags(file), readDuration(file)]);
        let cover = '';
        if (tags.picture?.data) {
          const bytes = new Uint8Array(tags.picture.data);
          let binary = '';
          bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
          cover = `data:${tags.picture.format};base64,${btoa(binary)}`;
        }
        const cleanName = file.name.replace(/\.[^.]+$/, '');
        const parts = cleanName.split(' - ');
        const relativePath = file.webkitRelativePath || '';
        const relativeParts = relativePath ? relativePath.split('/').filter(Boolean) : [];
        const folderName = options.collectionName || (options.folderImport && relativeParts.length ? relativeParts[0] : '');
        const track = {
          id: `local-${crypto.randomUUID()}`,
          title: options.metadata?.title || tags.title || (parts.length > 1 ? parts.slice(1).join(' - ') : cleanName),
          artist: options.metadata?.artist || tags.artist || (parts.length > 1 ? parts[0] : 'Unknown artist'),
          album: options.metadata?.album || tags.album || (folderName || 'Local files'),
          duration: fileDuration || options.metadata?.duration || 0,
          cover: cover || options.metadata?.cover || '',
          blob: file,
          fileName: file.name,
          fileType: file.type,
          source: options.source || (folderName ? 'folder' : 'local'),
          folderName,
          folderPath: relativePath,
          externalId: options.metadata?.externalId || '',
          shareUrl: options.metadata?.shareUrl || '',
          originalSource: options.metadata?.source || '',
          favorite: false,
          addedAt: importedAt + imported,
          lastPlayed: 0
        };
        await putTrack(track);
        setTracks((items) => [track, ...items]);
        importedTracks.push(track);
        if (folderName) {
          if (!folderCollections.has(folderName)) folderCollections.set(folderName, []);
          folderCollections.get(folderName).push(track.id);
        }
        imported += 1;
      } catch (error) {
        console.error(error);
      }
    }

    if (folderCollections.size) {
      const timestamp = Date.now();
      const updates = [];
      for (const [folderName, trackIds] of folderCollections.entries()) {
        const existing = playlists.find((playlist) => playlist.name === folderName);
        const mergedTrackIds = [...new Set([...(existing?.trackIds || []), ...trackIds])];
        const playlist = existing
          ? { ...existing, trackIds: mergedTrackIds }
          : { id: crypto.randomUUID(), name: folderName, trackIds: mergedTrackIds, createdAt: timestamp };
        await putPlaylist(playlist);
        updates.push({ existing, playlist });
      }
      if (updates.length) {
        setPlaylists((items) => {
          let nextItems = [...items];
          for (const { existing, playlist } of updates) {
            if (existing) nextItems = nextItems.map((item) => item.id === existing.id ? playlist : item);
            else nextItems = [...nextItems, playlist];
          }
          return nextItems;
        });
      }
    }

    setImporting(false);
    setModal(null);
    await refreshStorage();
    notify(folderCollections.size
      ? `${imported} ${imported === 1 ? 'track' : 'tracks'} added and ${folderCollections.size} folder ${folderCollections.size === 1 ? 'playlist was' : 'playlists were'} created`
      : `${imported} ${imported === 1 ? 'track' : 'tracks'} added to your library`);
    return importedTracks;
  };

  const toggleFavorite = async (track) => {
    const stored = tracks.find((item) => item.id === track.id);
    if (!stored) {
      const added = { ...track, favorite: true, addedAt: Date.now() };
      await putTrack(added); setTracks((items) => [added, ...items]);
      notify('Saved to favorites'); return;
    }
    await updateTrack({ ...stored, favorite: !stored.favorite });
  };

  const deleteTrack = async (track) => {
    if (!window.confirm(`Remove “${track.title}” from your library?`)) return;
    await removeTrack(track.id);
    setTracks((items) => items.filter((item) => item.id !== track.id));
    setPlaylists((items) => items.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) })));
    if (current?.id === track.id) { setCurrent(null); setPlaying(false); }
    refreshStorage();
    notify('Track removed');
  };

  const saveCatalogTrack = async (track) => {
    if (tracks.some((item) => item.id === track.id)) { notify('Already in your library'); return; }
    const saved = { ...track, addedAt: Date.now(), favorite: false };
    await putTrack(saved);
    setTracks((items) => [saved, ...items]);
    notify('Saved to your library');
  };

  const saveOffline = async (track) => {
    if (!track.downloadAllowed || !track.downloadUrl) { notify('The artist has not enabled downloads for this track.', 'error'); return; }
    notify('Downloading for offline listening…');
    try {
      const response = await fetch(track.downloadUrl);
      if (!response.ok) throw new Error('Download failed');
      const cachedBlob = await response.blob();
      const stored = tracks.find((item) => item.id === track.id) || { ...track, addedAt: Date.now(), favorite: false };
      const updated = { ...stored, cachedBlob };
      await putTrack(updated);
      setTracks((items) => items.some((item) => item.id === track.id) ? items.map((item) => item.id === track.id ? updated : item) : [updated, ...items]);
      refreshStorage();
      notify('Available offline');
    } catch {
      window.open(track.downloadUrl, '_blank', 'noopener,noreferrer');
      notify('Opened the artist-approved download in a new tab.', 'error');
    }
  };

  const downloadYoutubeAudio = async ({ url, format, track, addAfterDownload = false, keepBackup = true }) => {
    const existingDownload = track?.externalId
      ? tracks.find((item) => item.source === 'youtube-download' && item.externalId === track.externalId && item.fileName?.toLowerCase().endsWith(`.${format}`))
      : null;
    if (existingDownload) {
      if (keepBackup && (existingDownload.blob || existingDownload.cachedBlob)) {
        saveRecoveryCopy(existingDownload.blob || existingDownload.cachedBlob, existingDownload.fileName || `${existingDownload.title}.${format}`);
      }
      notify('This audio format is already saved on your device');
      if (addAfterDownload) setModal({ type: 'add', track: existingDownload });
      return;
    }
    await protectDeviceStorage();
    setYoutubeDownloading(true);
    try {
      const response = await fetch(`/api/youtube/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent(format)}`);
      if (!response.ok) {
        const message = await response.text().catch(() => 'Download service unavailable');
        throw new Error(message || 'Download service unavailable');
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('The download service returned an empty file.');
      const rawTitle = response.headers.get('X-Track-Title') || 'YouTube audio';
      const title = decodeEntities(decodeURIComponent(rawTitle)).replace(/[\\/:*?"<>|]+/g, '').trim() || 'YouTube audio';
      const fileName = `${title}.${format}`;
      if (keepBackup) saveRecoveryCopy(blob, fileName);
      const [downloadedTrack] = await importFiles(
        [new File([blob], fileName, { type: blob.type || audioMimeType(fileName) })],
        { source: 'youtube-download', metadata: track }
      );
      if (downloadedTrack && addAfterDownload) setModal({ type: 'add', track: downloadedTrack });
    } catch (error) {
      console.error(error);
      notify(error.message || 'Could not download this audio.', 'error');
    } finally {
      setYoutubeDownloading(false);
    }
  };

  const createPlaylist = async (name, trackToAdd = null) => {
    if (trackToAdd && !tracks.some((item) => item.id === trackToAdd.id)) {
      const savedTrack = { ...trackToAdd, addedAt: Date.now(), favorite: false };
      await putTrack(savedTrack);
      setTracks((items) => [savedTrack, ...items]);
    }
    const playlist = { id: crypto.randomUUID(), name, trackIds: trackToAdd ? [trackToAdd.id] : [], createdAt: Date.now() };
    await putPlaylist(playlist);
    setPlaylists((items) => [...items, playlist]);
    setModal(null);
    notify('Playlist created');
  };

  const addToPlaylist = async (playlist, track) => {
    if (playlist.trackIds.includes(track.id)) { notify('This track is already in the playlist', 'error'); return; }
    let savedTrack = tracks.find((item) => item.id === track.id);
    if (!savedTrack) { savedTrack = { ...track, addedAt: Date.now(), favorite: false }; await putTrack(savedTrack); setTracks((items) => [savedTrack, ...items]); }
    const updated = { ...playlist, trackIds: [...playlist.trackIds, track.id] };
    await putPlaylist(updated);
    setPlaylists((items) => items.map((item) => item.id === playlist.id ? updated : item));
    setModal(null);
    notify(`Added to ${playlist.name}`);
  };

  const deletePlaylist = async (playlist) => {
    if (!window.confirm(`Delete the playlist “${playlist.name}”? Your music will stay in the library.`)) return;
    await removePlaylist(playlist.id);
    setPlaylists((items) => items.filter((item) => item.id !== playlist.id));
    setView('home'); setSelectedPlaylist(null); notify('Playlist deleted');
  };

  const searchJamendo = useCallback(async (term = '') => {
    if (!clientId) return;
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ client_id: clientId, format: 'json', limit: '24', audioformat: 'mp32', audiodlformat: 'mp32', include: 'musicinfo+licenses', imagesize: '500' });
      if (term.trim()) params.set('search', term.trim());
      else { params.set('order', 'popularity_week'); params.set('groupby', 'artist_id'); }
      const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`);
      const data = await response.json();
      if (data.headers?.status !== 'success') throw new Error(data.headers?.error_message || 'Jamendo error');
      setCatalogTracks(data.results.map((item) => ({
        id: `jamendo-${item.id}`,
        externalId: item.id,
        title: item.name,
        artist: item.artist_name,
        album: item.album_name || 'Single',
        duration: Number(item.duration) || 0,
        cover: item.image || item.album_image,
        audio: item.audio,
        downloadUrl: item.audiodownload,
        downloadAllowed: Boolean(item.audiodownload_allowed),
        shareUrl: item.shareurl,
        source: 'jamendo'
      })));
    } catch (error) {
      console.error(error);
      notify('Could not connect to Jamendo. Check your client ID and connection.', 'error');
      setCatalogTracks([]);
    } finally { setCatalogLoading(false); }
  }, [clientId, notify]);

  const searchYouTube = useCallback(async (term = '') => {
    if (!youtubeKey) return;
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ region: ENV_CONFIG.youtubeRegion || navigator.language?.split('-')[1]?.toUpperCase() || 'US' });
      if (term.trim()) params.set('q', term.trim());
      const response = await fetch(`/api/youtube/search?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'YouTube search failed');
      setCatalogTracks(data.results || []);
    } catch (error) {
      console.error(error);
      notify('Could not connect to YouTube. Check the API key, quota, and connection.', 'error');
      setCatalogTracks([]);
    } finally { setCatalogLoading(false); }
  }, [youtubeKey, notify]);

  const performSearch = useCallback(() => {
    if (view === 'explore') {
      if (catalogSource === 'youtube') searchYouTube(search);
      else searchJamendo(search);
      return;
    }

    if (view === 'arabic') {
      searchYouTube(search.trim() || arabicArtist.query);
      return;
    }

    if (search.trim()) setView('library');
  }, [view, catalogSource, search, arabicArtist.query, searchYouTube, searchJamendo]);

  useEffect(() => {
    if (view !== 'explore') return;
    const hasCredential = catalogSource === 'youtube' ? youtubeKey : clientId;
    if (!hasCredential) return;
    window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => catalogSource === 'youtube' ? searchYouTube(search) : searchJamendo(search), 450);
    return () => window.clearTimeout(searchTimerRef.current);
  }, [view, search, catalogSource, clientId, youtubeKey, searchJamendo, searchYouTube]);

  useEffect(() => {
    if (view !== 'arabic' || !youtubeKey) return;
    window.clearTimeout(searchTimerRef.current);
    const query = search.trim() || arabicArtist.query;
    searchTimerRef.current = window.setTimeout(() => searchYouTube(query), 450);
    return () => window.clearTimeout(searchTimerRef.current);
  }, [view, search, arabicArtist, youtubeKey, searchYouTube]);

  const saveArabicSelection = async () => {
    if (!catalogTracks.length) { notify('Choose an artist with available results first.', 'error'); return; }
    const timestamp = Date.now();
    const newTracks = catalogTracks
      .filter((track) => !tracks.some((saved) => saved.id === track.id))
      .map((track, index) => ({ ...track, addedAt: timestamp + index, favorite: false }));
    await Promise.all(newTracks.map((track) => putTrack(track)));
    if (newTracks.length) setTracks((items) => [...newTracks, ...items]);

    const name = `${arabicArtist.name} · Arabic Classics`;
    const existing = playlists.find((playlist) => playlist.name === name);
    const trackIds = [...new Set([...(existing?.trackIds || []), ...catalogTracks.map((track) => track.id)])];
    const playlist = existing
      ? { ...existing, trackIds }
      : { id: crypto.randomUUID(), name, trackIds, createdAt: timestamp };
    await putPlaylist(playlist);
    setPlaylists((items) => existing
      ? items.map((item) => item.id === existing.id ? playlist : item)
      : [...items, playlist]);
    notify(`${trackIds.length} ${arabicArtist.name} tracks saved as a playlist`);
  };

  const saveSettings = async ({ clientId: nextClientId, youtubeKey: nextYoutubeKey }) => {
    const effectiveClientId = nextClientId || ENV_CONFIG.jamendoClientId;
    await Promise.all([
      setSetting('jamendoClientId', nextClientId === ENV_CONFIG.jamendoClientId ? null : nextClientId || null),
      setSetting('youtubeApiKey', null)
    ]);
    setClientId(effectiveClientId);
    setYoutubeKey(ENV_CONFIG.youtubeKey);
    setModal(null);
    notify('Settings saved');
  };

  const filteredTracks = useMemo(() => {
    const term = search.toLowerCase().trim();
    let list = tracks;
    if (view === 'favorites') list = list.filter((track) => track.favorite);
    if (view === 'offline') list = list.filter((track) => track.blob || track.cachedBlob);
    if (view === 'playlist' && selectedPlaylist) list = selectedPlaylist.trackIds.map((id) => tracks.find((track) => track.id === id)).filter(Boolean);
    if (term && view !== 'explore') list = list.filter((track) => [track.title, track.artist, track.album].some((value) => value?.toLowerCase().includes(term)));
    return list;
  }, [tracks, search, view, selectedPlaylist]);

  const goTo = (destination, playlist = null) => {
    setView(destination); setSelectedPlaylist(playlist); setSearch(''); setMobileMenu(false);
  };

  const cycleRepeat = () => setRepeat((value) => value === 'off' ? 'all' : value === 'all' ? 'one' : 'off');
  const currentQueueIndex = queue.findIndex((track) => track.id === current?.id);

  const viewMeta = {
    library: ['Your library', `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'} collected in one place.`],
    favorites: ['Liked songs', 'The tracks you always come back to.'],
    offline: ['Offline music', 'Ready to play anywhere, no connection needed.'],
    playlist: [selectedPlaylist?.name || 'Playlist', `${filteredTracks.length} tracks`]
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <div className="sidebar-top"><Logo /><button className="icon-button mobile-close" onClick={() => setMobileMenu(false)}><X size={20} /></button></div>
        <nav className="primary-nav">
          <button className={view === 'home' ? 'active' : ''} onClick={() => goTo('home')}><Home size={19} />Home</button>
          <button className={view === 'explore' ? 'active' : ''} onClick={() => goTo('explore')}><Compass size={19} />Explore</button>
          <button onClick={() => setModal({ type: 'youtube-download' })}><Download size={19} />Download audio</button>
          <button className={view === 'arabic' ? 'active' : ''} onClick={() => goTo('arabic')}><Disc3 size={19} />Arabic classics</button>
          <button className={view === 'library' ? 'active' : ''} onClick={() => goTo('library')}><Library size={19} />Your library</button>
        </nav>
        <div className="nav-label">Collection</div>
        <nav className="secondary-nav">
          <button className={view === 'favorites' ? 'active' : ''} onClick={() => goTo('favorites')}><Heart size={18} />Liked songs</button>
          <button className={view === 'offline' ? 'active' : ''} onClick={() => goTo('offline')}><Download size={18} />Offline</button>
        </nav>
        <div className="nav-label playlist-label"><span>Playlists</span><button className="mini-add" onClick={() => setModal({ type: 'playlist' })} aria-label="New playlist"><Plus size={16} /></button></div>
        <nav className="playlist-nav">
          {playlists.map((playlist) => <button key={playlist.id} className={selectedPlaylist?.id === playlist.id && view === 'playlist' ? 'active' : ''} onClick={() => goTo('playlist', playlist)}><span className="playlist-bullet" />{playlist.name}</button>)}
          {!playlists.length && <button className="empty-playlist-link" onClick={() => setModal({ type: 'playlist' })}>Create your first playlist</button>}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => { refreshStorage(); setModal({ type: 'settings' }); }}><Settings size={18} />Settings</button>
          <div className="profile"><span>M</span><div><strong>My music</strong><small>Private library</small></div></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
          <div className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); performSearch(); } }} placeholder={view === 'explore' ? `Search ${catalogSource === 'youtube' ? 'mainstream' : 'independent'} music…` : view === 'arabic' ? 'Search Arabic classics…' : 'Search your music…'} /><kbd>⌘ K</kbd></div>
            <button className="ghost-button hide-mobile" onClick={() => setModal({ type: 'youtube-download' })}><Download size={17} />Download audio</button><button className="ghost-button hide-mobile" onClick={() => setModal({ type: 'settings' })}><Radio size={17} />{youtubeKey || clientId ? 'Catalog connected' : 'Connect catalog'}</button>
          <button className="primary-button" onClick={() => setModal({ type: 'upload' })}><Upload size={17} /><span className="upload-label">Add music</span></button>
        </header>

        <div className="page-scroll">
          {view === 'home' && (
            <div className="page home-page">
              <section className="welcome-row"><div><p className="eyebrow">YOUR PRIVATE MUSIC SPACE</p><h1>Good to see you.</h1><p>Everything you love, ready when you are.</p></div><div className="date-orb"><Headphones size={31} /><span>{tracks.length}</span><small>tracks</small></div></section>
              {search.trim() ? (
                <section className="section-block">
                  <div className="section-title"><div><p className="eyebrow">SEARCH RESULTS</p><h2>{`Matches for “${search}”`}</h2></div><button onClick={() => setSearch('')}>Clear</button></div>
                  {filteredTracks.length ? <div className="card-grid catalog-grid">{filteredTracks.map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, filteredTracks)} active={current?.id === track.id} playing={playing} />)}</div> : <EmptyState icon={Search} title="No matches yet" text="Try a different artist, title, or album from your library." />}
                </section>
              ) : !tracks.length ? (
                <section className="onboarding-card">
                  <div className="onboarding-copy"><span className="eyebrow-pill"><Sparkles size={14} />YOUR LIBRARY STARTS HERE</span><h2>Bring all your music<br />under one roof.</h2><p>Import the songs you already own. Sonora reads their artwork and details, keeps them private, and makes them available offline.</p><div className="hero-actions"><button className="primary-button large" onClick={() => setModal({ type: 'upload' })}><FolderUp size={18} />Choose music</button><button className="secondary-button large" onClick={() => goTo('explore')}><Compass size={18} />Explore free music</button></div></div>
                  <div className="vinyl-scene"><div className="vinyl"><div className="vinyl-label"><Music2 size={25} /></div></div><div className="vinyl-card"><div className="visualizer">{[17, 29, 22, 40, 31, 48, 25, 36, 19, 44, 28, 38].map((height, i) => <i key={i} style={{ height }} />)}</div><strong>Your soundtrack</strong><span>is waiting</span></div></div>
                </section>
              ) : (
                <>
                  <section className="quick-grid">
                    <button onClick={() => goTo('favorites')}><span className="quick-icon liked"><Heart size={22} fill="currentColor" /></span><div><strong>Liked songs</strong><small>{tracks.filter((track) => track.favorite).length} tracks</small></div><Play size={18} fill="currentColor" /></button>
                    <button onClick={() => goTo('offline')}><span className="quick-icon offline"><Download size={22} /></span><div><strong>Offline</strong><small>{tracks.filter((track) => track.blob || track.cachedBlob).length} tracks</small></div><Play size={18} fill="currentColor" /></button>
                    {playlists.slice(0, 2).map((playlist) => <button key={playlist.id} onClick={() => goTo('playlist', playlist)}><span className="quick-icon" style={{ background: artworkGradient(playlist.id) }}><ListMusic size={22} /></span><div><strong>{playlist.name}</strong><small>{playlist.trackIds.length} tracks</small></div><Play size={18} fill="currentColor" /></button>)}
                  </section>
                  <section className="section-block"><div className="section-title"><div><p className="eyebrow">BACK IN ROTATION</p><h2>Recently added</h2></div><button onClick={() => goTo('library')}>See all <ChevronRight size={16} /></button></div><div className="card-grid">{tracks.slice(0, 6).map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, tracks)} active={current?.id === track.id} playing={playing} />)}</div></section>
                </>
              )}
              <section className="feature-strip"><div><WifiOff size={20} /><span><strong>Offline first</strong><small>Imported songs play without internet</small></span></div><div><HardDrive size={20} /><span><strong>Private by design</strong><small>Your files stay on your device</small></span></div><div><Radio size={20} /><span><strong>One music hub</strong><small>Your files and free music together</small></span></div></section>
            </div>
          )}

          {view === 'explore' && (
            <div className="page">
              <section className={`explore-hero ${catalogSource}`}><div><p className="eyebrow">{catalogSource === 'youtube' ? 'MAINSTREAM · POWERED BY YOUTUBE' : 'INDEPENDENT · POWERED BY JAMENDO'}</p><h1>{catalogSource === 'youtube' ? 'All the music people are talking about.' : 'Find your next favorite.'}</h1><p>{catalogSource === 'youtube' ? 'Search official videos, live performances, and mainstream releases—then mix them into your own Sonora playlists.' : 'Discover independent artists and music you can legally stream—and, when the artist allows it, save offline.'}</p></div><span className="explore-disc">{catalogSource === 'youtube' ? <Play size={44} fill="currentColor" /> : <Disc3 size={44} />}</span></section>
              <div className="catalog-tabs">
                <button className={catalogSource === 'youtube' ? 'active youtube' : ''} onClick={() => { setCatalogSource('youtube'); setCatalogTracks([]); setSearch(''); }}><Play size={16} fill="currentColor" />Mainstream</button>
                <button className={catalogSource === 'jamendo' ? 'active' : ''} onClick={() => { setCatalogSource('jamendo'); setCatalogTracks([]); setSearch(''); }}><Radio size={16} />Independent</button>
              </div>
              {!(catalogSource === 'youtube' ? youtubeKey : clientId) ? (
                <EmptyState icon={catalogSource === 'youtube' ? Play : Radio} title={`Connect ${catalogSource === 'youtube' ? 'YouTube' : 'Jamendo'} discovery`} text={catalogSource === 'youtube' ? 'Add a YouTube Data API key once to search mainstream music, discover trending videos, play them here, and save them to Sonora playlists.' : 'Jamendo requires a free developer client ID. Add yours once, then search and stream its independent catalog here.'} action={() => setModal({ type: 'settings' })} actionLabel={`Connect ${catalogSource === 'youtube' ? 'YouTube' : 'Jamendo'}`} />
              ) : catalogLoading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={28} /><span>Finding great music…</span></div>
              ) : (
                <section className="section-block"><div className="section-title"><div><p className="eyebrow">{search ? 'SEARCH RESULTS' : 'TRENDING NOW'}</p><h2>{search ? `Songs for “${search}”` : catalogSource === 'youtube' ? 'Popular music in your region' : 'Fresh from independent artists'}</h2></div></div>{catalogTracks.length ? <div className="card-grid catalog-grid">{catalogTracks.map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, catalogTracks)} onSave={() => saveCatalogTrack(track)} onAdd={() => setModal({ type: 'add', track })} onDownload={track.source === 'youtube' ? () => setModal({ type: 'youtube-download', track }) : undefined} saved={tracks.some((item) => item.id === track.id)} active={current?.id === track.id} playing={playing} />)}</div> : <EmptyState icon={Search} title="No tracks found" text="Try another artist, track, genre, or mood." />}</section>
              )}
              <p className="catalog-legal">{catalogSource === 'youtube' ? <>Streaming uses the official visible YouTube player. The audio download tool is only for content you own or have permission to save, subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</> : 'Offline download is shown only when the Jamendo artist has enabled it.'}</p>
            </div>
          )}

          {view === 'arabic' && (
            <div className="page arabic-page">
              <section className="arabic-hero">
                <div><p className="eyebrow">CURATED ARABIC CLASSICS · POWERED BY YOUTUBE</p><h1 dir="rtl">أغاني الزمن الجميل</h1><p>Rediscover the voices that shaped Arabic music. Choose an artist, play through the official YouTube player, and collect favorites in your own Sonora playlists.</p></div>
                <div className="arabic-ornament" aria-hidden="true"><span>نغم</span><Disc3 size={42} /></div>
              </section>
              <div className="artist-chips" aria-label="Classic Arabic artists">
                {ARABIC_CLASSICS_ARTISTS.map((artist) => <button key={artist.name} className={arabicArtist.name === artist.name && !search ? 'active' : ''} onClick={() => { setArabicArtist(artist); setCatalogTracks([]); setSearch(''); }}><span dir="rtl">{artist.arabic}</span><small>{artist.name}</small></button>)}
              </div>
              {!youtubeKey ? (
                <EmptyState icon={Disc3} title="Connect YouTube discovery" text="Add a YouTube Data API key once to browse and play this Arabic classics collection." action={() => setModal({ type: 'settings' })} actionLabel="Connect YouTube" />
              ) : catalogLoading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={28} /><span>Opening the classics archive…</span></div>
              ) : (
                <section className="section-block">
                  <div className="section-title arabic-section-title"><div><p className="eyebrow">{search ? 'SEARCH RESULTS' : 'FEATURED ARTIST'}</p><h2>{search ? `Classics for “${search}”` : <><span dir="rtl">{arabicArtist.arabic}</span> · {arabicArtist.name}</>}</h2></div>{catalogTracks.length > 0 && <button className="save-selection" onClick={saveArabicSelection}><ListPlus size={16} />Save all as playlist</button>}</div>
                  {catalogTracks.length ? <div className="card-grid catalog-grid">{catalogTracks.map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, catalogTracks)} onSave={() => saveCatalogTrack(track)} onAdd={() => setModal({ type: 'add', track })} onDownload={() => setModal({ type: 'youtube-download', track })} saved={tracks.some((item) => item.id === track.id)} active={current?.id === track.id} playing={playing} />)}</div> : <EmptyState icon={Search} title="No classics found" text="Try another artist or search in Arabic or English." />}
                </section>
              )}
              <p className="catalog-legal">Streaming uses the official visible YouTube player. Download audio only when you own the content or have permission to save it, subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</p>
            </div>
          )}

          {['library', 'favorites', 'offline', 'playlist'].includes(view) && (
            <div className="page collection-page">
              <section className="collection-header">
                <div className="collection-art" style={{ background: view === 'favorites' ? 'linear-gradient(145deg,#cf63ff,#6532d4)' : view === 'offline' ? 'linear-gradient(145deg,#b8f34a,#348d53)' : artworkGradient(selectedPlaylist?.id || view) }}>{view === 'favorites' ? <Heart size={42} fill="currentColor" /> : view === 'offline' ? <Download size={42} /> : view === 'playlist' ? <ListMusic size={42} /> : <Library size={42} />}</div>
                <div><p className="eyebrow">{view === 'playlist' ? 'PLAYLIST' : 'COLLECTION'}</p><h1>{viewMeta[view]?.[0]}</h1><p>{viewMeta[view]?.[1]}</p><div className="collection-actions"><button className="round-play" disabled={!filteredTracks.length} onClick={() => filteredTracks[0] && playTrack(filteredTracks[0], filteredTracks)}><Play size={22} fill="currentColor" /></button>{view === 'playlist' && <button className="icon-button bordered" onClick={() => deletePlaylist(selectedPlaylist)}><Trash2 size={18} /></button>}</div></div>
              </section>
              {filteredTracks.length ? (
                <section className="track-table"><div className="track-table-head"><span>#</span><span>Title</span><span>Album</span><span>Availability</span><span /><span><Clock3 size={15} /></span><span /></div>{filteredTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} active={current?.id === track.id} playing={playing} onPlay={() => playTrack(track, filteredTracks)} onFavorite={() => toggleFavorite(track)} onDownload={() => saveOffline(track)} onAdd={() => setModal({ type: 'add', track })} onDelete={() => deleteTrack(track)} />)}</section>
              ) : (
                <EmptyState icon={view === 'favorites' ? Heart : view === 'offline' ? Download : Music2} title={search ? 'No matching music' : `No ${view === 'library' ? 'music' : view === 'playlist' ? 'tracks here' : view} yet`} text={search ? 'Try a different title, artist, or album.' : view === 'favorites' ? 'Tap the heart beside any track to keep it here.' : view === 'offline' ? 'Imported music is offline automatically. Artist-approved Jamendo downloads appear here too.' : 'Add audio files from this device to begin your collection.'} action={view === 'library' ? () => setModal({ type: 'upload' }) : null} actionLabel="Add music" />
              )}
            </div>
          )}
        </div>

      {current?.source === 'youtube' && (
        <section className="youtube-dock" aria-label="YouTube video player">
          <div className="youtube-dock-head"><span><Play size={14} fill="currentColor" />Playing on YouTube</span><div><a href={current.shareUrl} target="_blank" rel="noreferrer">Open YouTube</a><button className="icon-button" onClick={() => { setPlaying(false); setCurrent(null); }}><X size={17} /></button></div></div>
          <div className="youtube-frame">
            <YouTube key={current.externalId} videoId={current.externalId} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin } }} onReady={handleYoutubeReady} onStateChange={handleYoutubeState} onError={() => { setPlaying(false); notify('YouTube could not play this video. Try another result.', 'error'); }} />
          </div>
        </section>
      )}
      </main>

      {current && (
        <footer className="player-bar">
          <div className="now-playing"><Cover track={current} size="player" /><div><strong>{current.title}</strong><span>{current.artist}</span></div><button className={`icon-button subtle favorite ${current.favorite ? 'selected' : ''}`} onClick={() => toggleFavorite(current)}><Heart size={17} fill={current.favorite ? 'currentColor' : 'none'} /></button></div>
          <div className="player-center"><div className="player-controls"><button className={`icon-button ${shuffle ? 'control-active' : ''}`} onClick={() => setShuffle(!shuffle)}><Shuffle size={17} /></button><button className="icon-button" onClick={playPrevious}><SkipBack size={19} fill="currentColor" /></button><button className="main-play" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><button className="icon-button" onClick={playNext}><SkipForward size={19} fill="currentColor" /></button><button className={`icon-button repeat-button ${repeat !== 'off' ? 'control-active' : ''}`} onClick={cycleRepeat}><Repeat2 size={17} />{repeat === 'one' && <sup>1</sup>}</button></div><div className="progress-row"><span>{formatTime(progress)}</span><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(progress, duration || 0)} onChange={(event) => { const nextTime = Number(event.target.value); if (current.source === 'youtube') youtubePlayerRef.current?.seekTo(nextTime, true); else audioRef.current.currentTime = nextTime; setProgress(nextTime); }} style={{ '--progress': `${duration ? progress / duration * 100 : 0}%` }} /><span>{formatTime(duration)}</span></div></div>
          <div className="player-right"><button className={`icon-button ${queueOpen ? 'control-active' : ''}`} onClick={() => setQueueOpen(!queueOpen)}><ListMusic size={18} /></button><button className="icon-button" onClick={() => setMuted(!muted)}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input className="volume-slider" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} style={{ '--progress': `${volume * 100}%` }} /></div>
        </footer>
      )}

      {queueOpen && <aside className="queue-drawer"><div className="queue-header"><div><p className="eyebrow">UP NEXT</p><h2>Play queue</h2></div><button className="icon-button" onClick={() => setQueueOpen(false)}><X size={19} /></button></div><div className="queue-now"><Cover track={current} size="queue" /><strong>{current?.title}</strong><span>{current?.artist}</span></div><div className="queue-list">{queue.slice(currentQueueIndex + 1).map((track, index) => <button key={`${track.id}-${index}`} onClick={() => { setCurrent(track); setPlaying(true); }}><Cover track={track} size="tiny" /><span><strong>{track.title}</strong><small>{track.artist}</small></span><MoreHorizontal size={17} /></button>)}</div>{currentQueueIndex === queue.length - 1 && <p className="queue-empty">That’s the end of the queue.</p>}</aside>}

      <nav className="mobile-nav"><button className={view === 'home' ? 'active' : ''} onClick={() => goTo('home')}><Home size={20} /><span>Home</span></button><button className={view === 'explore' || view === 'arabic' ? 'active' : ''} onClick={() => goTo(view === 'arabic' ? 'arabic' : 'explore')}><Compass size={20} /><span>{view === 'arabic' ? 'Classics' : 'Explore'}</span></button><button onClick={() => setModal({ type: 'youtube-download' })}><Download size={20} /><span>Download</span></button><button className={view === 'library' ? 'active' : ''} onClick={() => goTo('library')}><Library size={20} /><span>Library</span></button></nav>

      {modal?.type === 'upload' && <UploadModal onClose={() => !importing && setModal(null)} onFiles={importFiles} onFolder={(files) => importFiles(files, { folderImport: true })} importing={importing} />}
      {modal?.type === 'youtube-download' && <YoutubeDownloadModal onClose={() => !youtubeDownloading && setModal(null)} onDownload={downloadYoutubeAudio} downloading={youtubeDownloading} track={modal.track} />}
      {modal?.type === 'playlist' && <PlaylistModal onClose={() => setModal(null)} onCreate={createPlaylist} />}
      {modal?.type === 'add' && <AddToPlaylistModal track={modal.track} playlists={playlists} onClose={() => setModal(null)} onAdd={(playlist) => addToPlaylist(playlist, modal.track)} onNew={() => setModal({ type: 'playlistWithTrack', track: modal.track })} />}
      {modal?.type === 'playlistWithTrack' && <PlaylistModal onClose={() => setModal(null)} onCreate={(name) => createPlaylist(name, modal.track)} />}
      {modal?.type === 'settings' && <SettingsModal onClose={() => setModal(null)} initialClientId={clientId} initialYoutubeKey={youtubeKey} onSave={saveSettings} storage={storage} youtubeServerManaged={Boolean(ENV_CONFIG.youtubeKey)} />}
      {toast && <div className={`toast ${toast.type}`}><span>{toast.type === 'success' ? <Check size={16} /> : <WifiOff size={16} />}</span>{toast.message}</div>}
      <input ref={fileInputRef} hidden type="file" multiple accept="audio/*" onChange={(event) => importFiles([...event.target.files])} />
    </div>
  );
}

export default App;
