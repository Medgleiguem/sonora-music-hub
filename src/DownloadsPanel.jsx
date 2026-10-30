'use client';
import { AlertCircle, Check, ChevronRight, Download, ListMusic, LoaderCircle, Pause, Plus, RotateCcw, Search, Square, X } from 'lucide-react';
import Modal from './Modal';
import { isActiveJob } from './useDownloads';

const STAGES = {
  preparing: 'Getting ready',
  running: 'Downloading',
  waiting: 'Paused until you reopen Sonora',
  stopping: 'Stopping…',
  complete: 'Download complete',
  partial: 'Finished with a few problems',
  stopped: 'Stopped',
  error: 'Download failed',
  interrupted: 'Interrupted'
};
const SONG_STAGES = { preparing: 'Starting…', waiting: 'Waiting…', downloading: 'Downloading', converting: 'Converting', receiving: 'Saving', storing: 'Saving', retrying: 'Retrying…' };
const NEEDS_ATTENTION = new Set(['partial', 'error', 'interrupted']);
// Online imports only match songs and save their details, so they read as adding rather than downloading.
const ONLINE_STAGES = { ...STAGES, preparing: 'Reading the playlist', running: 'Adding to library', complete: 'Added to library · plays online', error: 'Could not add' };
const stageLabel = (job) => (job.request?.online ? ONLINE_STAGES : STAGES)[job.stage] || 'Download';

const isPlaylistLink = (url = '') => /[?&]list=|\/playlist|open\.spotify\.com\/(playlist|album)/.test(url);
export const jobTitle = (job) => job.title || job.request?.title || job.request?.track?.title || (job.request?.tracks ? `${job.request.tracks.length} songs`
  : isPlaylistLink(job.request?.url) ? 'Playlist' : job.request?.url?.includes('spotify') ? 'Spotify songs' : 'YouTube song');

export function jobPercent(job) {
  if (!job.total) return null;
  const partial = Object.values(job.songs || {}).reduce((sum, song) => sum + (song.total ? Math.min(1, song.loaded / song.total) : 0), 0);
  return Math.max(0, Math.min(100, Math.round((job.completed + partial) / job.total * 100)));
}

const jobCounts = (job) => [
  `${job.saved || 0}${job.total ? ` of ${job.total}` : ''} ${job.request?.online ? 'added' : 'saved'}`,
  job.failed?.length ? `${job.failed.length} failed` : ''
].filter(Boolean).join(' · ');

function songStatus(song) {
  if (song.stage === 'downloading' && song.total) return `${Math.round(song.loaded / song.total * 100)}%`;
  return SONG_STAGES[song.stage] || 'Starting…';
}

function JobIcon({ job }) {
  if (isActiveJob(job)) return <LoaderCircle className="spin" size={18} />;
  if (job.stage === 'complete') return <Check size={18} />;
  if (NEEDS_ATTENTION.has(job.stage)) return <AlertCircle size={18} />;
  return <Pause size={18} />;
}

function DownloadJob({ job, onStop, onResume, onRemove, onOpenPlaylist, onAddRemaining, onFind }) {
  const active = isActiveJob(job);
  const title = jobTitle(job);
  const percent = jobPercent(job);
  const songs = Object.values(job.songs || {});
  return (
    <article className={`download-job ${job.stage}`} aria-label={title}>
      <div className="download-job-head">
        <span className="download-job-icon"><JobIcon job={job} /></span>
        <div className="download-job-copy">
          <strong>{title}</strong>
          <span><b>{stageLabel(job)}</b> · {jobCounts(job)}</span>
        </div>
        {!active && <button className="icon-button subtle download-job-remove" onClick={onRemove} aria-label={`Remove ${title} from downloads`}><X size={17} /></button>}
        {(active || job.stage !== 'complete') && <div className="download-job-actions">
          {active
            ? <button className="pill-button" onClick={onStop} disabled={job.stage === 'stopping'} aria-label={`Stop ${title}`}><Square size={14} fill="currentColor" />Stop</button>
            : <button className="pill-button primary" onClick={onResume} aria-label={`Resume ${title}`}><RotateCcw size={15} />Resume</button>}
        </div>}
      </div>
      <div className={`download-progress-track ${active && percent == null ? 'indeterminate' : ''}`} role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        <span style={{ width: `${percent ?? (job.stage === 'complete' ? 100 : 0)}%` }} />
      </div>
      {songs.length > 0 && <ul className="download-job-songs" aria-label="Downloading now">
        {songs.map((song, index) => <li key={index}><span>{song.title}</span><small>{songStatus(song)}</small></li>)}
      </ul>}
      {job.stage === 'waiting' && <p className="download-job-message">Android pauses new downloads while Sonora is closed. Reopen Sonora to continue.</p>}
      {!active && job.message && <p className="download-job-message">{job.message}</p>}
      {job.failed?.length > 0 && <details className="download-job-errors">
        <summary>{job.failed.length} {job.failed.length === 1 ? 'song' : 'songs'} could not be {job.request?.online ? 'found' : 'downloaded'}</summary>
        {job.failed.map((failure, index) => (
          <div className="download-failure" key={index}>
            <p><strong>{failure.title}</strong>{failure.artist && <> · {failure.artist}</>}<br />{failure.message}</p>
            {onFind && <button className="mini-pill" onClick={() => onFind(failure.query || failure.title)} aria-label={`Search for ${failure.title}`}><Search size={15} />Search</button>}
          </div>
        ))}
        <p>Resume tries them again; songs already {job.request?.online ? 'added' : 'saved'} are skipped. Or search for a song and choose the right version yourself.</p>
      </details>}
      {!active && (job.playlistId || job.spotifyLimited) && <div className="download-job-links">
        {job.playlistId && <button className="pill-button" onClick={onOpenPlaylist}><ListMusic size={16} />Open playlist</button>}
        {job.spotifyLimited && <button className="pill-button" onClick={onAddRemaining}><Plus size={16} />Add the remaining Spotify songs</button>}
      </div>}
    </article>
  );
}

