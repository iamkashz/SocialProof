import { useCallback, useEffect, useState } from "react";

export type ScanStatus = "idle" | "streaming" | "done" | "error";

/**
 * Module-level guard, NOT a component-level ref.
 *
 * React 19 StrictMode in dev double-mounts every component to surface bugs:
 * effect runs → cleanup runs → effect runs again. With a component-level
 * `useRef`, the ref persists across the unmount/remount, so the second
 * effect run skips — but the first fetch was already aborted by the
 * cleanup in between, leaving the page stuck at "Spinning up agents…".
 *
 * Keying by sessionId at module scope means: each sessionId starts exactly
 * one fetch, regardless of how many times the component mounts. Different
 * scans use different sessionIds (generated in ScanInput) so they don't
 * collide.
 */
const startedSessions = new Set<string>();

export type AgentPart = {
  id: string;
  toolName: string;
  state: "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
};

export type ScanWarning = string;

type AdkEvent =
  | { type: "start"; session_id: string }
  | { type: "cached"; cached_at: string | null }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_response"; id: string; name: string; output: unknown; input?: unknown }
  | { type: "text"; delta: string }
  | { type: "final"; text: string }
  | { type: "warning"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Drives a single OSINT scan against the Python ADK FastAPI endpoint and
 * exposes the same shape (`agentParts`, `assistantText`, `status`) that the
 * UI previously consumed from the AI SDK's `useChat`.
 */
export function useAdkScan(
  email: string,
  sessionId: string,
  opts: { forceFresh?: boolean; apiUrl?: string; enabled?: boolean } = {},
) {
  const { forceFresh = false, apiUrl = "/api/scan", enabled = true } = opts;
  const [agentParts, setAgentParts] = useState<AgentPart[]>([]);
  const [assistantText, setAssistantText] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const handleEvent = useCallback((ev: AdkEvent) => {
    if (ev.type === "tool_call") {
      setAgentParts((prev) => [
        ...prev,
        {
          id: ev.id,
          toolName: ev.name,
          state: "input-available",
          input: ev.args,
        },
      ]);
    } else if (ev.type === "tool_response") {
      setAgentParts((prev) => {
        const idx = prev.findIndex((p) => p.id === ev.id);
        const next: AgentPart = {
          id: ev.id,
          toolName: ev.name,
          state: "output-available",
          input: ev.input ?? (idx >= 0 ? prev[idx].input : undefined),
          output: ev.output,
        };
        if (idx < 0) return [...prev, next];
        const updated = prev.slice();
        updated[idx] = next;
        return updated;
      });
    } else if (ev.type === "text") {
      setAssistantText((prev) => prev + ev.delta);
    } else if (ev.type === "final") {
      setAssistantText(ev.text);
    } else if (ev.type === "cached") {
      setCachedAt(ev.cached_at);
    } else if (ev.type === "warning") {
      setWarningMessage(ev.message);
    } else if (ev.type === "error") {
      setErrorMessage(ev.message);
      setStatus("error");
    } else if (ev.type === "done") {
      setStatus((s) => (s === "error" ? s : "done"));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // StrictMode-safe: if a fetch is already in flight for this sessionId,
    // skip. The original abort-on-unmount pattern collided with StrictMode's
    // mount → unmount → remount cycle, killing the only fetch we'd ever make.
    if (startedSessions.has(sessionId)) return;
    startedSessions.add(sessionId);

    (async () => {
      setStatus("streaming");
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            session_id: sessionId,
            force_fresh: forceFresh,
          }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`Scan request failed: ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line. Process complete frames only.
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                handleEvent(JSON.parse(payload) as AdkEvent);
              } catch (parseErr) {
                console.warn("Bad SSE frame", payload, parseErr);
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setErrorMessage((err as Error).message);
        setStatus("error");
      }
    })();

    // No abort cleanup: the dev-mode StrictMode double-mount would otherwise
    // kill the only fetch. The scan runs to completion in the background; a
    // user navigating away just drops the response.
  }, [apiUrl, email, sessionId, forceFresh, enabled, handleEvent]);

  return { agentParts, assistantText, status, errorMessage, warningMessage, cachedAt };
}
