'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'jsmediatags/dist/jsmediatags.min.js';
import YouTube from 'react-youtube';
import appPackage from '../package.json';
import Modal from './Modal';
import { fetchYoutubeAudio } from './download-stream.mjs';
import { isNativeAndroid, minimizeAndroid, youtubeRequest, onNativeDownloadCancelled, pendingNativeDownload, releaseNativeDownload, cancelKeptNativeDownload } from './native-media.mjs';
import { nativePlayer } from './native-player.mjs';
import { readDuration, readTags, pictureDataUrl } from './audio-metadata.mjs';
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Clock3, Cloud, Compass, Disc3, Download,
  DownloadCloud, FolderUp, HardDrive, Headphones, Heart, Home, Library,
  ListEnd, ListMusic, ListPlus, LoaderCircle, Menu, MoreHorizontal, Music2, Pause,
  Play, Plus, Radio, Repeat2, Search, Settings, Shuffle, SkipBack,
  SkipForward, SlidersHorizontal, Sparkles, Trash2, Upload, Volume2, VolumeX, WifiOff, X
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
const ENV_CONFIG = {
  youtubeKey: process.env.NEXT_PUBLIC_YOUTUBE_ENABLED !== 'false' ? 'server' : '',
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

const shuffled = (items = []) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
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

const isYoutubePlaylistUrl = (value = '') => {
  try {
    const parsed = new URL(value);
    return isYoutubeUrl(value) && (parsed.pathname === '/playlist' || parsed.searchParams.has('list'));
  } catch {
    return false;
  }
};

const getYoutubeVideoId = (value = '') => {
  try {
    const parsed = new URL(value);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    return ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] || '' : '';
  } catch {
    return '';
  }
};

