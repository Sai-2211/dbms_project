import type { Actor } from "../server/resources";
import { useEffect, useRef, useState } from "react";
import { api, authenticatedFetch, sessionExpired } from "./api";
export function useLiveUpdates(onChange: () => void) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">(
    "connecting",
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let sequence = 0;
    async function refresh() {
      const current = ++sequence;
      try {
        const actor = await api<Actor>("/auth/me", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted && current === sequence)
          window.dispatchEvent(
            new CustomEvent("landledger:actor", { detail: actor }),
          );
      } catch {
        /* The regular request handler handles an expired session. */
      }
      if (!controller.signal.aborted && current === sequence)
        callback.current();
    }
    async function connect() {
      try {
        const response = await authenticatedFetch("/events", {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });
        if (response.status === 401) return;
        if (!response.ok || !response.body)
          throw new Error("Live connection unavailable.");
        setStatus("live");
        delay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder
            .decode(value, { stream: true })
            .replaceAll("\r\n", "\n");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (event.startsWith("event: signed-out")) {
              sessionExpired();
              return;
            }
            if (event.startsWith("event: refresh")) void refresh();
          }
        }
      } catch {
        /* A dropped stream reconnects and refreshes authorized data. */
      }
      if (!controller.signal.aborted) {
        setStatus("reconnecting");
        timer = setTimeout(() => void connect(), delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    void connect();
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, []);
  return status;
}
