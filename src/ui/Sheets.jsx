'use client';
import { useRef, useState } from 'react';
import {
  ArrowDown, ArrowDownCircle, ArrowUp, Check, Download, ExternalLink, FolderUp, HardDrive, Heart, Link2, ListEnd,
  ListMusic, ListPlus, LoaderCircle, Plus, Trash2, Upload, X
} from 'lucide-react';
import Modal from '../Modal';
import { Cover } from './parts';
import { formatBytes, isDownloaded, plural } from './format';

function SheetItem({ icon, label, detail, onClick, danger = false, disabled = false }) {
  return (
    <button className={`sheet-item ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="sheet-icon">{icon}</span><span className="sheet-label"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
    </button>
  );
}

export function TrackActionsSheet({ track, liked, stored, playlist, canMoveUp, canMoveDown, onClose, onPlayNext, onQueue, onLike, onAdd, onDownload, onMove, onRemoveFromPlaylist, onDelete }) {
  const youtubeLink = track.externalId && /^[\w-]{11}$/.test(track.externalId) ? `https://www.youtube.com/watch?v=${track.externalId}` : track.shareUrl;
  return (
    <Modal title={track.title} subtitle={track.artist || 'Unknown artist'} onClose={onClose} header={<Cover track={track} />}>
      <div className="sheet-list">
        <SheetItem icon={<ListEnd size={21} />} label="Play next" onClick={onPlayNext} />
        <SheetItem icon={<ListMusic size={21} />} label="Add to queue" onClick={onQueue} />
        <SheetItem icon={<Heart size={21} fill={liked ? 'currentColor' : 'none'} />} label={liked ? 'Remove from liked songs' : 'Add to liked songs'} onClick={onLike} />
        <SheetItem icon={<ListPlus size={21} />} label="Add to playlist" onClick={onAdd} />
        {isDownloaded(track) ? <SheetItem icon={<ArrowDownCircle size={21} />} label="Downloaded" detail="Plays offline on this device" disabled />
          : onDownload && <SheetItem icon={<Download size={21} />} label="Download" detail="Keep it for offline listening" onClick={onDownload} />}
        {playlist && <>
          <SheetItem icon={<ArrowUp size={21} />} label="Move up" disabled={!canMoveUp} onClick={() => onMove(-1)} />
          <SheetItem icon={<ArrowDown size={21} />} label="Move down" disabled={!canMoveDown} onClick={() => onMove(1)} />
          <SheetItem icon={<X size={21} />} label={`Remove from “${playlist.name}”`} onClick={onRemoveFromPlaylist} />
        </>}
        {youtubeLink && <a className="sheet-item" href={youtubeLink} target="_blank" rel="noreferrer"><span className="sheet-icon"><ExternalLink size={21} /></span><span className="sheet-label"><strong>Open on YouTube</strong></span></a>}
        {stored && <SheetItem icon={<Trash2 size={21} />} label="Remove from library" danger onClick={onDelete} />}
      </div>
    </Modal>
  );
}

export function AddToPlaylistSheet({ track, playlists, onClose, onAdd, onNew }) {
  return (
    <Modal title="Add to playlist" subtitle={track.title} onClose={onClose}>
      <div className="sheet-list">
        <SheetItem icon={<Plus size={21} />} label="New playlist" onClick={onNew} />
        {playlists.map((playlist) => {
          const inside = playlist.trackIds.includes(track.id);
          return <SheetItem key={playlist.id} icon={inside ? <Check size={21} /> : <ListMusic size={21} />} label={playlist.name} detail={inside ? 'Already added' : plural(playlist.trackIds.length, 'song')} disabled={inside} onClick={() => onAdd(playlist)} />;
        })}
      </div>
    </Modal>
  );
}

export function PlaylistNameSheet({ title = 'New playlist', initial = '', submitLabel = 'Create playlist', onClose, onSubmit, onDelete }) {
  const [name, setName] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form className="sheet-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit(name.trim()); }}>
        <input className="text-input big" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Playlist name" aria-label="Playlist name" maxLength={48} />
        <button className="pill-button primary wide" disabled={!name.trim() || name.trim() === initial}>{submitLabel}</button>
      </form>
      {onDelete && <button className="pill-button danger wide" onClick={onDelete}><Trash2 size={17} />Delete playlist</button>}
    </Modal>
  );
}

export function CreateSheet({ onClose, onNewPlaylist, onImportLink, onAddFiles }) {
  return (
    <Modal title="Add to your library" onClose={onClose}>
      <div className="sheet-list">
        <SheetItem icon={<ListPlus size={21} />} label="New playlist" detail="Start empty and add songs as you go" onClick={onNewPlaylist} />
        <SheetItem icon={<Link2 size={21} />} label="Paste a playlist link" detail="YouTube playlist or Mix, Spotify playlist or album" onClick={onImportLink} />
        <SheetItem icon={<FolderUp size={21} />} label="Add music from this device" detail="MP3, M4A, WAV, OGG, Opus, FLAC" onClick={onAddFiles} />
      </div>
    </Modal>
  );
}

export function ConsentSheet({ title, onClose, onAccept }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal title="Before you download" subtitle={title} onClose={onClose}>
      <p className="sheet-text">Downloads are saved on this device and play offline. Only download content you own or have permission to save.</p>
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I have the right to download this content and will use it in accordance with YouTube’s terms.</span></label>
      <button className="pill-button primary wide" disabled={!confirmed} onClick={onAccept}><Download size={17} />Download</button>
      <p className="sheet-footnote">You’ll only be asked once on this device. Format and backup copies are in Settings.</p>
    </Modal>
  );
}