const cleanYoutubeTitle = (value = '') => {
  try {
    return decodeEntities(decodeURIComponent(value)).replace(/[\\/:*?"<>|]+/g, '').trim() || 'YouTube audio';
  } catch {
    return decodeEntities(value).replace(/[\\/:*?"<>|]+/g, '').trim() || 'YouTube audio';
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

function TrackRow({ track, index, active, playing, onPlay, onFavorite, onDownload, onAdd, onDelete, onMore, showAlbum = true }) {
  return (
    <div className={`track-row ${active ? 'active' : ''}`}>
      <button className="track-index" onClick={onPlay} aria-label={`${playing && active ? 'Pause' : 'Play'} ${track.title}`}>
        <span className="row-number">{index + 1}</span>
        <span className="row-play">{playing && active ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</span>
      </button>
      <Cover track={track} size="small" />
      <button className="track-name track-name-button" onClick={onPlay}>
        <strong>{track.title}</strong>
        <span>{track.artist || 'Unknown artist'}</span>
      </button>
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
        <button className="icon-button subtle track-more" onClick={onMore} aria-label={`More options for ${track.title}`}><MoreHorizontal size={18} /></button>
      </div>
    </div>
  );
}

function TrackCard({ track, onPlay, onSave, onAdd, onDownload, onMore, saved, active, playing }) {
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
        {onMore && <button className="card-more" onClick={onMore} aria-label={`More options for ${track.title}`}><MoreHorizontal size={17} /></button>}
      </div>
      <h3>{track.title}</h3>
      <p>{track.artist || 'Unknown artist'}</p>
    </article>
  );
}

function UploadModal({ onClose, onFiles, onFolder, importing, progress }) {
  const inputRef = useRef();
  const folderInputRef = useRef();
  const [dragging, setDragging] = useState(false);
  const accept = (files) => {
    if (!importing) onFiles([...files]);
  };
  return (
    <Modal title="Add your music" subtitle="Your files stay private and are stored on this device." onClose={onClose}>
      <input ref={inputRef} hidden type="file" multiple accept="audio/*,.flac" onChange={(event) => accept(event.target.files)} />
      <input ref={folderInputRef} hidden type="file" multiple accept="audio/*,.flac" directory="" webkitdirectory="" onChange={(event) => onFolder?.([...event.target.files])} />
      <button
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        disabled={importing}
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
      {progress && <p className="import-status" role="status">{progress.current} of {progress.total} · {progress.name}</p>}
      <div className="privacy-note"><HardDrive size={18} /><span><strong>Local by design.</strong> Music is saved on this device for offline listening.</span></div>
    </Modal>
  );
}

function YoutubeDownloadModal({ onClose, onDownload, onCancel, onImport, hosted, task, track }) {
  const [url, setUrl] = useState(track?.shareUrl || task?.request?.url || '');
  const [format, setFormat] = useState(task?.request?.format || 'mp3');
  const [confirmed, setConfirmed] = useState(Boolean(task?.request));
  const [addAfterDownload, setAddAfterDownload] = useState(Boolean(track));
  const [keepBackup, setKeepBackup] = useState(task?.request?.keepBackup ?? true);
  const downloading = Boolean(task?.active);
  const playlistUrl = isYoutubePlaylistUrl(url.trim());
  const canSubmit = isYoutubeUrl(url.trim()) && confirmed && !downloading;
  const total = task?.total || 1;
  const itemProgress = task?.transferTotal ? task.transferLoaded / task.transferTotal : 0;
  const percent = Math.max(0, Math.min(100, Math.round(((task?.completed || 0) + itemProgress) / total * 100)));
  const indeterminate = downloading && !task?.transferTotal;
  const stageLabel = {
    preparing: 'Checking your download…',
    waiting: 'Playlist paused until you return',
    downloading: 'Downloading source audio…',
    converting: 'Converting audio…',
    receiving: 'Saving audio from the converter…',
    storing: 'Adding this track to your device…',
    cancelling: 'Cancelling download…',
    complete: 'Download complete',
    partial: 'Finished with a few problems',
    cancelled: 'Download cancelled',
    error: 'Download failed'
  }[task?.stage] || '';
  if (hosted && !isNativeAndroid()) return (
    <Modal title="Download audio" subtitle="Choose how to save music on your device." onClose={onClose} wide>
      <div className="download-intro"><span className="download-orb"><Download size={23} /></span><div><strong>Download directly on Android</strong><p>The Android app downloads and converts on your phone. No computer or paid service is needed.</p></div></div>
      <a className="primary-button full-button installer-link" href="/android" target="_blank" rel="noreferrer"><Download size={18} />Get the Android app</a>
      <p className="download-footnote">Android 10+ · 64-bit phones. Sign in to your Vercel account to get the private installer. Your web library stays here; import audio files to move it into the Android app.</p>
      <div className="privacy-note"><HardDrive size={18} /><span><strong>On iPhone or using existing files?</strong> Import your audio to listen offline, make playlists, and keep your library on this device.</span></div>
      <button className="secondary-button full-button" onClick={onImport}><Upload size={18} />Import audio files</button>
      <p className="download-footnote">YouTube currently refuses downloads from this website’s hosting connection. Automatic YouTube downloads are available in the Android app.</p>
    </Modal>
  );
  return (
    <Modal title="Download audio" subtitle="Save audio you own or have permission to download for offline listening." onClose={onClose} wide>
      <div className={`download-intro ${track ? 'selected-track' : ''}`}>
        {track ? <Cover track={track} size="small" /> : <span className="download-orb"><Download size={23} /></span>}
        <div><strong>{track?.title || 'YouTube to audio'}</strong><p>{track ? `${track.artist || 'YouTube'} · Ready to convert and store on this device.` : isNativeAndroid() ? 'Download and convert on your phone. No computer or paid service needed.' : 'Paste a video URL. The converted file is stored only in this browser on this device.'}</p></div>
      </div>
      <label className="field-label" htmlFor="youtube-download-url">YouTube video or playlist URL</label>
      <input id="youtube-download-url" className="text-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtu.be/…" inputMode="url" autoFocus disabled={downloading} />
      {playlistUrl && <p className="playlist-hint"><ListMusic size={15} />Playlist detected. Tracks download one at a time and will be added to a Sonora playlist.</p>}
      <label className="field-label" htmlFor="youtube-download-format">Audio format</label>
      <select id="youtube-download-format" className="text-input select-input" value={format} onChange={(event) => setFormat(event.target.value)} disabled={downloading}><option value="mp3">MP3 · widest compatibility</option><option value="m4a">M4A · efficient quality</option><option value="opus">Opus · smallest file</option></select>
      <label className="consent-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={downloading} /><span>I have the right to download this content and will use it in accordance with YouTube’s terms.</span></label>
      {track && !playlistUrl && <label className="consent-check playlist-after-download"><input type="checkbox" checked={addAfterDownload} onChange={(event) => setAddAfterDownload(event.target.checked)} disabled={downloading} /><span>Choose a playlist after the download finishes.</span></label>}
      <label className="consent-check playlist-after-download"><input type="checkbox" checked={keepBackup} onChange={(event) => setKeepBackup(event.target.checked)} disabled={downloading} /><span>Also keep a recovery copy in Downloads/Files{playlistUrl ? ' for each track' : ''}.</span></label>
      {task && <section className={`download-progress-card ${task.stage}`} aria-live="polite">
        <div className="download-progress-head"><span>{downloading && <LoaderCircle className="spin" size={16} />}{!downloading && (task.stage === 'partial' || task.stage === 'error') && <AlertCircle size={16} />}{!downloading && task.stage === 'complete' && <Check size={16} />}{stageLabel}</span><strong>{task.total ? `${task.saved || 0} saved · ${task.total} total` : ''}</strong></div>
        <div className={`download-progress-track ${indeterminate ? 'indeterminate' : ''}`} role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : percent} aria-valuetext={stageLabel}><span style={{ width: `${percent}%` }} /></div>
        <p>{task.message || task.currentTitle || (task.total ? `${task.completed || 0} tracks saved to this device.` : 'Preparing your download…')}</p>
        {task.failed?.length > 0 && <div className="download-errors" role="alert">{task.failed.map((failure, index) => <p key={index}><strong>{failure.title}</strong><br />{failure.message}</p>)}<p>Retry to continue. Already saved tracks are skipped.</p></div>}
        {task.limited && <p>Only the first 100 available playlist tracks are included.</p>}
      </section>}
      {downloading ? <button className="secondary-button full-button" onClick={onCancel}><X size={17} />Cancel download</button> : <button className="primary-button full-button" disabled={!canSubmit} onClick={() => onDownload({ url: url.trim(), format, track, addAfterDownload, keepBackup })}><Download size={17} />{task && ['partial', 'error', 'cancelled'].includes(task.stage) ? 'Retry download' : playlistUrl ? 'Download playlist' : 'Convert and save to device'}</button>}
      <p className="download-footnote">Videos up to 30 minutes · {isNativeAndroid() ? 'Your current track keeps downloading when you switch apps. Reopen Sonora to finish saving and continue a playlist.' : 'Keep this tab open while saving.'} You can close this dialog and keep browsing Sonora.</p>
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

function TrackActionsModal({
  track, stored, active, playlist, canMoveUp, canMoveDown, onClose, onPlay, onPlayNext,
  onQueue, onFavorite, onAdd, onDownload, onRemoveFromPlaylist, onMove, onDelete
}) {
  return (
    <Modal title="Track options" subtitle="Choose what happens next." onClose={onClose}>
      <div className="action-track-summary"><Cover track={track} size="small" /><div><strong>{track.title}</strong><span>{track.artist || 'Unknown artist'}</span></div></div>
      <div className="track-action-grid">
        <button onClick={onPlay}><span><Play size={18} fill="currentColor" /></span><div><strong>{active ? 'Restart track' : 'Play now'}</strong><small>Start this song immediately</small></div></button>
        <button onClick={onPlayNext}><span><ListEnd size={18} /></span><div><strong>Play next</strong><small>Put it after the current song</small></div></button>
        <button onClick={onQueue}><span><ListMusic size={18} /></span><div><strong>Add to queue</strong><small>Play it later in this session</small></div></button>
        <button onClick={onAdd}><span><ListPlus size={18} /></span><div><strong>Add to playlist</strong><small>Save it in a collection</small></div></button>
        <button onClick={onFavorite}><span><Heart size={18} fill={stored?.favorite ? 'currentColor' : 'none'} /></span><div><strong>{stored?.favorite ? 'Remove from liked songs' : 'Add to liked songs'}</strong><small>Update your favorites</small></div></button>
        {onDownload && <button onClick={onDownload}><span><DownloadCloud size={18} /></span><div><strong>{track.source === 'youtube' ? 'Download audio' : 'Save offline'}</strong><small>Keep a copy on this device</small></div></button>}
      </div>
      {playlist && <div className="playlist-track-actions">
        <p>In “{playlist.name}”</p>
        <div><button disabled={!canMoveUp} onClick={() => onMove(-1)}><ArrowUp size={16} />Move up</button><button disabled={!canMoveDown} onClick={() => onMove(1)}><ArrowDown size={16} />Move down</button></div>
        <button className="danger-action" onClick={onRemoveFromPlaylist}><X size={16} />Remove from this playlist</button>
      </div>}
      {stored && <button className="danger-action library-danger" onClick={onDelete}><Trash2 size={16} />Remove from library</button>}
    </Modal>
  );
}

function MobileNowPlaying({
  track, playing, progress, duration, volume, muted, shuffle, repeat, queue, currentQueueIndex,
  onClose, onTogglePlay, onPrevious, onNext, onSeek, onVolume, onMute, onShuffle, onRepeat,
  onFavorite, onAdd, onMore, onOpenQueue, onSelectQueueTrack
}) {
  const upcoming = queue.slice(Math.max(0, currentQueueIndex + 1), Math.max(0, currentQueueIndex + 1) + 3);
  const repeatLabel = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off';
  return (
    <section className="mobile-now-playing" role="dialog" aria-modal="true" aria-label={`Now playing ${track.title}`}>
      <header className="mobile-player-header"><button className="icon-button" onClick={onClose} aria-label="Close now playing"><ChevronDown size={25} /></button><span>Now playing</span><button className="icon-button" onClick={onMore} aria-label="Track options"><MoreHorizontal size={22} /></button></header>
      <div className="mobile-player-scroll">
        <div className="mobile-player-art"><Cover track={track} size="hero" /></div>
        <div className="mobile-player-meta"><div><h2>{track.title}</h2><p>{track.artist || 'Unknown artist'}{track.album ? ` · ${track.album}` : ''}</p></div><button className={`icon-button mobile-favorite ${track.favorite ? 'selected' : ''}`} onClick={onFavorite} aria-label={track.favorite ? 'Remove from favorites' : 'Add to favorites'}><Heart size={24} fill={track.favorite ? 'currentColor' : 'none'} /></button></div>
        <div className="mobile-seek"><input aria-label="Track position" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(progress, duration || 0)} onChange={(event) => onSeek(Number(event.target.value))} style={{ '--progress': `${duration ? progress / duration * 100 : 0}%` }} /><div><span>{formatTime(progress)}</span><span>-{formatTime(Math.max(0, duration - progress))}</span></div></div>
        <div className="mobile-primary-controls">
          <button className={shuffle ? 'control-active' : ''} onClick={onShuffle} aria-label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'} aria-pressed={shuffle}><Shuffle size={21} /></button>
          <button onClick={onPrevious} aria-label="Previous track"><SkipBack size={29} fill="currentColor" /></button>
          <button className="mobile-main-play" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}</button>
          <button onClick={onNext} aria-label="Next track"><SkipForward size={29} fill="currentColor" /></button>
          <button className={repeat !== 'off' ? 'control-active repeat-button' : 'repeat-button'} onClick={onRepeat} aria-label={repeatLabel}><Repeat2 size={21} />{repeat === 'one' && <sup>1</sup>}</button>
        </div>
        <div className="mobile-player-tools">
          <button onClick={onOpenQueue}><ListMusic size={19} /><span>Queue</span><small>{queue.length}</small></button>
          <button onClick={onAdd}><ListPlus size={19} /><span>Playlist</span></button>
          <button onClick={onMore}><SlidersHorizontal size={19} /><span>Options</span></button>
        </div>
        <div className="mobile-volume"><button className="icon-button" onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'}>{muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</button><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => onVolume(Number(event.target.value))} style={{ '--progress': `${volume * 100}%` }} /></div>
        <section className="mobile-up-next"><div className="mobile-up-next-head"><div><p className="eyebrow">UP NEXT</p><h3>{upcoming.length ? `${upcoming.length} coming up` : 'End of queue'}</h3></div><button onClick={onOpenQueue}>View queue <ChevronRight size={16} /></button></div>{upcoming.map((item, index) => <button className="mobile-up-next-row" key={`${item.id}-${index}`} onClick={() => onSelectQueueTrack(item)}><Cover track={item} size="tiny" /><span><strong>{item.title}</strong><small>{item.artist || 'Unknown artist'}</small></span><Play size={16} fill="currentColor" /></button>)}</section>
      </div>
    </section>
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
          <p>{isNativeAndroid() ? 'Search directly from your Android device. No API key or account is needed.' : "Search mainstream music through Sonora's protected server connection. YouTube API credentials are never sent to the browser."}</p>
          {!youtubeServerManaged && <input className="text-input" value={youtubeKey} onChange={(event) => setYoutubeKey(event.target.value)} placeholder="Server connection is not configured" disabled />}
          <small className="policy-links">Uses <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</small>
          {isNativeAndroid() && <small className="policy-links"><a href="/licenses.html" target="_blank" rel="noreferrer">Open-source components</a></small>}
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
          <p>{storage ? `${formatBytes(used)} used by ${isNativeAndroid() ? 'Sonora' : 'this browser'} · ${formatBytes(quota)} storage quota` : 'Storage details are not available on this device.'}</p>
          {quota > 0 && <div className="storage-bar"><span style={{ width: `${Math.max(2, used / quota * 100)}%` }} /></div>}
          {isNativeAndroid() ? <small className="policy-links">Sonora {appPackage.version} for Android. Keep recovery copies of music you want to preserve. Uninstalling Sonora removes its private library.</small> : !storage?.persisted && <small className="policy-links">Install Sonora to your home screen and use it regularly to improve the chance that your browser grants persistent storage.</small>}
        </div>
      </div>
      <button className="primary-button full-button" onClick={() => onSave({ clientId: clientId.trim(), youtubeKey: youtubeKey.trim() })}><Check size={17} />Save settings</button>
    </Modal>
  );
}

function App({ hosted = false } = {}) {
  const nativeAndroid = isNativeAndroid();
  const audioRef = useRef(null);
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    return () => { audio.pause(); audio.removeAttribute('src'); audio.load(); audioRef.current = null; };
  }, []);
  const fileInputRef = useRef();
  const importingRef = useRef(false);
  const searchInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const youtubePlayerRef = useRef(null);
  const searchTimerRef = useRef();
  const youtubeSearchAbortRef = useRef(null);
  const youtubeDownloadAbortRef = useRef(null);
  const restoredDownloadRef = useRef(false);
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [view, setView] = useState('home');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [current, setCurrent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [nativePlaybackStatus, setNativePlaybackStatus] = useState('');
  const [nativePlaybackError, setNativePlaybackError] = useState('');
  const nativePrepareRef = useRef(null);
  const nativeTracksRef = useRef(new Map());
  const nativeStateRef = useRef(null);
  const nativeErrorRef = useRef('');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [catalogSource, setCatalogSource] = useState('youtube');
  const [arabicArtist, setArabicArtist] = useState(ARABIC_CLASSICS_ARTISTS[0]);
  const [repeat, setRepeat] = useState('off');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(60);
  useEffect(() => { setVisibleCount(60); }, [view, search, selectedPlaylist?.id]);
  const [youtubeKey, setYoutubeKey] = useState(ENV_CONFIG.youtubeKey);
  const [catalogTracks, setCatalogTracks] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [clientId, setClientId] = useState(ENV_CONFIG.jamendoClientId);
  const [storage, setStorage] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [importProgress, setImportProgress] = useState(null);
  const [online, setOnline] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [modal, setModal] = useState(null);
  const [importing, setImporting] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [youtubeTask, setYoutubeTask] = useState(null);
  const youtubeDownloading = Boolean(youtubeTask?.active);

  useEffect(() => {
    if (!nativeAndroid) return;
    const listener = onNativeDownloadCancelled(() => youtubeDownloadAbortRef.current?.abort());
    return () => { void listener.then(subscription => subscription.remove()).catch(() => {}); };
  }, [nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid || libraryLoading || libraryError || restoredDownloadRef.current) return;
    restoredDownloadRef.current = true;
    void Promise.all([getSetting('androidDownloadRequest', null), pendingNativeDownload()]).then(async ([request, pending]) => {
      if (youtubeDownloadAbortRef.current) return;
      if (!request && pending.job) request = { url: pending.job.url, format: pending.job.format, keepBackup: true };
      if (!request) return;
      if (pending.job && !isYoutubePlaylistUrl(request.url) && tracks.some(track => track.externalId === getYoutubeVideoId(request.url) && track.fileName?.endsWith(`.${request.format}`))) {
        await releaseNativeDownload(pending.job.id);
        await setSetting('androidDownloadRequest', null);
        return;
      }
      setYoutubeTask({ request, nativeJobId: pending.job?.id, active: false, stage: 'partial', saved: 0, failed: [],
        message: pending.job ? 'Your download is kept. Open Details and retry to finish saving.' : 'A previous download was interrupted. Retry to continue; saved tracks are kept.' });
    }).catch(() => {});
  }, [nativeAndroid, libraryLoading, libraryError, tracks]);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    const back = () => {
      if (modal) setModal(null);
      else if (nowPlayingOpen) setNowPlayingOpen(false);
      else if (queueOpen) setQueueOpen(false);
      else if (mobileMenu) setMobileMenu(false);
      else if (view !== 'home') { setView('home'); setSearch(''); }
      else if (youtubeDownloading) setModal({ type: 'youtube-download' });
      else void minimizeAndroid();
    };
    window.addEventListener('sonora:back', back);
    return () => window.removeEventListener('sonora:back', back);
  }, [modal, nowPlayingOpen, queueOpen, mobileMenu, view, youtubeDownloading]);


  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), type === 'error' ? 7000 : 3200);
  }, []);

  const playerCommand = useCallback((method, options) => {
    return nativePlayer.bridge[method](options).catch(error => {
      notify(error.message || 'Playback could not be updated. Please retry.', 'error');
    });
  }, [notify]);

  useEffect(() => {
    nativeTracksRef.current = new Map([...queue, ...catalogTracks, ...tracks].map(track => [track.id, track]));
    if (nativeAndroid) setCurrent(previous => {
      const stored = previous && tracks.find(track => track.id === previous.id);
      return stored ? { ...previous, ...stored } : previous;
    });
  }, [tracks, catalogTracks, queue, nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid) return;
    let disposed = false;
    const update = state => {
      if (disposed || !state) return;
      nativeStateRef.current = state;
      const items = Array.isArray(state.items) ? state.items : [];
      const restored = items.map(item => ({ ...item, ...(nativeTracksRef.current.get(item.id) || {}), audio: item.uri || undefined }));
      setQueue(previous => previous.length === restored.length && previous.every((track, index) => track.id === restored[index].id) ? previous : restored);
      const active = restored.find(track => track.id === state.currentId);
      setCurrent(previous => active ? previous?.id === active.id ? previous : active : null);
      setPlaying(Boolean(state.playing));
      setProgress(Number(state.position) || 0);
      setDuration(Number(state.duration) || active?.duration || 0);
      if (state.repeat) setRepeat(state.repeat);
      if (typeof state.shuffle === 'boolean') setShuffle(state.shuffle);
      if (typeof state.volume === 'number') setVolume(state.volume);
      if (typeof state.muted === 'boolean') setMuted(state.muted);
      if (!nativePrepareRef.current) setNativePlaybackStatus(state.buffering ? 'Buffering audio…' : '');
      if (state.error && state.error !== nativeErrorRef.current) notify(state.error, 'error');
      nativeErrorRef.current = state.error || '';
      setNativePlaybackError(state.error || '');
    };
    const listener = nativePlayer.bridge.addListener('state', update);
    // Subscribe before reading state so recreation cannot miss a track change.
    void listener.then(() => nativePlayer.bridge.state()).then(update).catch(error => {
      if (!disposed) notify(error.message || 'Could not connect to Android playback.', 'error');
    });
    const resume = () => { void nativePlayer.bridge.state().then(update).catch(() => {}); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      disposed = true;
      nativePrepareRef.current?.abort();
      void listener.then(subscription => subscription.remove()).catch(() => {});
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [nativeAndroid, notify]);

  const startNativeQueue = useCallback(async (list, selectedId, shuffleMode = shuffle) => {
    nativePrepareRef.current?.abort();
    const controller = new AbortController();
    nativePrepareRef.current = controller;
    let unique = [...new Map(list.map(track => [track.id, track])).values()];
    if (unique.length > 500) {
      const selected = Math.max(0, unique.findIndex(track => track.id === selectedId));
      const start = Math.max(0, Math.min(selected, unique.length - 500));
      unique = unique.slice(start, start + 500);
      notify('Playing a queue of 500 tracks around this selection. Search or choose a playlist for a smaller queue.');
    }
    for (const track of unique) nativeTracksRef.current.set(track.id, track);
    const index = Math.max(0, unique.findIndex(track => track.id === selectedId));
    try {
      setNativePlaybackStatus(`Preparing ${unique[index]?.title || 'background playback'}…`);
      const result = await nativePlayer.playQueue(unique, index, {
        signal: controller.signal, options: { repeat, shuffle: shuffleMode, volume, muted },
        onProgress: ({ completed, total }) => setNativePlaybackStatus(`Preparing queue · ${completed} of ${total} ready`)
      });
      if (result.skipped.length) notify(`${result.skipped.length} queue ${result.skipped.length === 1 ? 'track was' : 'tracks were'} unavailable. ${result.skipped[0].message}`, 'error');
    } catch (error) {
      if (!controller.signal.aborted) notify(error.message || 'Could not start this track. Please retry.', 'error');
    } finally {
      if (nativePrepareRef.current === controller) {
        nativePrepareRef.current = null;
        setNativePlaybackStatus(nativeStateRef.current?.buffering ? 'Buffering audio…' : '');
      }
    }
  }, [shuffle, repeat, volume, muted, notify]);

  const togglePlayback = useCallback(() => {
    if (nativeAndroid) {
      void playerCommand(playing ? 'pause' : 'play');
    } else setPlaying(value => !value);
  }, [nativeAndroid, playing, playerCommand]);

  const refreshStorage = useCallback(async () => setStorage(await getStorageEstimate()), []);

  const attempt = (action) => async (...args) => {
    try { return await action(...args); }
    catch (error) { notify(error.name === 'QuotaExceededError' ? 'Device storage is full. Free some space and try again.' : error.message || 'Could not save that change. Please retry.', 'error'); }
  };

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try {
      const [storedTracks, storedPlaylists, storedClientId] = await Promise.all([getTracks(), getPlaylists(), getSetting('jamendoClientId', ENV_CONFIG.jamendoClientId)]);
      setTracks(storedTracks.sort((a, b) => b.addedAt - a.addedAt));
      setPlaylists(storedPlaylists.sort((a, b) => a.createdAt - b.createdAt));
      setClientId(storedClientId);
    } catch { setLibraryError('Your device library could not be opened. Check that site storage is enabled, then retry.'); }
    finally { setLibraryLoading(false); }
  }, []);

  useEffect(() => { loadLibrary(); refreshStorage(); }, [loadLibrary, refreshStorage]);
  useEffect(() => {
    const connectivity = () => setOnline(navigator.onLine);
    const shortcuts = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInputRef.current?.focus(); } };
    connectivity();
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('keydown', shortcuts);
    return () => { window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); window.removeEventListener('keydown', shortcuts); window.clearTimeout(toastTimerRef.current); };
  }, []);

  useEffect(() => () => {
    youtubeSearchAbortRef.current?.abort();
    youtubeDownloadAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!current) { setNowPlayingOpen(false); setQueueOpen(false); }
  }, [current]);

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

  const playNext = useCallback(() => {
    if (nativeAndroid) { void playerCommand('next'); return; }
    if (!queue.length || !current) return;
    const restartCurrent = () => {
      setProgress(0);
      if (current.source === 'youtube' && youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(0, true);
        youtubePlayerRef.current.playVideo();
      } else {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => setPlaying(false));
      }
    };
    if (repeat === 'one') {
      restartCurrent();
      return;
    }
    const currentIndex = queue.findIndex((track) => track.id === current.id);
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) setCurrent(queue[nextIndex]);
    else if (repeat === 'all') {
      if (queue[0]?.id === current.id) restartCurrent();
      else setCurrent(queue[0]);
    }
    else setPlaying(false);
  }, [current, queue, repeat, nativeAndroid, playerCommand]);

  useEffect(() => {
    if (nativeAndroid) return;
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : current?.duration || 0);
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
  }, [current, notify, playNext, nativeAndroid]);

  useEffect(() => {
    const audio = audioRef.current;
    if (nativeAndroid) { audio.pause(); audio.removeAttribute('src'); return; }
    if (!current) { audio.pause(); audio.removeAttribute('src'); audio.load(); return; }
    setProgress(0);
    setDuration(current?.duration || 0);
    if (current.source === 'youtube') {
      audio.pause();
      audio.removeAttribute('src');
    } else {
      youtubePlayerRef.current = null;
      const blob = current.cachedBlob || current.blob;
      const source = blob ? URL.createObjectURL(blob) : current.audio;
      if (!source) { setPlaying(false); return; }
      audio.src = source;
      audio.load();
      return () => { audio.pause(); if (blob) URL.revokeObjectURL(source); };
    }
  }, [current?.id, current?.blob, current?.cachedBlob, current?.audio, current?.source, nativeAndroid]);

  useEffect(() => {
    if (!nativeAndroid && current && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album, artwork: current.cover ? [{ src: current.cover }] : [] });
      } catch { /* Optional platform integration must not interrupt audio. */ }
    }
  }, [current?.title, current?.artist, current?.album, current?.cover, nativeAndroid]);

  useEffect(() => {
    if (nativeAndroid) return;
    const audio = audioRef.current;
    audio.volume = volume;
    audio.muted = muted;
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume * 100);
      if (muted) youtubePlayerRef.current.mute();
      else youtubePlayerRef.current.unMute();
    }
  }, [volume, muted, nativeAndroid]);

  useEffect(() => {
    if (nativeAndroid) return;
    if (!current) return;
    if (current.source === 'youtube') {
      if (!youtubePlayerRef.current) return;
      if (playing) youtubePlayerRef.current.playVideo();
      else youtubePlayerRef.current.pauseVideo();
      return;
    }
    const audio = audioRef.current;
    const source = audio.src;
    if (playing) audio.play().catch((error) => { if (error.name !== 'AbortError' && audio.src === source) { setPlaying(false); notify('Tap play again to start audio.', 'error'); } });
    else audio.pause();
  }, [playing, current?.id, current?.blob, current?.cachedBlob, current?.audio, notify, nativeAndroid]);

  useEffect(() => {
    if (nativeAndroid || current?.source !== 'youtube') return undefined;
    const timer = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player?.getCurrentTime) return;
      try { setProgress(player.getCurrentTime() || 0); setDuration(player.getDuration() || current.duration || 0); } catch { /* Player is being replaced. */ }
    }, 500);
    return () => window.clearInterval(timer);
  }, [current, nativeAndroid]);

  const handleYoutubeReady = (event) => {
    youtubePlayerRef.current = event.target;
    event.target.setVolume(volume * 100);
    if (muted) event.target.mute();
    else event.target.unMute();
    setDuration(event.target.getDuration() || current?.duration || 0);
    if (playing) event.target.playVideo();
  };

  const handleYoutubeState = (event) => {
    if (event.target !== youtubePlayerRef.current) return;
    if (event.data === 1) setPlaying(true);
    else if (event.data === 2) setPlaying(false);
    else if (event.data === 0) playNext();
  };

  const playPrevious = useCallback(() => {
    if (nativeAndroid) { void playerCommand('previous'); return; }
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
  }, [current, queue, repeat, nativeAndroid, playerCommand]);

  const seekTo = useCallback((nextTime) => {
    const safeTime = Math.max(0, Math.min(Number(nextTime) || 0, duration || Number(nextTime) || 0));
    if (nativeAndroid) { void playerCommand('seek', { position: safeTime }); return; }
    if (current?.source === 'youtube') youtubePlayerRef.current?.seekTo(safeTime, true);
    else if (audioRef.current) audioRef.current.currentTime = safeTime;
    setProgress(safeTime);
  }, [current, duration, nativeAndroid, playerCommand]);

  useEffect(() => {
    if (nativeAndroid || !('mediaSession' in navigator)) return;
    const actions = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      nexttrack: playNext,
      previoustrack: playPrevious,
      seekto: (details) => seekTo(details.seekTime),
      seekbackward: (details) => seekTo(progress - (details.seekOffset || 10)),
      seekforward: (details) => seekTo(progress + (details.seekOffset || 10))
    };
    Object.entries(actions).forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Browser does not support this media action. */ }
    });
  }, [playNext, playPrevious, progress, seekTo, nativeAndroid]);

  const playTrack = useCallback((track, list = tracks) => {
    if (nativeAndroid) {
      if (current?.id === track.id) togglePlayback();
      else if (list === queue && queue.some(item => item.id === track.id)) void playerCommand('select', { id: track.id });
      else void startNativeQueue(list.length ? list : [track], track.id);
      return;
    }
    if (current?.id === track.id) { setPlaying((value) => !value); return; }
    const sourceList = list.length ? list : [track];
    setQueue(shuffle ? [track, ...shuffled(sourceList.filter((item) => item.id !== track.id))] : sourceList);
    setCurrent(track);
    setPlaying(true);
  }, [current, shuffle, tracks, nativeAndroid, queue, togglePlayback, playerCommand, startNativeQueue]);

  const startPlayback = useCallback((list, shuffleMode = false) => {
    const available = list.filter(Boolean);
    if (!available.length) return;
    if (nativeAndroid) { void startNativeQueue(available, available[0].id, shuffleMode); return; }
    const nextQueue = shuffleMode ? shuffled(available) : available;
    setShuffle(shuffleMode);
    setQueue(nextQueue);
    setCurrent(nextQueue[0]);
    setPlaying(true);
  }, [nativeAndroid, startNativeQueue]);

  const toggleShuffle = useCallback(() => {
    if (nativeAndroid) { void playerCommand('setOptions', { shuffle: !shuffle }); return; }
    setShuffle((enabled) => {
      const next = !enabled;
      if (next && current) {
        setQueue((items) => {
          const currentIndex = items.findIndex((item) => item.id === current.id);
          if (currentIndex < 0) return [current, ...shuffled(items.filter((item) => item.id !== current.id))];
          return [...items.slice(0, currentIndex + 1), ...shuffled(items.slice(currentIndex + 1))];
        });
      }
      return next;
    });
  }, [current, nativeAndroid, shuffle, playerCommand]);

  const playTrackNext = useCallback((track) => {
    if (!current) { startPlayback([track]); return; }
    if (current.id === track.id) return;
    if (nativeAndroid) {
      nativePrepareRef.current?.abort(); nativePrepareRef.current = null; setNativePlaybackStatus('');
      nativeTracksRef.current.set(track.id, track);
      void nativePlayer.prepare(track).then(item => playerCommand('add', { item, next: true })).then(() => notify('Playing next')).catch(error => notify(error.message, 'error'));
      return;
    }
    setQueue((items) => {
      const base = items.length ? items : [current];
      const withoutTrack = base.filter((item) => item.id !== track.id);
      const currentIndex = withoutTrack.findIndex((item) => item.id === current.id);
      const insertAt = currentIndex < 0 ? 1 : currentIndex + 1;
      return [...withoutTrack.slice(0, insertAt), track, ...withoutTrack.slice(insertAt)];
    });
    notify('Playing next');
  }, [current, notify, startPlayback, nativeAndroid, playerCommand]);

  const addTrackToQueue = useCallback((track) => {
    if (!current) { startPlayback([track]); return; }
    if (nativeAndroid) {
      nativePrepareRef.current?.abort(); nativePrepareRef.current = null; setNativePlaybackStatus('');
      nativeTracksRef.current.set(track.id, track);
      void nativePlayer.prepare(track).then(item => playerCommand('add', { item, next: false })).then(() => notify('Added to queue')).catch(error => notify(error.message, 'error'));
      return;
    }
    setQueue((items) => items.some((item) => item.id === track.id) ? items : [...(items.length ? items : [current]), track]);
    notify('Added to queue');
  }, [current, notify, startPlayback, nativeAndroid, playerCommand]);

  const importFiles = async (files, options = {}) => {
    if (importingRef.current) return [];
    files = [...files].filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|webm|flac)$/i.test(file.name));
    if (!files.length) { notify('No audio files found. Choose MP3, M4A, WAV, OGG, Opus, or FLAC files.', 'error'); return []; }
    importingRef.current = true;
    setImporting(true);
    let imported = 0;
    const importedTracks = [];
    const folderCollections = new Map();
    const importedAt = Date.now();
    let failed = 0;
    try {
      await protectDeviceStorage();
      for (const [index, file] of files.entries()) {
        setImportProgress({ current: index + 1, total: files.length, name: file.name });
        try {
          const [tags, fileDuration] = await Promise.all([readTags(file), readDuration(file)]);
          const cover = await pictureDataUrl(tags.picture);
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
          failed++;
          if (error.name === 'QuotaExceededError') { notify('Device storage is full. Completed imports are kept.', 'error'); break; }
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

      setModal((open) => open?.type === 'upload' ? null : open);
      await refreshStorage();
      notify(folderCollections.size
        ? `${imported} ${imported === 1 ? 'track' : 'tracks'} added and ${folderCollections.size} folder ${folderCollections.size === 1 ? 'playlist was' : 'playlists were'} created`
        : `${imported} ${imported === 1 ? 'track' : 'tracks'} added to your library${failed ? `; ${failed} failed` : ''}`, failed ? 'error' : 'success');
      return importedTracks;
    } catch (error) { notify(`Import stopped. ${imported} saved tracks are kept. ${error.message || 'Try again.'}`, 'error'); return importedTracks; }
    finally { importingRef.current = false; setImporting(false); setImportProgress(null); }
  };

  const toggleFavorite = attempt(async (track) => {
    const stored = tracks.find((item) => item.id === track.id);
    if (!stored) {
      const added = { ...track, favorite: true, addedAt: Date.now() };
      await putTrack(added); setTracks((items) => [added, ...items]);
      setCurrent((item) => item?.id === added.id ? added : item);
      notify('Saved to favorites'); return;
    }
    await updateTrack({ ...stored, favorite: !stored.favorite });
  });

  const deleteTrack = attempt(async (track) => {
    if (!window.confirm(`Remove “${track.title}” from your library?`)) return;
    if (nativeAndroid) {
      nativePrepareRef.current?.abort(); nativePrepareRef.current = null; setNativePlaybackStatus('');
      await nativePlayer.bridge.remove({ id: track.id });
      await nativePlayer.removeFile(track.id);
      nativeTracksRef.current.delete(track.id);
    }
    await removeTrack(track.id);
    setTracks((items) => items.filter((item) => item.id !== track.id));
    setPlaylists((items) => items.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) })));
    setSelectedPlaylist((playlist) => playlist ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) } : playlist);
    setQueue((items) => items.filter((item) => item.id !== track.id));
    if (current?.id === track.id) { setCurrent(null); setPlaying(false); }
    refreshStorage();
    notify('Track removed');
  });

  const saveCatalogTrack = attempt(async (track) => {
    if (tracks.some((item) => item.id === track.id)) { notify('Already in your library'); return; }
    const saved = { ...track, addedAt: Date.now(), favorite: false };
    await putTrack(saved);
    setTracks((items) => [saved, ...items]);
    notify('Saved to your library');
  });

  const saveOffline = async (track) => {
    if (!track.downloadAllowed || !track.downloadUrl) { notify('The artist has not enabled downloads for this track.', 'error'); return; }
    notify('Downloading for offline listening…');
    try {
      const response = await fetch(track.downloadUrl, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error('Download failed');
      const cachedBlob = await response.blob();
      const stored = tracks.find((item) => item.id === track.id) || { ...track, addedAt: Date.now(), favorite: false };
      const updated = { ...stored, cachedBlob };
      await putTrack(updated);
      setTracks((items) => items.some((item) => item.id === track.id) ? items.map((item) => item.id === track.id ? updated : item) : [updated, ...items]);
      refreshStorage();
      notify('Available offline');
    } catch {
      notify('Could not save this track. Check your connection and available device storage, then retry.', 'error');
    }
  };

  const storeYoutubeDownload = async (blob, fileName, metadata = {}) => {
    const track = {
      id: `local-${crypto.randomUUID()}`,
      title: metadata.title || fileName.replace(/\.[^.]+$/, '') || 'YouTube audio',
      artist: metadata.artist || 'YouTube',
      album: metadata.album || 'YouTube downloads',
      duration: metadata.duration || await readDuration(new File([blob], fileName, { type: blob.type || audioMimeType(fileName) })),
      cover: metadata.cover || '',
      blob,
      fileName,
      fileType: blob.type || audioMimeType(fileName),
      source: 'youtube-download',
      folderName: '',
      folderPath: '',
      externalId: metadata.externalId || '',
      shareUrl: metadata.shareUrl || '',
      originalSource: 'youtube',
      favorite: false,
      addedAt: Date.now(),
      lastPlayed: 0
    };
    await putTrack(track);
    setTracks((items) => [track, ...items]);
    return track;
  };

  const downloadYoutubeAudio = async (request) => {
    if (youtubeDownloadAbortRef.current) return;
    const { url, format, addAfterDownload = false, keepBackup = true } = request;
    const track = request.track && getYoutubeVideoId(request.track.shareUrl) === getYoutubeVideoId(url) ? request.track : null;
    const controller = new AbortController();
    youtubeDownloadAbortRef.current = controller;
    const isPlaylist = isYoutubePlaylistUrl(url);
    const failed = [];
    const savedTracks = [];
    let entries = [];
    let playlist = null;
    let savedPlaylist = null;
    const updateTask = (values) => setYoutubeTask((previous) => ({ ...previous, ...values, request, failed: [...failed], saved: savedTracks.length }));
    updateTask({ active: true, nativeJobId: null, stage: 'preparing', total: isPlaylist ? 0 : 1, completed: 0, message: 'Preparing your download…', currentTitle: '', transferLoaded: 0, transferTotal: 0 });
    // Persist each playlist addition, so cancelling or leaving keeps completed work.
    const keepInPlaylist = async (saved) => {
      if (!playlist) return;
      savedPlaylist = savedPlaylist || playlists.find((item) => item.sourceUrl === url) || {
        id: crypto.randomUUID(), name: playlist.title || 'YouTube playlist', sourceUrl: url, trackIds: [], createdAt: Date.now()
      };
      const updated = { ...savedPlaylist, trackIds: [...new Set([...savedPlaylist.trackIds, saved.id])] };
      await putPlaylist(updated);
      savedPlaylist = updated;
      setPlaylists((items) => items.some((item) => item.id === updated.id) ? items.map((item) => item.id === updated.id ? updated : item) : [...items, updated]);
      setSelectedPlaylist((item) => item?.id === updated.id ? updated : item);
    };
    try {
      if (nativeAndroid) await setSetting('androidDownloadRequest', request);
      await protectDeviceStorage();
      controller.signal.throwIfAborted();
      if (isPlaylist) {
        const response = await youtubeRequest(`/api/youtube/playlist?url=${encodeURIComponent(url)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Could not read that playlist.');
        playlist = payload;
        entries = payload.entries || [];
        if (!entries.length) throw new Error('This playlist has no downloadable videos.');
      } else {
        entries = [{ ...(track || {}), externalId: track?.externalId || getYoutubeVideoId(url), shareUrl: url, source: 'youtube' }];
      }
      const existingByVideo = new Map(tracks.filter((item) => item.source === 'youtube-download' && item.externalId && item.fileName?.toLowerCase().endsWith(`.${format}`)).map((item) => [item.externalId, item]));
      for (let index = 0; index < entries.length; index++) {
        controller.signal.throwIfAborted();
        const item = entries[index];
        updateTask({ stage: 'preparing', total: entries.length, completed: index, message: '', currentTitle: item.title || `Track ${index + 1}`, transferLoaded: 0, transferTotal: 0, limited: playlist?.limited });
        try {
          let saved = existingByVideo.get(item.externalId);
          if (!saved) {
            let lastProgress = 0;
            const audio = await fetchYoutubeAudio(item.shareUrl || url, format, controller.signal, (event) => {
              // Avoid re-rendering the entire music library for every network chunk.
              if (event.stage === 'receiving' && event.loaded !== event.total && Date.now() - lastProgress < 200) return;
              lastProgress = Date.now();
              updateTask({ stage: event.stage, message: event.message || '', transferLoaded: event.loaded || 0, transferTotal: event.total || 0 });
            });
            try {
            controller.signal.throwIfAborted();
            const { blob, title: rawTitle } = audio;
            const title = cleanYoutubeTitle(rawTitle);
            const fileName = `${title}.${format}`;
            updateTask({ stage: 'storing', message: '', currentTitle: title, transferLoaded: blob.size, transferTotal: blob.size });
            saved = await storeYoutubeDownload(blob, fileName, { ...item, title });
            existingByVideo.set(item.externalId, saved);
            if (keepBackup) {
              try { if (audio.saveBackup) await audio.saveBackup(); else saveRecoveryCopy(blob, fileName); }
              catch (error) { notify(error.message, 'error'); }
            }
            } finally { await audio.release?.(); }
          }
          savedTracks.push(saved);
          await keepInPlaylist(saved);
          updateTask({ completed: index + 1, currentTitle: `${saved.title} saved`, transferLoaded: 0, transferTotal: 0 });
        } catch (error) {
          if (error.name === 'AbortError') controller.abort(error);
          if (controller.signal.aborted) throw error;
          failed.push({ title: item.title || `Track ${index + 1}`, message: error.message || 'Could not download this track.' });
          updateTask({ completed: index + 1, currentTitle: '', message: error.message });
          if (error.name === 'QuotaExceededError') break;
        }
      }
      await refreshStorage();
      const stage = !savedTracks.length ? 'error' : failed.length ? 'partial' : 'complete';
      if (nativeAndroid && stage === 'complete') await setSetting('androidDownloadRequest', null);
      updateTask({ active: false, stage, total: entries.length, completed: savedTracks.length + failed.length, message: !savedTracks.length && failed.length ? failed[0].message : `${savedTracks.length} ${savedTracks.length === 1 ? 'track' : 'tracks'} saved${savedPlaylist ? ` to “${savedPlaylist.name}”` : ' to your device'}.`, currentTitle: '', transferLoaded: 0, transferTotal: 0 });
      if (!playlist && savedTracks[0] && addAfterDownload) setModal((open) => open?.type === 'youtube-download' ? { type: 'add', track: savedTracks[0] } : open);
      notify(failed.length ? `${savedTracks.length} saved; ${failed.length} failed. Open download details to retry.` : 'Audio saved to your device.', failed.length ? 'error' : 'success');
    } catch (error) {
      const cancelled = controller.signal.aborted;
      if (nativeAndroid && cancelled) await setSetting('androidDownloadRequest', null).catch(() => {});
      updateTask({ active: false, stage: cancelled ? 'cancelled' : 'error', currentTitle: '', message: cancelled ? `${savedTracks.length} saved tracks are safely kept. Retry to continue.` : error.message || 'Could not start the download.' });
      notify(cancelled ? 'Download cancelled. Saved tracks are kept.' : error.message || 'Could not start the download.', 'error');
    } finally {
      youtubeDownloadAbortRef.current = null;
    }
  };

  const cancelYoutubeDownload = () => {
    if (!youtubeDownloadAbortRef.current) return;
    setYoutubeTask((currentTask) => currentTask ? { ...currentTask, stage: 'cancelling', message: 'Stopping after the current network request…' } : currentTask);
    youtubeDownloadAbortRef.current.abort();
  };

  const dismissYoutubeTask = attempt(async () => {
    if (youtubeTask?.nativeJobId) {
      await cancelKeptNativeDownload(youtubeTask.nativeJobId);
      await releaseNativeDownload(youtubeTask.nativeJobId);
    }
    if (nativeAndroid) await setSetting('androidDownloadRequest', null);
    setYoutubeTask(null);
  });

  const createPlaylist = attempt(async (name, trackToAdd = null) => {
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
  });

  const addToPlaylist = attempt(async (playlist, track) => {
    if (playlist.trackIds.includes(track.id)) { notify('This track is already in the playlist', 'error'); return; }
    let savedTrack = tracks.find((item) => item.id === track.id);
    if (!savedTrack) { savedTrack = { ...track, addedAt: Date.now(), favorite: false }; await putTrack(savedTrack); setTracks((items) => [savedTrack, ...items]); }
    const updated = { ...playlist, trackIds: [...playlist.trackIds, track.id] };
    await putPlaylist(updated);
    setPlaylists((items) => items.map((item) => item.id === playlist.id ? updated : item));
    setSelectedPlaylist((item) => item?.id === updated.id ? updated : item);
    setModal(null);
    notify(`Added to ${playlist.name}`);
  });

  const removeFromPlaylist = attempt(async (playlist, track) => {
    const updated = { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) };
    await putPlaylist(updated);
    setPlaylists((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedPlaylist((item) => item?.id === updated.id ? updated : item);
    setModal(null);
    notify(`Removed from ${playlist.name}`);
  });

  const movePlaylistTrack = attempt(async (playlist, track, direction) => {
    const from = playlist.trackIds.indexOf(track.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= playlist.trackIds.length) return;
    const trackIds = [...playlist.trackIds];
    [trackIds[from], trackIds[to]] = [trackIds[to], trackIds[from]];
    const updated = { ...playlist, trackIds };
    await putPlaylist(updated);
    setPlaylists((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelectedPlaylist((item) => item?.id === updated.id ? updated : item);
    setModal((item) => item?.type === 'track-actions' ? { ...item, playlist: updated } : item);
    notify(direction < 0 ? 'Moved up in playlist' : 'Moved down in playlist');
  });

  const deletePlaylist = attempt(async (playlist) => {
    if (!window.confirm(`Delete the playlist “${playlist.name}”? Your music will stay in the library.`)) return;
    await removePlaylist(playlist.id);
    setPlaylists((items) => items.filter((item) => item.id !== playlist.id));
    setView('home'); setSelectedPlaylist(null); notify('Playlist deleted');
  });

  const searchJamendo = useCallback(async (term = '') => {
    if (!clientId) return;
    youtubeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    youtubeSearchAbortRef.current = controller;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const params = new URLSearchParams({ client_id: clientId, format: 'json', limit: '24', audioformat: 'mp32', audiodlformat: 'mp32', include: 'musicinfo+licenses', imagesize: '500' });
      if (term.trim()) params.set('search', term.trim());
      else { params.set('order', 'popularity_week'); params.set('groupby', 'artist_id'); }
      const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
      const data = await response.json();
      if (data.headers?.status !== 'success') throw new Error(data.headers?.error_message || 'Jamendo error');
      if (controller.signal.aborted) return;
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
      if (controller.signal.aborted) return;
      setCatalogError('Could not connect to Jamendo. Check your client ID and connection, then retry.');
      setCatalogTracks([]);
    } finally { if (youtubeSearchAbortRef.current === controller) { youtubeSearchAbortRef.current = null; setCatalogLoading(false); } }
  }, [clientId, notify]);

  const searchYouTube = useCallback(async (term = '') => {
    if (!youtubeKey) return;
    youtubeSearchAbortRef.current?.abort();
    const controller = new AbortController();
    youtubeSearchAbortRef.current = controller;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const params = new URLSearchParams({ region: ENV_CONFIG.youtubeRegion || navigator.language?.split('-')[1]?.toUpperCase() || 'US' });
      if (term.trim()) params.set('q', term.trim());
      const response = await youtubeRequest(`/api/youtube/search?${params}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'YouTube search failed');
      if (!controller.signal.aborted) setCatalogTracks(data.results || []);
    } catch (error) {
      if (controller.signal.aborted) return;
      setCatalogError(error.name === 'TimeoutError' ? 'Search took too long. Please retry.' : error.message || 'Could not connect to YouTube. Please try again.');
      setCatalogTracks([]);
    } finally {
      if (youtubeSearchAbortRef.current === controller) {
        youtubeSearchAbortRef.current = null;
        setCatalogLoading(false);
      }
    }
  }, [youtubeKey, notify]);

  const performSearch = useCallback(() => {
    window.clearTimeout(searchTimerRef.current);
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
    return () => { window.clearTimeout(searchTimerRef.current); youtubeSearchAbortRef.current?.abort(); };
  }, [view, search, catalogSource, clientId, youtubeKey, searchJamendo, searchYouTube]);

  useEffect(() => {
    if (view !== 'arabic' || !youtubeKey) return;
    window.clearTimeout(searchTimerRef.current);
    const query = search.trim() || arabicArtist.query;
    searchTimerRef.current = window.setTimeout(() => searchYouTube(query), 450);
    return () => { window.clearTimeout(searchTimerRef.current); youtubeSearchAbortRef.current?.abort(); };
  }, [view, search, arabicArtist, youtubeKey, searchYouTube]);

  const saveArabicSelection = attempt(async () => {
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
  });

  const saveSettings = attempt(async ({ clientId: nextClientId, youtubeKey: nextYoutubeKey }) => {
    const effectiveClientId = nextClientId || ENV_CONFIG.jamendoClientId;
    await Promise.all([
      setSetting('jamendoClientId', nextClientId === ENV_CONFIG.jamendoClientId ? null : nextClientId || null),
      setSetting('youtubeApiKey', null)
    ]);
    setClientId(effectiveClientId);
    setYoutubeKey(ENV_CONFIG.youtubeKey);
    setModal(null);
    notify('Settings saved');
  });

  const filteredTracks = useMemo(() => {
    const term = search.toLowerCase().trim();
    let list = tracks;
    if (view === 'favorites') list = list.filter((track) => track.favorite);
    if (view === 'offline') list = list.filter((track) => track.blob || track.cachedBlob);
    if (view === 'playlist' && selectedPlaylist) { const byId = new Map(tracks.map((track) => [track.id, track])); list = selectedPlaylist.trackIds.map((id) => byId.get(id)).filter(Boolean); }
    if (term && view !== 'explore') list = list.filter((track) => [track.title, track.artist, track.album].some((value) => value?.toLowerCase().includes(term)));
    return list;
  }, [tracks, search, view, selectedPlaylist]);

  const goTo = (destination, playlist = null) => {
    youtubeSearchAbortRef.current?.abort(); setCatalogError(''); setCatalogTracks([]);
    setView(destination); setSelectedPlaylist(playlist); setSearch(''); setMobileMenu(false);
  };

  const cycleRepeat = () => {
    const next = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
    if (nativeAndroid) void playerCommand('setOptions', { repeat: next });
    else setRepeat(next);
  };
  const changeVolume = value => {
    if (nativeAndroid) void playerCommand('setOptions', { volume: value });
    else setVolume(value);
  };
  const toggleMute = () => {
    if (nativeAndroid) void playerCommand('setOptions', { muted: !muted });
    else setMuted(value => !value);
  };
  const selectQueueTrack = track => {
    if (nativeAndroid) void playerCommand('select', { id: track.id });
    else { setCurrent(track); setPlaying(true); }
  };
  const currentQueueIndex = queue.findIndex((track) => track.id === current?.id);
  const openTrackActions = (track, list = tracks, playlist = null) => setModal({ type: 'track-actions', track, list, playlist });
  const openMobilePlayer = () => {
    if (window.matchMedia('(max-width: 900px)').matches) setNowPlayingOpen(true);
  };
  const openQueue = () => { setNowPlayingOpen(false); setQueueOpen(true); };
  const clearUpcomingQueue = () => {
    if (nativeAndroid) {
      nativePrepareRef.current?.abort(); nativePrepareRef.current = null; setNativePlaybackStatus('');
      void playerCommand('clearUpcoming'); return;
    }
    setQueue(current ? [current] : []);
    notify('Upcoming queue cleared');
  };
  const actionTrack = modal?.type === 'track-actions' ? modal.track : null;
  const actionStoredTrack = actionTrack ? tracks.find((track) => track.id === actionTrack.id) : null;
  const actionPlaylist = modal?.type === 'track-actions' ? modal.playlist : null;
  const actionPlaylistIndex = actionPlaylist && actionTrack ? actionPlaylist.trackIds.indexOf(actionTrack.id) : -1;
  const moreTracks = filteredTracks.length > visibleCount && <div className="load-more">
    <p>{Math.min(visibleCount, filteredTracks.length)} of {filteredTracks.length} tracks</p>
    <button className="secondary-button" onClick={() => setVisibleCount(count => count + 60)}>Show more tracks <ChevronDown size={18} /></button>
  </div>;

  const viewMeta = {
    library: ['Your library', `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'} collected in one place.`],
    favorites: ['Liked songs', 'The tracks you always come back to.'],
    offline: ['Offline music', 'Ready to play anywhere, no connection needed.'],
    playlist: [selectedPlaylist?.name || 'Playlist', `${filteredTracks.length} ${filteredTracks.length === 1 ? 'track' : 'tracks'}`]
  };

  return (
    <div className={`app-shell ${nativeAndroid ? 'native-android' : ''} ${current ? 'has-player' : 'no-player'}`}>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <div className="sidebar-top"><Logo /><button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X size={20} /></button></div>
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
          <p className="app-credit">Made by <strong>Med Gleiguem</strong></p>
        </div>
      </aside>
      {mobileMenu && <button className="nav-scrim" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}

      <main className="main-content" inert={Boolean(modal || mobileMenu || nowPlayingOpen || queueOpen)}>
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={21} /></button>
          <div className="search-box"><Search size={18} /><input ref={searchInputRef} aria-label="Search music" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); performSearch(); } }} placeholder={view === 'explore' ? `Search ${catalogSource === 'youtube' ? 'mainstream' : 'independent'} music…` : view === 'arabic' ? 'Search Arabic classics…' : 'Search your music…'} /><kbd>⌘ K</kbd></div>
            <button className="ghost-button hide-mobile" onClick={() => setModal({ type: 'youtube-download' })}><Download size={17} />Download audio</button><button className="ghost-button hide-mobile" onClick={() => setModal({ type: 'settings' })}><Radio size={17} />{youtubeKey || clientId ? 'Catalog connected' : 'Connect catalog'}</button>
          <button className="primary-button" aria-label="Add music" onClick={() => setModal({ type: 'upload' })}><Upload size={17} /><span className="upload-label">Add music</span></button>
        </header>

        {!online && <div className="connection-banner" role="status"><WifiOff size={16} />You’re offline. Your saved music is ready to play.</div>}
        {libraryError && <div className="connection-banner error" role="alert"><AlertCircle size={18} /><span>{libraryError}</span><button onClick={loadLibrary}>Retry</button></div>}
        {libraryLoading && <div className="connection-banner" role="status"><LoaderCircle className="spin" size={16} />Opening your library…</div>}
        {youtubeTask && modal?.type !== 'youtube-download' && <div className={`task-banner ${youtubeTask.stage}`} role="status">
          {youtubeDownloading ? <LoaderCircle className="spin" size={18} /> : youtubeTask.stage === 'complete' ? <Check size={18} /> : <AlertCircle size={18} />}
          <div><strong>{youtubeDownloading ? 'Saving your music' : youtubeTask.stage === 'complete' ? 'Music saved' : 'Download needs attention'}</strong><span>{youtubeTask.saved || 0} saved{youtubeTask.total ? ` of ${youtubeTask.total}` : ''} · {youtubeTask.message || youtubeTask.currentTitle || 'Preparing…'}</span></div>
          <button onClick={() => setModal({ type: 'youtube-download', track: youtubeTask.request?.track })}>Details</button>
          {!youtubeDownloading && <button className={youtubeTask.nativeJobId ? 'secondary-button' : 'icon-button'} aria-label={youtubeTask.nativeJobId ? 'Cancel kept download' : 'Dismiss download status'} onClick={dismissYoutubeTask}>{youtubeTask.nativeJobId ? 'Cancel' : <X size={16} />}</button>}
        </div>}
        {catalogError && ['explore', 'arabic'].includes(view) && <div className="connection-banner error" role="alert"><AlertCircle size={18} /><span>{catalogError}</span><button onClick={performSearch}>Retry search</button></div>}
        <div className="page-scroll">
          {view === 'home' && (
            <div className="page home-page">
              <section className="welcome-row"><div><p className="eyebrow">{nativeAndroid ? 'SONORA' : 'YOUR PRIVATE MUSIC SPACE'}</p><h1>{nativeAndroid ? 'Your music.' : 'Good to see you.'}</h1><p>{nativeAndroid ? 'Save your favorites. Listen anywhere.' : 'Everything you love, ready when you are.'}</p></div><div className="date-orb"><Headphones size={31} /><span>{tracks.length}</span><small>tracks</small></div></section>
              {search.trim() ? (
                <section className="section-block">
                  <div className="section-title"><div><p className="eyebrow">SEARCH RESULTS</p><h2>{`Matches for “${search}”`}</h2></div><button onClick={() => setSearch('')}>Clear</button></div>
                  {filteredTracks.length ? <div className="card-grid catalog-grid">{filteredTracks.slice(0, visibleCount).map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, filteredTracks)} onMore={() => openTrackActions(track, filteredTracks)} active={current?.id === track.id} playing={playing} />)}</div> : <EmptyState icon={Search} title="No matches yet" text="Try a different artist, title, or album from your library." />}
                  {moreTracks}
                </section>
              ) : !tracks.length ? (
                <section className="onboarding-card">
                  <div className="onboarding-copy"><span className="eyebrow-pill"><Music2 size={16} />YOUR LIBRARY STARTS HERE</span><h2>{nativeAndroid ? <>Save it.<br />Play it anywhere.</> : <>Bring all your music<br />under one roof.</>}</h2><p>{nativeAndroid ? 'Download audio from a YouTube link, or add music from your phone. Your songs stay on this device, ready for offline listening.' : 'Import the songs you already own. Sonora reads their artwork and details, keeps them private, and makes them available offline.'}</p><div className="hero-actions">{nativeAndroid && <button className="primary-button large" onClick={() => setModal({ type: 'youtube-download' })}><Download size={20} />Download audio</button>}<button className={nativeAndroid ? 'secondary-button large' : 'primary-button large'} onClick={() => setModal({ type: 'upload' })}><FolderUp size={18} />Choose music</button>{!nativeAndroid && <button className="secondary-button large" onClick={() => goTo('explore')}><Compass size={18} />Explore music</button>}</div></div>
                  <div className="vinyl-scene"><div className="vinyl"><div className="vinyl-label"><Music2 size={25} /></div></div><div className="vinyl-card"><div className="visualizer">{[17, 29, 22, 40, 31, 48, 25, 36, 19, 44, 28, 38].map((height, i) => <i key={i} style={{ height }} />)}</div><strong>Your soundtrack</strong><span>is waiting</span></div></div>
                </section>
              ) : (
                <>
                  <section className="quick-grid">
                    <button onClick={() => goTo('favorites')}><span className="quick-icon liked"><Heart size={22} fill="currentColor" /></span><div><strong>Liked songs</strong><small>{tracks.filter((track) => track.favorite).length} tracks</small></div><Play size={18} fill="currentColor" /></button>
                    <button onClick={() => goTo('offline')}><span className="quick-icon offline"><Download size={22} /></span><div><strong>Offline</strong><small>{tracks.filter((track) => track.blob || track.cachedBlob).length} tracks</small></div><Play size={18} fill="currentColor" /></button>
                    {playlists.slice(0, 2).map((playlist) => <button key={playlist.id} onClick={() => goTo('playlist', playlist)}><span className="quick-icon" style={{ background: artworkGradient(playlist.id) }}><ListMusic size={22} /></span><div><strong>{playlist.name}</strong><small>{playlist.trackIds.length} tracks</small></div><Play size={18} fill="currentColor" /></button>)}
                  </section>
                  <section className="section-block"><div className="section-title"><div><p className="eyebrow">BACK IN ROTATION</p><h2>Recently added</h2></div><button onClick={() => goTo('library')}>See all <ChevronRight size={16} /></button></div><div className="card-grid">{tracks.slice(0, 6).map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, tracks)} onMore={() => openTrackActions(track, tracks)} active={current?.id === track.id} playing={playing} />)}</div></section>
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
                <section className="section-block"><div className="section-title"><div><p className="eyebrow">{search ? 'SEARCH RESULTS' : 'TRENDING NOW'}</p><h2>{search ? `Songs for “${search}”` : catalogSource === 'youtube' ? 'Popular music in your region' : 'Fresh from independent artists'}</h2></div></div>{catalogTracks.length ? <div className="card-grid catalog-grid">{catalogTracks.map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, catalogTracks)} onSave={() => saveCatalogTrack(track)} onAdd={() => setModal({ type: 'add', track })} onDownload={track.source === 'youtube' ? () => setModal({ type: 'youtube-download', track }) : undefined} onMore={() => openTrackActions(track, catalogTracks)} saved={tracks.some((item) => item.id === track.id)} active={current?.id === track.id} playing={playing} />)}</div> : <EmptyState icon={Search} title="No tracks found" text="Try another artist, track, genre, or mood." />}</section>
              )}
              <p className="catalog-legal">{catalogSource === 'youtube' ? <>{nativeAndroid ? 'Online playback needs an internet connection. Some YouTube connections may be refused.' : 'Streaming uses the official visible YouTube player.'} The audio download tool is only for content you own or have permission to save, subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</> : 'Offline download is shown only when the Jamendo artist has enabled it.'}</p>
            </div>
          )}

          {view === 'arabic' && (
            <div className="page arabic-page">
              <section className="arabic-hero">
                <div><p className="eyebrow">CURATED ARABIC CLASSICS · POWERED BY YOUTUBE</p><h1 dir="rtl">أغاني الزمن الجميل</h1><p>Rediscover the voices that shaped Arabic music. {nativeAndroid ? 'Choose an artist and collect favorites in your own Sonora playlists.' : 'Choose an artist, play through the official YouTube player, and collect favorites in your own Sonora playlists.'}</p></div>
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
                  {catalogTracks.length ? <div className="card-grid catalog-grid">{catalogTracks.map((track) => <TrackCard key={track.id} track={track} onPlay={() => playTrack(track, catalogTracks)} onSave={() => saveCatalogTrack(track)} onAdd={() => setModal({ type: 'add', track })} onDownload={() => setModal({ type: 'youtube-download', track })} onMore={() => openTrackActions(track, catalogTracks)} saved={tracks.some((item) => item.id === track.id)} active={current?.id === track.id} playing={playing} />)}</div> : <EmptyState icon={Search} title="No classics found" text="Try another artist or search in Arabic or English." />}
                </section>
              )}
              <p className="catalog-legal">{nativeAndroid ? 'Online playback needs an internet connection. Some YouTube connections may be refused.' : 'Streaming uses the official visible YouTube player.'} Download audio only when you own the content or have permission to save it, subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</p>
            </div>
          )}

          {['library', 'favorites', 'offline', 'playlist'].includes(view) && (
            <div className="page collection-page">
              <section className="collection-header">
                <div className="collection-art" style={{ background: view === 'favorites' ? 'linear-gradient(145deg,#cf63ff,#6532d4)' : view === 'offline' ? 'linear-gradient(145deg,#b8f34a,#348d53)' : artworkGradient(selectedPlaylist?.id || view) }}>{view === 'favorites' ? <Heart size={42} fill="currentColor" /> : view === 'offline' ? <Download size={42} /> : view === 'playlist' ? <ListMusic size={42} /> : <Library size={42} />}</div>
                <div><p className="eyebrow">{view === 'playlist' ? 'PLAYLIST' : 'COLLECTION'}</p><h1>{viewMeta[view]?.[0]}</h1><p>{viewMeta[view]?.[1]}</p><div className="collection-actions"><button className="collection-play-button primary" disabled={!filteredTracks.length} onClick={() => startPlayback(filteredTracks, false)}><Play size={18} fill="currentColor" /><span>Play in order</span></button><button className="collection-play-button" disabled={!filteredTracks.length} onClick={() => startPlayback(filteredTracks, true)}><Shuffle size={17} /><span>Shuffle</span></button><button className={`collection-play-button ${repeat !== 'off' ? 'active' : ''}`} onClick={cycleRepeat}><Repeat2 size={17} /><span>{repeat === 'one' ? 'Repeat one' : repeat === 'all' ? view === 'playlist' ? 'Repeat playlist' : 'Repeat collection' : 'No repeat'}</span></button>{view === 'playlist' && <button className="icon-button bordered playlist-delete" onClick={() => deletePlaylist(selectedPlaylist)} aria-label="Delete playlist"><Trash2 size={18} /></button>}</div></div>
              </section>
              {filteredTracks.length ? (
                <section className="track-table"><div className="track-table-head"><span>#</span><span>Title</span><span>Album</span><span>Availability</span><span /><span><Clock3 size={15} /></span><span /></div>{filteredTracks.slice(0, visibleCount).map((track, index) => <TrackRow key={track.id} track={track} index={index} active={current?.id === track.id} playing={playing} onPlay={() => playTrack(track, filteredTracks)} onFavorite={() => toggleFavorite(track)} onDownload={() => saveOffline(track)} onAdd={() => setModal({ type: 'add', track })} onDelete={() => deleteTrack(track)} onMore={() => openTrackActions(track, filteredTracks, view === 'playlist' ? selectedPlaylist : null)} />)}{moreTracks}</section>
              ) : (
                <EmptyState icon={view === 'favorites' ? Heart : view === 'offline' ? Download : Music2} title={search ? 'No matching music' : `No ${view === 'library' ? 'music' : view === 'playlist' ? 'tracks here' : view} yet`} text={search ? 'Try a different title, artist, or album.' : view === 'favorites' ? 'Tap the heart beside any track to keep it here.' : view === 'offline' ? 'Imported music is offline automatically. Artist-approved Jamendo downloads appear here too.' : 'Add audio files from this device to begin your collection.'} action={view === 'library' ? () => setModal({ type: 'upload' }) : null} actionLabel="Add music" />
              )}
            </div>
          )}
        </div>

      {!nativeAndroid && current?.source === 'youtube' && (
        <section className="youtube-dock" aria-label="YouTube video player">
          <div className="youtube-dock-head"><span><Play size={14} fill="currentColor" />Playing on YouTube</span><div><a href={current.shareUrl} target="_blank" rel="noreferrer">Open YouTube</a><button className="icon-button" aria-label="Close YouTube player" onClick={() => { setPlaying(false); setCurrent(null); }}><X size={17} /></button></div></div>
          <div className="youtube-frame">
            <YouTube key={current.externalId} videoId={current.externalId} opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin } }} onReady={handleYoutubeReady} onStateChange={handleYoutubeState} onError={() => { setPlaying(false); notify('YouTube could not play this video. Try another result.', 'error'); }} />
          </div>
        </section>
      )}
      </main>

      {nativeAndroid && (nativePlaybackStatus || nativePlaybackError) && <div className="native-playback-status" role={nativePlaybackError ? 'alert' : 'status'}>{nativePlaybackError ? <AlertCircle size={18} /> : <LoaderCircle size={18} className="spin" />}<span>{nativePlaybackError || nativePlaybackStatus}{nativePlaybackError && current?.source === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(current.externalId || '') && <> <a href={`https://www.youtube.com/watch?v=${current.externalId}`} target="_blank" rel="noreferrer">Open video</a></>}</span>{nativePlaybackError ? <button className="secondary-button" onClick={() => playerCommand('play')}>Retry playback</button> : nativePrepareRef.current && <button className="secondary-button" onClick={() => { nativePrepareRef.current?.abort(); nativePrepareRef.current = null; setNativePlaybackStatus(''); }}>Stop preparing</button>}</div>}

      {current && (
        <footer className="player-bar">
          <div className="now-playing"><button className="now-playing-summary" onClick={openMobilePlayer} aria-label={`Open now playing: ${current.title}`}><Cover track={current} size="player" /><span className="now-playing-copy"><strong>{current.title}</strong><small>{current.artist || 'Unknown artist'}</small></span></button><button className={`icon-button subtle favorite ${current.favorite ? 'selected' : ''}`} onClick={() => toggleFavorite(current)} aria-label={current.favorite ? 'Remove from favorites' : 'Add to favorites'}><Heart size={17} fill={current.favorite ? 'currentColor' : 'none'} /></button></div>
          <div className="player-center"><div className="player-controls"><button className={`icon-button ${shuffle ? 'control-active' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}><Shuffle size={17} /></button><button className="icon-button" onClick={playPrevious} aria-label="Previous"><SkipBack size={19} fill="currentColor" /></button><button className="main-play" onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><button className="icon-button" onClick={playNext} aria-label="Next"><SkipForward size={19} fill="currentColor" /></button><button className={`icon-button repeat-button ${repeat !== 'off' ? 'control-active' : ''}`} onClick={cycleRepeat} aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}><Repeat2 size={17} />{repeat === 'one' && <sup>1</sup>}</button></div><div className="progress-row"><span>{formatTime(progress)}</span><input aria-label="Track position" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(progress, duration || 0)} onChange={(event) => seekTo(Number(event.target.value))} style={{ '--progress': `${duration ? progress / duration * 100 : 0}%` }} /><span>{formatTime(duration)}</span></div></div>
          <div className="player-right"><button className={`icon-button ${queueOpen ? 'control-active' : ''}`} onClick={() => setQueueOpen(!queueOpen)}><ListMusic size={18} /></button><button className="icon-button" onClick={toggleMute}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><input className="volume-slider" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} style={{ '--progress': `${volume * 100}%` }} /></div>
        </footer>
      )}

      {nowPlayingOpen && current && <MobileNowPlaying track={current} playing={playing} progress={progress} duration={duration} volume={volume} muted={muted} shuffle={shuffle} repeat={repeat} queue={queue} currentQueueIndex={currentQueueIndex} onClose={() => setNowPlayingOpen(false)} onTogglePlay={togglePlayback} onPrevious={playPrevious} onNext={playNext} onSeek={seekTo} onVolume={changeVolume} onMute={toggleMute} onShuffle={toggleShuffle} onRepeat={cycleRepeat} onFavorite={() => toggleFavorite(current)} onAdd={() => { setNowPlayingOpen(false); setModal({ type: 'add', track: current }); }} onMore={() => { setNowPlayingOpen(false); openTrackActions(current, queue.length ? queue : [current], selectedPlaylist?.trackIds.includes(current.id) ? selectedPlaylist : null); }} onOpenQueue={openQueue} onSelectQueueTrack={selectQueueTrack} />}

      {queueOpen && <><button className="queue-backdrop" onClick={() => setQueueOpen(false)} aria-label="Close queue" /><aside className="queue-drawer"><div className="queue-header"><div><p className="eyebrow">PLAY SESSION</p><h2>Queue</h2><span>{currentQueueIndex >= 0 ? `${currentQueueIndex + 1} of ${queue.length}` : `${queue.length} tracks`}</span></div><div>{queue.length > 1 && <button className="queue-clear" onClick={clearUpcomingQueue}>Clear upcoming</button>}<button className="icon-button" onClick={() => setQueueOpen(false)} aria-label="Close queue"><X size={19} /></button></div></div><div className="queue-list">{queue.map((track, index) => <button className={track.id === current?.id ? 'current' : ''} key={`${track.id}-${index}`} onClick={() => selectQueueTrack(track)}><span className="queue-position">{track.id === current?.id && playing ? <Pause size={14} fill="currentColor" /> : index + 1}</span><Cover track={track} size="tiny" /><span><strong>{track.title}</strong><small>{track.artist || 'Unknown artist'}</small></span>{track.id === current?.id ? <span className="queue-playing">Playing</span> : <Play size={15} fill="currentColor" />}</button>)}</div>{!queue.length && <p className="queue-empty">Choose a track to start a queue.</p>}</aside></>}

      <nav className="mobile-nav"><button className={view === 'home' ? 'active' : ''} onClick={() => goTo('home')}><Home size={20} /><span>Home</span></button><button className={view === 'explore' || view === 'arabic' ? 'active' : ''} onClick={() => goTo(view === 'arabic' ? 'arabic' : 'explore')}><Compass size={20} /><span>{view === 'arabic' ? 'Classics' : 'Explore'}</span></button><button onClick={() => setModal({ type: 'youtube-download' })}><Download size={20} /><span>Download</span></button><button className={view === 'library' ? 'active' : ''} onClick={() => goTo('library')}><Library size={20} /><span>Library</span></button><small className="app-credit">Made by <strong>Med Gleiguem</strong></small></nav>

      {modal?.type === 'upload' && <UploadModal onClose={() => !importing && setModal(null)} onFiles={importFiles} onFolder={(files) => importFiles(files, { folderImport: true })} importing={importing} progress={importProgress} />}
      {modal?.type === 'youtube-download' && <YoutubeDownloadModal hosted={hosted} onImport={() => setModal({ type: 'upload' })} onClose={() => setModal(null)} onCancel={cancelYoutubeDownload} onDownload={downloadYoutubeAudio} task={youtubeTask} track={youtubeDownloading ? youtubeTask.request?.track : modal.track} />}
      {modal?.type === 'playlist' && <PlaylistModal onClose={() => setModal(null)} onCreate={createPlaylist} />}
      {modal?.type === 'add' && <AddToPlaylistModal track={modal.track} playlists={playlists} onClose={() => setModal(null)} onAdd={(playlist) => addToPlaylist(playlist, modal.track)} onNew={() => setModal({ type: 'playlistWithTrack', track: modal.track })} />}
      {modal?.type === 'playlistWithTrack' && <PlaylistModal onClose={() => setModal(null)} onCreate={(name) => createPlaylist(name, modal.track)} />}
      {modal?.type === 'track-actions' && actionTrack && <TrackActionsModal track={actionTrack} stored={actionStoredTrack} active={current?.id === actionTrack.id} playlist={actionPlaylist} canMoveUp={actionPlaylistIndex > 0} canMoveDown={actionPlaylistIndex >= 0 && actionPlaylistIndex < actionPlaylist.trackIds.length - 1} onClose={() => setModal(null)} onPlay={() => { if (current?.id === actionTrack.id) { seekTo(0); if (nativeAndroid) void playerCommand('play'); else setPlaying(true); } else playTrack(actionTrack, modal.list || [actionTrack]); setModal(null); }} onPlayNext={() => { playTrackNext(actionTrack); setModal(null); }} onQueue={() => { addTrackToQueue(actionTrack); setModal(null); }} onFavorite={() => { toggleFavorite(actionTrack); setModal(null); }} onAdd={() => setModal({ type: 'add', track: actionTrack })} onDownload={(actionTrack.source === 'youtube' || (actionTrack.source === 'jamendo' && actionTrack.downloadAllowed && !actionTrack.cachedBlob)) ? () => { if (actionTrack.source === 'youtube') setModal({ type: 'youtube-download', track: actionTrack }); else { saveOffline(actionTrack); setModal(null); } } : null} onRemoveFromPlaylist={() => removeFromPlaylist(actionPlaylist, actionTrack)} onMove={(direction) => movePlaylistTrack(actionPlaylist, actionTrack, direction)} onDelete={() => { setModal(null); deleteTrack(actionStoredTrack); }} />}
      {modal?.type === 'settings' && <SettingsModal onClose={() => setModal(null)} initialClientId={clientId} initialYoutubeKey={youtubeKey} onSave={saveSettings} storage={storage} youtubeServerManaged={Boolean(ENV_CONFIG.youtubeKey)} />}
      {toast && <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}><span>{toast.type === 'success' ? <Check size={16} /> : <WifiOff size={16} />}</span>{toast.message}</div>}
      <input ref={fileInputRef} hidden type="file" multiple accept="audio/*" onChange={(event) => importFiles([...event.target.files])} />
    </div>
  );
}

export default App;
