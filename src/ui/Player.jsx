'use client';
import { ArrowDownCircle, ChevronDown, Download, Heart, ListMusic, ListPlus, LoaderCircle, MoreVertical, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { Cover, Equalizer } from './parts';
import { formatTime, isDownloaded } from './format';

const percent = (progress, duration) => `${duration ? Math.min(100, progress / duration * 100) : 0}%`;

export function MiniPlayer({ track, playing, progress, duration, liked, status, loading, onOpen, onToggle, onNext, onLike }) {
  return (
    <div className="mini-player" style={{ '--progress': percent(progress, duration) }}>
      <button className="mini-open" onClick={onOpen} aria-label={`Open now playing: ${track.title}`}>
        <Cover track={track} />
        <span className="mini-text"><strong>{track.title}</strong><small>{status || track.artist || 'Unknown artist'}</small></span>
      </button>
      <button className={`icon-button like ${liked ? 'on' : ''}`} onClick={onLike} aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}><Heart size={21} fill={liked ? 'currentColor' : 'none'} /></button>
      <button className="icon-button" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>{loading ? <LoaderCircle className="spin" size={24} /> : playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</button>
      <button className="icon-button hide-narrow" onClick={onNext} aria-label="Next"><SkipForward size={22} fill="currentColor" /></button>
      <span className="mini-progress" aria-hidden="true" />
    </div>
  );
}

export function NowPlaying({
  track, playing, progress, duration, volume, muted, shuffle, repeat, liked, upcoming, videoSlot, status,
  onClose, onToggle, onPrevious, onNext, onSeek, onVolume, onMute, onShuffle, onRepeat, onLike, onAdd, onMore, onDownload, onQueue, onSelect
}) {
  const repeatLabel = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off';
  const downloaded = isDownloaded(track);
  return (
    <section className="now-playing" role="dialog" aria-modal="true" aria-label={`Now playing ${track.title}`}>
      {track.cover && <span className="np-backdrop" style={{ backgroundImage: `url("${track.cover}")` }} aria-hidden="true" />}
      <header className="np-head">
        <button className="icon-button" onClick={onClose} aria-label="Close now playing"><ChevronDown size={28} /></button>
        <span>Now playing</span>
        <button className="icon-button" onClick={onMore} aria-label="Track options"><MoreVertical size={22} /></button>
      </header>
      {videoSlot && <div className="np-video-slot" aria-hidden="true" />}
      <div className="np-body">
        {!videoSlot && <div className="np-art"><Cover track={track} /></div>}
        <div className="np-meta">
          <div><h2>{track.title}</h2><p>{track.artist || 'Unknown artist'}</p></div>
          <button className={`icon-button like ${liked ? 'on' : ''}`} onClick={onLike} aria-label={liked ? 'Remove from favorites' : 'Add to favorites'}><Heart size={26} fill={liked ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="np-seek">
          <input className="range" aria-label="Track position" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(progress, duration || 0)}
            onChange={(event) => onSeek(Number(event.target.value))} style={{ '--progress': percent(progress, duration) }} />
          <div><span>{formatTime(progress)}</span><span>{status || ''}</span><span>{formatTime(duration)}</span></div>
        </div>
        <div className="np-controls">
          <button className={`icon-button ${shuffle ? 'on' : ''}`} onClick={onShuffle} aria-pressed={shuffle} aria-label={shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}><Shuffle size={22} /></button>
          <button className="icon-button" onClick={onPrevious} aria-label="Previous track"><SkipBack size={32} fill="currentColor" /></button>
          <button className="np-play" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}</button>
          <button className="icon-button" onClick={onNext} aria-label="Next track"><SkipForward size={32} fill="currentColor" /></button>
          <button className={`icon-button ${repeat !== 'off' ? 'on' : ''}`} onClick={onRepeat} aria-label={repeatLabel}>{repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}</button>
        </div>
        <div className="np-tools">
          {downloaded ? <span className="np-tool done"><ArrowDownCircle size={20} />Downloaded</span>
            : onDownload ? <button className="np-tool" onClick={onDownload}><Download size={20} />Download</button> : <span />}
          <button className="np-tool" onClick={onAdd}><ListPlus size={20} />Add to playlist</button>
          <button className="np-tool" onClick={onQueue}><ListMusic size={20} />Queue</button>
        </div>
        <div className="np-volume">
          <button className="icon-button" onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'}>{muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
          <input className="range" aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => onVolume(Number(event.target.value))} style={{ '--progress': `${volume * 100}%` }} />
        </div>
        {upcoming.length > 0 && (
          <section className="np-next">
            <header><h3>Up next</h3><button onClick={onQueue}>Open queue</button></header>
            {upcoming.map((item, index) => (
              <button key={`${item.id}-${index}`} className="np-next-row" onClick={() => onSelect(item)}>
                <Cover track={item} /><span><strong>{item.title}</strong><small>{item.artist || 'Unknown artist'}</small></span>
              </button>
            ))}
          </section>
        )}
      </div>
    </section>
  );
}

export function QueueSheet({ queue, current, playing, onClose, onSelect, onClearUpcoming }) {
  const index = queue.findIndex((track) => track.id === current?.id);
  const upcoming = index >= 0 ? queue.slice(index + 1) : queue;
  const earlier = index > 0 ? queue.slice(0, index) : [];
  const row = (track, key, isCurrent) => (
    <button key={key} className={`queue-row ${isCurrent ? 'current' : ''}`} onClick={() => onSelect(track)} aria-current={isCurrent || undefined}>
      <Cover track={track} />
      <span><strong>{track.title}</strong><small>{track.artist || 'Unknown artist'}</small></span>
      {isCurrent && <Equalizer playing={playing} />}
    </button>
  );
  return (
    <section className="queue-sheet" role="dialog" aria-modal="true" aria-label="Queue">
      <header className="np-head">
        <button className="icon-button" onClick={onClose} aria-label="Close queue"><X size={24} /></button>
        <span>Queue · {queue.length}</span>
        {upcoming.length > 0 ? <button className="text-button" onClick={onClearUpcoming}>Clear upcoming</button> : <span />}
      </header>
      <div className="queue-body">
        {current && <><h3>Now playing</h3>{row(current, 'current', true)}</>}
        {upcoming.length > 0 && <><h3>Next up</h3>{upcoming.map((track, i) => row(track, `${track.id}-${i}`, false))}</>}
        {earlier.length > 0 && <><h3>Played</h3>{earlier.map((track, i) => row(track, `p-${track.id}-${i}`, false))}</>}
        {!queue.length && <p className="muted">Choose a song to start a queue.</p>}
      </div>
    </section>
  );
}
