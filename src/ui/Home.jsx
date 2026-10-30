'use client';
import { ArrowDownCircle, Download, FolderUp, Heart, Search, Settings, WifiOff } from 'lucide-react';
import { Cover, Shelf, TopBar, TrackTile } from './parts';
import { ARABIC_CLASSICS } from './curated';
import { greeting, plural } from './format';

export function DownloadsButton({ count, active, onClick }) {
  if (!count) return null;
  return (
    <button className="icon-button badge-host" onClick={onClick} aria-label={active ? `Downloads, ${active} running` : 'Downloads'}>
      <Download size={22} />{active > 0 && <b className="badge">{active}</b>}
    </button>
  );
}

function QuickTile({ label, art, tone, icon, onClick }) {
  return (
    <button className="quick-tile" onClick={onClick}>
      {tone ? <span className={`cover ${tone}`} aria-hidden="true">{icon}</span> : <Cover track={art} />}
      <strong>{label}</strong>
    </button>
  );
}

export default function Home({
  tracks, playlists, recent, trending, online, youtubeEnabled, current, playing, likedCount, downloadedCount, downloadsButton,
  onOpen, onPlay, onSearch, onSettings, onAddFiles
}) {
  const playlistArt = (playlist) => {
    const first = playlist.trackIds.map((id) => tracks.find((track) => track.id === id)).find((track) => track?.cover);
    return first ? { ...first, id: playlist.id } : { id: playlist.id, title: playlist.name };
  };
  const recentPlaylists = [...playlists].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 4);
  const empty = !tracks.length;
  return (
    <div className="page home">
      <TopBar title={greeting()}>
        {downloadsButton}
        <button className="icon-button" onClick={onSettings} aria-label="Settings"><Settings size={22} /></button>
      </TopBar>

      <button className="search-launcher" onClick={onSearch}><Search size={20} /><span>Songs, artists, or a YouTube / Spotify link</span></button>

      {!online && <p className="inline-note"><WifiOff size={16} />You’re offline. Downloaded songs still play.</p>}

      {!empty && (
        <section className="quick-grid" aria-label="Your collections">
          <QuickTile label="Liked songs" tone="tone-liked" icon={<Heart size={22} fill="currentColor" />} onClick={() => onOpen({ type: 'liked' })} />
          <QuickTile label="Downloaded" tone="tone-offline" icon={<ArrowDownCircle size={22} />} onClick={() => onOpen({ type: 'downloaded' })} />
          {recentPlaylists.map((playlist) => <QuickTile key={playlist.id} label={playlist.name} art={playlistArt(playlist)} onClick={() => onOpen({ type: 'playlist', id: playlist.id })} />)}
        </section>
      )}

      {empty && (
        <section className="welcome">
          <h2>Find a song, play it, keep it.</h2>
          <p>Search YouTube or paste a link. Like songs and build playlists without downloading, then download what you want offline.</p>
          <div className="welcome-actions">
            <button className="pill-button primary" onClick={onSearch}><Search size={18} />Search music</button>
            <button className="pill-button" onClick={onAddFiles}><FolderUp size={18} />Add music</button>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <Shelf title="Recently played">
          {recent.map((track) => <TrackTile key={track.id} track={track} active={current?.id === track.id} playing={playing} onPlay={() => onPlay(track, recent)} />)}
        </Shelf>
      )}

      {online && youtubeEnabled && (trending.items.length > 0 || trending.loading) && (
        <Shelf title="Popular right now">
          {trending.loading && !trending.items.length
            ? Array.from({ length: 4 }, (_, index) => <span key={index} className="tile skeleton" aria-hidden="true"><span className="tile-cover" /><i /><i /></span>)
            : trending.items.map((track) => <TrackTile key={track.id} track={track} active={current?.id === track.id} playing={playing} onPlay={() => onPlay(track, trending.items)} />)}
        </Shelf>
      )}

      {online && youtubeEnabled && (
        <Shelf title="Arabic classics" className="classics">
          {ARABIC_CLASSICS.map((artist) => (
            <button key={artist.id} className="tile classic" onClick={() => onOpen({ type: 'collection', collection: artist })} aria-label={`Open ${artist.title}`}>
              <span className="tile-cover"><span className="cover round classic-art" dir="rtl">{artist.arabic}</span></span>
              <strong>{artist.title}</strong>
            </button>
          ))}
        </Shelf>
      )}

      {!empty && <p className="home-footnote">{plural(tracks.length, 'song')} in your library · {likedCount} liked · {downloadedCount} downloaded</p>}
      <p className="signature" aria-label="Sonora by Med Gleiguem"><span>Sonora</span><b>M/GL</b></p>
    </div>
  );
}