export function DownloadsPanel({ jobs, nativeAndroid, onClose, onNew, onStop, onResume, onRemove, onClearFinished, onOpenPlaylist, onAddRemaining, onFind }) {
  const active = jobs.filter(isActiveJob).length;
  const finished = jobs.some((job) => job.stage === 'complete');
  return (
    <Modal title="Downloads" subtitle={active ? `${active} running · keep using Sonora while they finish` : 'Downloaded songs play offline on this device.'} onClose={onClose} wide>
      <div className="downloads-toolbar">
        <button className="pill-button primary" onClick={onNew}><Plus size={17} />New download</button>
        {finished && <button className="pill-button" onClick={onClearFinished}>Clear finished</button>}
      </div>
      {jobs.length
        ? <div className="download-jobs">{jobs.map((job) => <DownloadJob key={job.id} job={job} onStop={() => onStop(job.id)} onResume={() => onResume(job.id)} onRemove={() => onRemove(job.id)} onOpenPlaylist={() => onOpenPlaylist(job.playlistId)} onAddRemaining={() => onAddRemaining(job)} onFind={onFind} />)}</div>
        : <div className="downloads-empty"><Download size={26} /><strong>No downloads yet</strong><span>Download a song or a whole playlist to listen without a connection.</span></div>}
      <p className="download-footnote">{nativeAndroid
        ? 'Downloads keep going while you use Sonora or switch apps. Stop keeps every song already saved.'
        : 'Keep this tab open while saving. Stop keeps every song already saved.'}</p>
    </Modal>
  );
}

export function DownloadsBanner({ jobs, onOpen }) {
  const active = jobs.filter(isActiveJob);
  const attention = jobs.filter((job) => NEEDS_ATTENTION.has(job.stage) && !job.acknowledged);
  if (!active.length && !attention.length) return null;
  const single = active.length === 1 ? active[0] : null;
  const saved = active.reduce((sum, job) => sum + (job.saved || 0), 0);
  const waiting = active.some((job) => job.stage === 'waiting');
  const percent = single ? jobPercent(single) : null;
  const detail = single ? `${jobTitle(single)} · ${jobCounts(single)}`
    : active.length ? `${active.length} downloads · ${saved} ${saved === 1 ? 'song' : 'songs'} saved`
    : `${attention.length === 1 ? jobTitle(attention[0]) : `${attention.length} downloads`} · tap to resume`;
  return (
    <button className={`downloads-banner ${active.length ? 'active' : 'attention'}`} onClick={onOpen} aria-label={`Open downloads: ${detail}`}>
      <span className="downloads-banner-icon">{active.length ? <LoaderCircle className="spin" size={17} /> : <AlertCircle size={17} />}</span>
      <span className="downloads-banner-copy"><strong>{waiting ? 'Paused until you reopen Sonora' : active.length ? active.every((job) => job.request?.online) ? 'Adding to library' : 'Downloading' : 'Downloads need attention'}</strong><small>{detail}</small></span>
      <ChevronRight size={18} />
      {active.length > 0 && <span className={`downloads-banner-progress ${percent == null ? 'indeterminate' : ''}`} style={{ '--progress': `${percent ?? 0}%` }} />}
    </button>
  );
}
