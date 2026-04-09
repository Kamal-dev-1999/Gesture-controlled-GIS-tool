import React from 'react';
import type { CameraFeedProps } from '../types';

interface CameraFeedExtendedProps extends CameraFeedProps {
  isLoading: boolean;
  error: string | null;
}

export function CameraFeed({
  videoRef,
  canvasRef,
  isTrackingActive,
  isLoading,
  error,
}: CameraFeedExtendedProps): React.ReactElement {
  return (
    <div className="camera-feed-wrapper">
      {/* Header bar */}
      <div className="camera-feed-header">
        <div className={`camera-feed-status ${isTrackingActive ? '' : 'inactive'}`} />
        <span className="camera-feed-label">
          {isLoading
            ? 'Loading Model…'
            : error
              ? 'Camera Error'
              : isTrackingActive
                ? 'Gesture Tracking'
                : 'Awaiting Hand'}
        </span>
      </div>

      {/* Video + Canvas overlay */}
      <div className="camera-feed-video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-feed-video"
          aria-label="Webcam feed for gesture tracking"
        />
        <canvas
          ref={canvasRef}
          className="camera-feed-canvas"
          width={200}
          height={150}
          aria-label="Hand landmark overlay"
        />

        {/* Loading overlay */}
        {isLoading && (
          <div className="camera-feed-placeholder">
            <div style={{
              width: 24, height: 24,
              border: '2px solid var(--accent-primary)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span>Initializing…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error overlay */}
        {error && !isLoading && (
          <div className="camera-feed-placeholder" style={{ gap: 6 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ color: '#ef4444', fontSize: 10, textAlign: 'center', padding: '0 8px' }}>
              {error.includes('Permission') || error.includes('permission')
                ? 'Camera access denied'
                : 'Camera unavailable'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
