'use client';
import { ArrowDownCircle, ArrowLeft, Heart, ListMusic, MoreVertical, Music2, Pause, Play, UserRound } from 'lucide-react';
import { artworkHue, formatTime, initials, isDownloaded } from './format';

export function Cover({ track, className = '', round = false, icon: Icon }) {
  const src = track?.cover;
  return (
    <span className={`cover ${round ? 'round' : ''} ${className}`} style={{ '--hue': artworkHue(track?.id || track?.title) }} aria-hidden="true">
      {src ? <img src={src} className={src.includes('ytimg.com') ? 'yt' : undefined} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} />
        : Icon ? <Icon size="42%" strokeWidth={1.8} /> : <b>{initials(track?.title)}</b>}
    </span>
  );
}

export function Equalizer({ playing }) {
  return <span className={`equalizer ${playing ? 'on' : ''}`} aria-hidden="true"><i /><i /><i /></span>;
}

export function TrackRow({ track, active, playing, liked, onPlay, onLike, onMore, number }) {
  const downloaded = isDownloaded(track);
  return (
    <div className={`track-row ${active ? 'active' : ''}`}>
      <button className="track-main" onClick={onPlay} aria-label={`${active && playing ? 'Pause' : 'Play'} ${track.title}`}>
        {number != null && <span className="track-number">{active ? <Equalizer playing={playing} /> : number}</span>}
        <span className="track-art">
          <Cover track={track} />
          {active && number == null && <span className="track-art-state"><Equalizer playing={playing} /></span>}
        </span>
        <span className="track-text">
          <strong>{track.title}</strong>
          <small>
            {downloaded && <ArrowDownCircle className="downloaded-mark" size={13} aria-label="Downloaded" />}
            <span>{track.artist || 'Unknown artist'}</span>
            {track.duration > 0 && <span className="track-time"> · {formatTime(track.duration)}</span>}
          </small>
        </span>
      </button>
      {onLike && (
        <button className={`row-icon like ${liked ? 'on' : ''}`} onClick={onLike} aria-pressed={liked} aria-label={liked ? `Remove ${track.title} from Liked songs` : `Like ${track.title}`}>
          <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
        </button>
      )}
      <button className="row-icon" onClick={onMore} aria-label={`More options for ${track.title}`}><MoreVertical size={20} /></button>
    </div>
  );
}

export function TrackList({ tracks, current, playing, likedIds, onPlay, onLike, onMore, numbered = false, limit }) {
  const shown = limit ? tracks.slice(0, limit) : tracks;
  return (
    <div className="track-list">
      {shown.map((track, index) => (
        <TrackRow key={`${track.id}-${index}`} track={track} number={numbered ? index + 1 : undefined}
          active={current?.id === track.id} playing={playing} liked={likedIds?.has(track.id)}
          onPlay={() => onPlay(track, index)} onLike={onLike ? () => onLike(track) : undefined} onMore={() => onMore(track, index)} />
      ))}
    </div>
  );
}

// A row that opens something: a playlist, an artist, or one of the built-in collections.
export function ListRow({ title, subtitle, art, round = false, icon, onClick, label, tone, trailing }) {
  return (
    <button className="list-row" onClick={onClick} aria-label={label}>
      {tone ? <span className={`cover tile-art ${tone}`} aria-hidden="true">{icon}</span> : <Cover track={art} round={round} icon={icon} />}
      <span className="list-row-text"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      {trailing}
    </button>
  );
}

export function CollectionRow({ collection, onOpen }) {
  const artist = collection.kind === 'artist';
  return <ListRow title={collection.title} round={artist} art={collection} icon={artist ? UserRound : ListMusic}
    subtitle={artist ? 'Artist' : [`Playlist · ${collection.artist || 'YouTube'}`, collection.trackCount != null ? `${collection.trackCount} songs` : ''].filter(Boolean).join(' · ')}
    label={`Open ${artist ? 'artist' : 'playlist'} ${collection.title}`} onClick={onOpen} />;
}

export function Shelf({ title, action, onAction, children, className = '' }) {
  return (
    <section className={`shelf ${className}`}>
      <header className="shelf-head"><h2>{title}</h2>{action && <button onClick={onAction}>{action}</button>}</header>
      <div className="shelf-scroll">{children}</div>
    </section>
  );
}

export function TrackTile({ track, active, playing, onPlay, round = false, subtitle }) {
  return (
    <button className={`tile ${active ? 'active' : ''}`} onClick={onPlay} aria-label={`${active && playing ? 'Pause' : 'Play'} ${track.title}`}>
      <span className="tile-cover"><Cover track={track} round={round} />{!round && <span className="tile-play">{active && playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</span>}</span>
      <strong>{track.title}</strong>
      <small>{subtitle ?? (track.artist || 'Unknown artist')}</small>
    </button>
  );
}

export function TopBar({ title, onBack, children, transparent = false }) {
  return (
    <header className={`top-bar ${transparent ? 'transparent' : ''}`}>
      {onBack && <button className="icon-button" onClick={onBack} aria-label="Back"><ArrowLeft size={22} /></button>}
      {title && <h1 className="top-title">{title}</h1>}
      <div className="top-actions">{children}</div>
    </header>
  );
}

export function EmptyState({ icon: Icon = Music2, title, text, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={26} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Spinner({ label }) {
  return <div className="loading-state" role="status"><span className="spinner" />{label && <span>{label}</span>}</div>;
}
