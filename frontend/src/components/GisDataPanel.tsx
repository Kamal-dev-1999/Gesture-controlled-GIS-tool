import React from 'react';
import type { GisDataPanelProps, PlaceResult, WikiPage } from '../types';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard(): React.ReactElement {
  return (
    <div className="gis-card fade-in">
      <div className="gis-card-header">
        <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 8 }} />
        <div className="skeleton skeleton-line" style={{ width: 100, marginBottom: 0 }} />
      </div>
      <div className="gis-card-body">
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ paddingBottom: 12, borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
            <div className="skeleton skeleton-line" style={{ width: '70%' }} />
            <div className="skeleton skeleton-line" style={{ width: '100%' }} />
            <div className="skeleton skeleton-line" style={{ width: '85%' }} />
            <div className="skeleton skeleton-line" style={{ width: '60%', marginBottom: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Wiki Article Card ────────────────────────────────────────────────────────

interface WikiCardProps {
  articles: WikiPage[];
}

function WikiCard({ articles }: WikiCardProps): React.ReactElement {
  return (
    <div className="gis-card fade-in">
      <div className="gis-card-header">
        <div className="gis-card-icon wiki">📖</div>
        <span className="gis-card-title">Location History</span>
      </div>
      <div className="gis-card-body">
        {articles.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
            No articles found for this area.
          </p>
        ) : (
          articles.map((article) => (
            <div key={article.pageId} className="wiki-article">
              <div className="wiki-article-title">{article.title}</div>
              <div className="wiki-article-extract">{article.extract}</div>
              {article.distanceMeters !== undefined && (
                <div className="wiki-article-distance">
                  <span>📍</span>
                  <span>{article.distanceMeters < 1000
                    ? `${Math.round(article.distanceMeters)}m away`
                    : `${(article.distanceMeters / 1000).toFixed(1)}km away`
                  }</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Places Card ──────────────────────────────────────────────────────────────

interface PlacesCardProps {
  places: PlaceResult[];
}

function PlacesCard({ places }: PlacesCardProps): React.ReactElement {
  return (
    <div className="gis-card fade-in">
      <div className="gis-card-header">
        <div className="gis-card-icon places">🗺️</div>
        <span className="gis-card-title">Key Landmarks</span>
      </div>
      <div className="gis-card-body" style={{ gap: 8 }}>
        {places.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
            No landmarks found nearby.
          </p>
        ) : (
          places.map((place, i) => (
            <div key={place.placeId} className="place-item">
              <div className="place-item-index">{i + 1}</div>
              <div className="place-item-info">
                <div className="place-item-name">{place.name}</div>
                <div className="place-item-vicinity">{place.vicinity}</div>
              </div>
              {place.rating !== undefined && (
                <div className="place-item-rating">
                  <span>★</span>
                  <span>{place.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main GIS Data Panel ──────────────────────────────────────────────────────

export function GisDataPanel({ gisData, isLoading }: GisDataPanelProps): React.ReactElement {
  const locationName = gisData
    ? `${gisData.bounds.center.lat.toFixed(4)}°N, ${gisData.bounds.center.lng.toFixed(4)}°E`
    : 'Awaiting map movement...';

  return (
    <aside className="side-panel slide-in">
      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-dot" />
          GIS Intelligence
        </div>
        <div className="panel-subtitle">Area Context</div>
        <div className="panel-location">{locationName}</div>
      </div>

      {/* Content */}
      <div className="panel-content">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : gisData ? (
          <>
            <WikiCard articles={gisData.wikiArticles} />
            <PlacesCard places={gisData.landmarks} />

            {/* Fetch timestamp */}
            <div style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '4px 0 8px',
            }}>
              Updated {new Date(gisData.fetchedAt).toLocaleTimeString()}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🌍</div>
            <div className="empty-state-text">
              Move the map with your<br />hand gestures to load<br />local GIS data.
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
