'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Download, Heart, ListPlus, LoaderCircle, MoreVertical, Pause, Play, Search, Shuffle, X } from 'lucide-react';
import { Cover, EmptyState, Spinner, TopBar, TrackList } from './parts';

const PAGE = 100;

export default function Detail({
  meta, tracks, loading, error, hasMore, onLoadMore, onRetry, onBack, current, playing, likedIds, isPlayingHere,
  onPlayAll, onShuffle, onPlayTrack, onLike, onMore, onDownloadAll, onlineCount, saved, onSave, savingOnline, onMenu, downloadsButton
}) {
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { setShown(PAGE); }, [filter]);
  const term = filter.trim().toLowerCase();
  const visible = useMemo(() => term ? tracks.filter((track) => [track.title, track.artist].some((value) => value?.toLowerCase().includes(term))) : tracks, [tracks, term]);
  const art = meta.art;
  return (
    <div className="page detail" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 180)}>
      <TopBar onBack={onBack} title={scrolled ? meta.title : ''} transparent={!scrolled}>{downloadsButton}</TopBar>
      <header className="detail-head">
        {art?.cover && <span className="detail-backdrop" style={{ backgroundImage: `url("${art.cover}")` }} aria-hidden="true" />}
        {meta.tone ? <span className={`cover detail-art ${meta.tone}`} aria-hidden="true">{meta.icon}</span>
          : meta.arabic ? <span className="cover detail-art round classic-art" dir="rtl" aria-hidden="true">{meta.arabic}</span>
          : <Cover track={art} className="detail-art" round={meta.round} icon={meta.iconComponent} />}
        <h1>{meta.title}</h1>
        {meta.subtitle && <p>{meta.subtitle}</p>}
      </header>

      <div className="detail-actions">
        <div className="detail-secondary">
          {onSave && (saved
            ? <button className="mini-pill on" onClick={onSave} aria-label="Saved to library"><Check size={16} />In library</button>
            : <button className="mini-pill" disabled={savingOnline} onClick={onSave} aria-label="Save to library">{savingOnline ? <LoaderCircle className="spin" size={16} /> : meta.saveIcon === 'heart' ? <Heart size={16} /> : <ListPlus size={16} />}Save</button>)}
          {onDownloadAll && <button className="mini-pill" onClick={onDownloadAll} aria-label="Download all" disabled={!tracks.length}><Download size={16} />Download{onlineCount > 0 ? ` ${onlineCount}` : ''}</button>}
          {onMenu && <button className="icon-button" onClick={onMenu} aria-label="More options"><MoreVertical size={22} /></button>}
        </div>
        <button className="icon-button shuffle" onClick={() => onShuffle(visible)} disabled={!visible.length} aria-label="Shuffle play"><Shuffle size={22} /></button>
        <button className="big-play" onClick={() => onPlayAll(visible)} disabled={!visible.length} aria-label={isPlayingHere && playing ? 'Pause playback' : 'Play all'}>
          {isPlayingHere && playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
        </button>
      </div>

      {tracks.length > 15 && (
        <label className="filter-field">
          <Search size={17} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find in this list" aria-label="Find in this list" />
          {filter && <button className="icon-button" onClick={() => setFilter('')} aria-label="Clear filter"><X size={17} /></button>}
        </label>
      )}

      {error && <div className="inline-note error" role="alert"><AlertCircle size={16} /><span>{error}</span>{onRetry && <button onClick={onRetry}>Retry</button>}</div>}
      {visible.length > 0
        ? <TrackList tracks={visible} limit={shown} current={current} playing={playing} likedIds={likedIds} numbered={meta.numbered}
            onPlay={(track) => onPlayTrack(track, visible)} onLike={onLike} onMore={(track) => onMore(track, visible)} />
        : loading ? <Spinner label="Loading songs…" />
        : !error && <EmptyState icon={meta.emptyIcon} title={term ? 'No matching songs' : meta.emptyTitle} text={term ? 'Try another title.' : meta.emptyText} />}
      {visible.length > shown && <button className="pill-button wide" onClick={() => setShown((count) => count + PAGE)}>Show more</button>}
      {hasMore && !term && <button className="pill-button wide" disabled={loading} onClick={onLoadMore}>{loading ? <LoaderCircle className="spin" size={17} /> : null}Load more songs</button>}
      {meta.footnote && <p className="detail-footnote">{meta.footnote}</p>}
    </div>
  );
}
