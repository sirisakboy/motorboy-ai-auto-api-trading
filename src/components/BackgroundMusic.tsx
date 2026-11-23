import React, { useEffect, useRef } from 'react';

const BG_MUSIC_SRC = '/assets/song.mp3';
const BG_MUSIC_VOLUME = 0.3;

/**
 * Hidden background music loop (/assets/song.mp3 at volume 0.3).
 * No UI, no button — unlocks and autoplays seamlessly on first user click/touch
 * to comply with browser autoplay policies without blocking initial page load.
 */
export const BackgroundMusic: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef<boolean>(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    try {
      el.volume = BG_MUSIC_VOLUME;
    } catch {
      // Ignore read-only volume in non-standard environments
    }

    const detach = () => {
      document.removeEventListener('click', tryStartPlayback);
      document.removeEventListener('touchstart', tryStartPlayback);
    };

    function tryStartPlayback() {
      if (startedRef.current) {
        detach();
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;

      try {
        audio.volume = BG_MUSIC_VOLUME;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              startedRef.current = true;
              detach();
            })
            .catch(() => {
              // Browser still blocked autoplay or running in headless test env; keep listener active
            });
        } else {
          startedRef.current = true;
          detach();
        }
      } catch {
        // Safely ignore Audio API errors
      }
    }

    document.addEventListener('click', tryStartPlayback, { passive: true });
    document.addEventListener('touchstart', tryStartPlayback, { passive: true });

    return () => {
      detach();
    };
  }, []);

  return (
    <audio
      ref={audioRef}
      src={BG_MUSIC_SRC}
      loop
      preload="auto"
      hidden
      aria-hidden="true"
      data-testid="bg-music-audio"
      style={{ display: 'none' }}
    />
  );
};
