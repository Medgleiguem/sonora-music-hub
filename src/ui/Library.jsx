'use client';
import { useMemo, useState } from 'react';
import { ArrowDownCircle, Heart, ListMusic, Music2, Plus, Search, X } from 'lucide-react';
import { EmptyState, ListRow, TopBar, TrackList } from './parts';
import { plural } from './format';

const playlistOrigin = (playlist) => playlist.sourceUrl?.startsWith('spotify') || playlist.sourceUrl?.includes('spotify.com') ? 'Spotify'
  : playlist.sourceUrl ? 'YouTube' : '';

export default function Library({
  tracks, playlists, likedCount, downloadedCount, downloadsButton, current, playing, likedIds,
  onOpen, onCreate, onPlay, onLike, onMore
}) {
  const [filter, setFilter] = useState('');
  const term = filter.trim().toLowerCase();
  const byId = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const sorted = useMemo(() => [...playlists].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)), [playlists]);
  const shownPlaylists = term ? sorted.filter((playlist) => playlist.name.toLowerCase().includes(term)) : sorted;
  const songMatches = useMemo(() => term ? tracks.filter((track) => [track.title, track.artist, track.album].some((value) => value?.toLowerCase().includes(term))) : [], [tracks, term]);
  const artFor = (playlist) => {
    const first = playlist.trackIds.map((id) => byId.get(id)).find((track) => track?.cover);
    return first ? { ...first, id: playlist.id } : { id: playlist.id, title: playlist.name };
  };
  const empty = !tracks.length && !playlists.length;

  return (
    <div className="page library">
      <TopBar title="Library">
        {downloadsButton}
        <button className="icon-button" onClick={onCreate} aria-label="Create or add"><Plus size={24} /></button>
      </TopBar>

      {!empty && (
        <label className="filter-field">
          <Search size={17} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find in library" aria-label="Find in library" />
          {filter && <button className="icon-button" onClick={() => setFilter('')} aria-label="Clear filter"><X size={17} /></button>}
        </label>
      )}

      {empty ? (
        <EmptyState icon={ListMusic} title="Your library is empty" text="Songs you like, playlists you make or save, and music you download all live here.">
          <button className="pill-button primary" onClick={onCreate}><Plus size={18} />Add something</button>
        </EmptyState>
      ) : (
        <div className="row-list">
          {!term && <>
            <ListRow tone="tone-liked" icon={<Heart size={22} fill="currentColor" />} title="Liked songs" subtitle={plural(likedCount, 'song')} onClick={() => onOpen({ type: 'liked' })} />
            <ListRow tone="tone-offline" icon={<ArrowDownCircle size={22} />} title="Downloaded" subtitle={`${plural(downloadedCount, 'song')} · plays offline`} onClick={() => onOpen({ type: 'downloaded' })} />
            <ListRow tone="tone-slate" icon={<Music2 size={22} />} title="All songs" subtitle={plural(tracks.length, 'song')} onClick={() => onOpen({ type: 'songs' })} />
          </>}
          {shownPlaylists.map((playlist) => (
            <ListRow key={playlist.id} art={artFor(playlist)} title={playlist.name} label={`Open playlist ${playlist.name}`}
              subtitle={['Playlist', plural(playlist.trackIds.length, 'song'), playlistOrigin(playlist)].filter(Boolean).join(' · ')}
              onClick={() => onOpen({ type: 'playlist', id: playlist.id })} />
          ))}
          {!term && !playlists.length && (
            <button className="list-row ghost" onClick={onCreate}><span className="cover dashed" aria-hidden="true"><Plus size={22} /></span><span className="list-row-text"><strong>New playlist</strong><small>Or save one from YouTube or Spotify</small></span></button>
          )}
        </div>
      )}

      {term && (
        songMatches.length ? (
          <section className="section">
            <h2 className="section-title">Songs</h2>
            <TrackList tracks={songMatches} limit={80} current={current} playing={playing} likedIds={likedIds}
              onPlay={(track) => onPlay(track, songMatches)} onLike={onLike} onMore={(track) => onMore(track, songMatches)} />
          </section>
        ) : !shownPlaylists.length && <EmptyState icon={Search} title="No matching music" text="Try a different title, artist, or album." />
      )}
    </div>
  );
}
