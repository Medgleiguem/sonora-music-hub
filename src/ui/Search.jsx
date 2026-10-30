'use client';
import { useState } from 'react';
import { AlertCircle, ClipboardPaste, Download, Link2, ListMusic, LoaderCircle, Play, Search as SearchIcon, Wifi, X } from 'lucide-react';
import { CollectionRow, Cover, EmptyState, Spinner, TopBar, TrackList } from './parts';
import { MOODS } from './curated';
import { plural } from './format';

const TYPES = [['video', 'Songs'], ['playlist', 'Playlists'], ['artist', 'Artists']];

// The two ways to bring a playlist in, side by side: keep it online, or download it.
function Choices({ onOnline, onDownload, onlineLabel = 'Add to library', onlineHint = 'Plays online · nothing downloaded', busy }) {
  return (
    <div className="choice-grid">
      <button className="choice" onClick={onOnline} disabled={busy}>
        <span className="choice-icon">{busy ? <LoaderCircle className="spin" size={20} /> : <Wifi size={20} />}</span>
        <strong>{onlineLabel}</strong><small>{onlineHint}</small>
      </button>
      <button className="choice" onClick={onDownload}>
        <span className="choice-icon"><Download size={20} /></span>
        <strong>Download</strong><small>Saved on this phone · plays offline</small>
      </button>
    </div>
  );
}

