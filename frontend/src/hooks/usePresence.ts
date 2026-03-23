import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';

const AFK_TIMEOUT_MS = 60_000; // 1 minute
const ACTIVITY_THROTTLE_MS = 5_000; // Don't spam the server

/**
 * Tracks local tab activity and emits `activity` / `afk` events to the server via socket.
 * This must be called once per tab — the server aggregates status across all tabs.
 */
export function usePresence(socket: Socket | null) {
  const afkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityEmitRef = useRef<number>(0);
  const isAfkRef = useRef<boolean>(false);

  useEffect(() => {
    if (!socket) return;

    const emitActivity = () => {
      const now = Date.now();
      // Reset AFK timer
      if (afkTimerRef.current) clearTimeout(afkTimerRef.current);
      afkTimerRef.current = setTimeout(() => {
        isAfkRef.current = true;
        socket.emit('afk');
      }, AFK_TIMEOUT_MS);

      // Throttle activity events
      if (isAfkRef.current || now - lastActivityEmitRef.current > ACTIVITY_THROTTLE_MS) {
        isAfkRef.current = false;
        lastActivityEmitRef.current = now;
        socket.emit('activity');
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => window.addEventListener(event, emitActivity, { passive: true }));

    // Start the initial timer
    emitActivity();

    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, emitActivity));
      if (afkTimerRef.current) clearTimeout(afkTimerRef.current);
    };
  }, [socket]);
}