export function GetAppSheet({ onClose, onImport }) {
  return (
    <Modal title="Download on Android" subtitle="YouTube refuses downloads from this website’s server." onClose={onClose}>
      <p className="sheet-text">The Sonora Android app downloads and converts music right on your phone. Your web library stays here.</p>
      <a className="pill-button primary wide" href="/android" target="_blank" rel="noreferrer"><Download size={18} />Get the Android app</a>
      <button className="pill-button wide" onClick={onImport}><Upload size={18} />Import audio files instead</button>
      <p className="sheet-footnote">Android 10+ · 32-bit and 64-bit ARM.</p>
    </Modal>
  );
}

export function UploadSheet({ onClose, onFiles, onFolder, importing, progress }) {
  const inputRef = useRef();
  const folderInputRef = useRef();
  return (
    <Modal title="Add music from this device" subtitle="Files stay private on this device and play offline." onClose={onClose}>
      <input ref={inputRef} hidden type="file" multiple accept="audio/*,.flac" onChange={(event) => !importing && onFiles([...event.target.files])} />
      <input ref={folderInputRef} hidden type="file" multiple accept="audio/*,.flac" directory="" webkitdirectory="" onChange={(event) => onFolder([...event.target.files])} />
      <button className="drop-zone" disabled={importing} onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!importing) onFiles([...event.dataTransfer.files]); }}>
        {importing ? <LoaderCircle className="spin" size={28} /> : <FolderUp size={28} />}
        <strong>{importing ? 'Reading your music…' : 'Choose audio files'}</strong>
        <small>MP3, M4A, WAV, OGG, Opus, AAC, or FLAC</small>
      </button>
      <button className="pill-button wide" onClick={() => folderInputRef.current?.click()} disabled={importing}><FolderUp size={17} />Import a whole folder</button>
      {progress && <p className="sheet-footnote" role="status">{progress.current} of {progress.total} · {progress.name}</p>}
    </Modal>
  );
}

export function SettingsSheet({ onClose, storage, nativeAndroid, version, format, onFormat, keepBackup, onKeepBackup, fullscreen, onFullscreen }) {
  const used = storage?.usage || 0;
  const quota = storage?.quota || 0;
  return (
    <Modal title="Settings" onClose={onClose}>
      {fullscreen != null && (
        <section className="settings-group">
          <h3>Display</h3>
          <label className="setting-row">
            <span><strong>Full screen</strong><small>Hide the status and navigation bars. Swipe from an edge to see them.</small></span>
            <input type="checkbox" className="switch" checked={fullscreen} onChange={(event) => onFullscreen(event.target.checked)} aria-label="Full screen" />
          </label>
        </section>
      )}
      <section className="settings-group">
        <h3>Downloads</h3>
        <label className="setting-row">
          <span><strong>Audio format</strong><small>M4A is the fastest and best quality</small></span>
          <select className="text-input select" value={format} onChange={(event) => onFormat(event.target.value)} aria-label="Audio format">
            <option value="m4a">M4A</option><option value="opus">Opus · smallest</option><option value="mp3">MP3 · plays everywhere</option>
          </select>
        </label>
        <label className="setting-row">
          <span><strong>Keep a recovery copy</strong><small>Also save each download to Downloads / Files</small></span>
          <input type="checkbox" className="switch" checked={keepBackup} onChange={(event) => onKeepBackup(event.target.checked)} aria-label="Keep a recovery copy" />
        </label>
      </section>
      <section className="settings-group">
        <h3>Storage</h3>
        <div className="setting-row"><span><strong><HardDrive size={16} /> {storage ? `${formatBytes(used)} used` : 'Not available'}</strong>
          <small>{quota ? `${formatBytes(quota)} available to ${nativeAndroid ? 'Sonora' : 'this browser'}` : 'Storage details are not available on this device.'}</small></span></div>
        {quota > 0 && <div className="storage-bar"><span style={{ width: `${Math.max(2, used / quota * 100)}%` }} /></div>}
        {nativeAndroid && <p className="sheet-footnote">Uninstalling Sonora removes its private library. Keep recovery copies of music you want to preserve.</p>}
      </section>
      <section className="settings-group">
        <h3>About</h3>
        <p className="signature in-sheet"><span>Sonora {version}</span><b>M/GL</b></p>
        <p className="sheet-footnote">Designed and built by Med Gleiguem. Music comes from YouTube under the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.{nativeAndroid && <> <a href="/licenses.html" target="_blank" rel="noreferrer">Open-source components</a>.</>}</p>
      </section>
    </Modal>
  );
}