function LinkCard({ link, linkTrack, savingOnline, initialName, onPlayTrack, onDownloadTrack, onLikeTrack, onOpenPlaylist, onSavePlaylist, onDownloadPlaylist, onAddSpotify, onDownloadSpotify }) {
  const [name, setName] = useState(initialName || '');
  if (link.kind === 'error') return <p className="inline-note error"><AlertCircle size={16} />{link.error}</p>;
  if (link.kind === 'unsupported') return <p className="inline-note"><Link2 size={16} />Only YouTube and Spotify links are supported.</p>;
  if (link.kind === 'yt-video') {
    const track = linkTrack;
    return (
      <section className="link-card" aria-label="Pasted link">
        <div className="link-card-head">
          {track ? <Cover track={track} /> : <span className="cover"><LoaderCircle className="spin" size={20} /></span>}
          <div><strong>{track?.title || 'Finding this video…'}</strong><small>{track?.artist || 'YouTube'}</small></div>
          <button className="big-play small" disabled={!track} onClick={() => onPlayTrack(track)} aria-label="Play"><Play size={20} fill="currentColor" /></button>
        </div>
        <Choices onlineLabel="Like it" onlineHint="Kept in Liked songs · plays online" busy={!track} onOnline={() => onLikeTrack(track)} onDownload={() => onDownloadTrack(track)} />
      </section>
    );
  }
  if (link.kind === 'yt-playlist') return (
    <section className="link-card" aria-label="Pasted link">
      <div className="link-card-head">
        <span className="cover tone-red"><ListMusic size={22} /></span>
        <div><strong>{link.mix ? 'YouTube Mix' : 'YouTube playlist'}</strong><small>{link.mix ? 'A snapshot of up to 100 songs' : 'Every song in the playlist'}</small></div>
        <button className="text-button" onClick={onOpenPlaylist}>Preview</button>
      </div>
      <Choices busy={savingOnline} onOnline={onSavePlaylist} onDownload={onDownloadPlaylist} />
    </section>
  );
  const songs = link.spotify.kind === 'songs';
  const single = songs && link.spotify.songs === 1;
  const playlistName = () => name.trim() || (songs && !single ? 'Spotify songs' : '');
  return (
    <section className="link-card spotify" aria-label="Pasted link">
      <div className="link-card-head">
        <span className="cover tone-green"><ListMusic size={22} /></span>
        <div><strong>{songs ? plural(link.spotify.songs, 'Spotify song') : `Spotify ${link.spotify.kind}`}</strong><small>{songs ? 'Each song is found on YouTube' : 'Its first 100 songs are found on YouTube'}</small></div>
      </div>
      {songs && !single && <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Playlist name (Spotify songs)" maxLength={48} aria-label="Playlist name" />}
      <Choices onlineLabel={single ? 'Like it' : 'Add to library'} onlineHint={single ? 'Kept in Liked songs · plays online' : 'Plays online · nothing downloaded'}
        onOnline={() => onAddSpotify(playlistName())} onDownload={() => onDownloadSpotify(playlistName())} />
    </section>
  );
}

export default function Search({
  inputRef, query, setQuery, type, setType, results, libraryMatches, online, youtubeEnabled, link, linkTrack, savingOnline,
  recentSearches, onPickRecent, onRemoveRecent, onCommit, onRetry, onOpen, onPlay, onLike, onMore, likedIds, current, playing, downloadsButton, linkActions, spotifyName
}) {
  const term = query.trim();
  const paste = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) setQuery(text.trim()); }
    catch { inputRef.current?.focus(); }
  };
  const showRemote = term && !link && online && youtubeEnabled;
  return (
    <div className="page search">
      <TopBar title="Search">{downloadsButton}</TopBar>
      <div className="search-field-wrap">
        <form className="search-field" role="search" onSubmit={(event) => { event.preventDefault(); onCommit(); inputRef.current?.blur(); }}>
          <SearchIcon size={20} />
          <input ref={inputRef} aria-label="Search music" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What do you want to hear?" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} />
          {query ? <button type="button" className="icon-button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search"><X size={19} /></button>
            : <button type="button" className="paste-button" onClick={paste}><ClipboardPaste size={16} />Paste link</button>}
        </form>
        {showRemote && (
          <div className="chips" role="group" aria-label="Search type">
            {TYPES.map(([value, label]) => <button key={value} className={type === value ? 'on' : ''} aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>)}
          </div>
        )}
      </div>

      {link && <LinkCard key={term} link={link} linkTrack={linkTrack} savingOnline={savingOnline} initialName={spotifyName} {...linkActions} />}

      {!term && (
        <>
          {recentSearches.length > 0 && (
            <section className="section">
              <h2 className="section-title">Recent searches</h2>
              <div className="recent-list">
                {recentSearches.map((item) => (
                  <div className="recent-item" key={item}>
                    <button onClick={() => onPickRecent(item)}><SearchIcon size={17} /><span>{item}</span></button>
                    <button className="icon-button" onClick={() => onRemoveRecent(item)} aria-label={`Remove ${item} from recent searches`}><X size={17} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {online && youtubeEnabled && (
            <section className="section">
              <h2 className="section-title">Browse</h2>
              <div className="mood-grid">
                {MOODS.map((mood) => <button key={mood.id} className={`mood ${mood.tone}`} onClick={() => onOpen({ type: 'collection', collection: mood })}>{mood.title}</button>)}
              </div>
            </section>
          )}
          {!online && <EmptyState icon={SearchIcon} title="You’re offline" text="Search works on your library until you’re back online." />}
        </>
      )}

      {term && !link && libraryMatches.length > 0 && (
        <section className="section">
          <h2 className="section-title">In your library</h2>
          <TrackList tracks={libraryMatches} limit={showRemote ? 4 : undefined} current={current} playing={playing} likedIds={likedIds}
            onPlay={(track) => onPlay(track, libraryMatches)} onLike={onLike} onMore={(track) => onMore(track, libraryMatches)} />
        </section>
      )}

      {showRemote && (
        <section className="section">
          {libraryMatches.length > 0 && <h2 className="section-title">On YouTube</h2>}
          {results.error ? (
            <div className="inline-note error" role="alert"><AlertCircle size={16} /><span>{results.error}</span><button onClick={onRetry}>Retry</button></div>
          ) : results.loading && !results.items.length ? <Spinner label="Searching…" />
            : results.items.length ? (
              type === 'video'
                ? <TrackList tracks={results.items} current={current} playing={playing} likedIds={likedIds}
                    onPlay={(track) => { onCommit(); onPlay(track, results.items); }} onLike={onLike} onMore={(track) => onMore(track, results.items)} />
                : <div className="row-list">{results.items.map((item) => <CollectionRow key={item.id} collection={item} onOpen={() => { onCommit(); onOpen({ type: 'collection', collection: item }); }} />)}</div>
            ) : !results.loading && <EmptyState icon={SearchIcon} title={`No ${type === 'video' ? 'songs' : type === 'playlist' ? 'playlists' : 'artists'} found`} text="Check the spelling or try other words." />}
        </section>
      )}

      {term && !link && !showRemote && !libraryMatches.length && <EmptyState icon={SearchIcon} title="No matching music" text="Try a different title, artist, or album." />}
    </div>
  );
}
