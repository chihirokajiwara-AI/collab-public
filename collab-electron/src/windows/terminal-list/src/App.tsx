import { useEffect, useState } from "react";
import "./App.css";

interface TerminalEntry {
  sessionId: string;
  shell: string;
  cwd: string;
  foreground: string | null;
  tileId: string;
}

function shellBasename(shell: string): string {
  return shell.split("/").pop() || shell;
}

function truncateCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 3) return cwd;
  return "\u2026/" + parts.slice(-2).join("/");
}

function isIdle(entry: TerminalEntry): boolean {
  if (!entry.foreground) return true;
  const base = shellBasename(entry.shell);
  return entry.foreground === base;
}

function App() {
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [focusedSessionId, setFocusedSessionId] =
    useState<string | null>(null);
  useEffect(() => {
    // Listen for messages from the shell renderer via webview.send()
    // These arrive on ipcRenderer.on() in the universal preload,
    // exposed via window.api.onTerminalListMessage.
    const cleanup = window.api.onTerminalListMessage(
      (channel: string, ...args: unknown[]) => {
        if (channel === "terminal-list:init") {
          const sessions = args[0] as TerminalEntry[];
          setEntries(sessions);
        } else if (channel === "terminal-list:add") {
          const entry = args[0] as TerminalEntry;
          setEntries((prev) => [...prev, entry]);
        } else if (channel === "terminal-list:remove") {
          const sessionId = args[0] as string;
          setEntries((prev) =>
            prev.filter((e) => e.sessionId !== sessionId),
          );
        } else if (channel === "terminal-list:focus") {
          const sessionId = args[0] as string | null;
          setFocusedSessionId(sessionId);
        } else if (channel === "pty-status-changed") {
          const payload = args[0] as {
            sessionId: string;
            foreground: string;
          };
          setEntries((prev) =>
            prev.map((e) =>
              e.sessionId === payload.sessionId
                ? { ...e, foreground: payload.foreground }
                : e,
            ),
          );
        } else if (channel === "pty-exit") {
          const payload = args[0] as { sessionId: string };
          setEntries((prev) =>
            prev.filter((e) => e.sessionId !== payload.sessionId),
          );
        }
      },
    );

    return cleanup;
  }, []);

  function handleClick(sessionId: string) {
    // sendToHost sends ipc-message to the <webview> tag in the shell renderer
    window.api.sendToHost("terminal-list:focus-tile", sessionId);
  }

  return (
    <div className="terminal-list">
      <div className="terminal-list-header">Terminals</div>
      {entries.map((entry) => {
        const idle = isIdle(entry);
        const focused = entry.sessionId === focusedSessionId;
        const stateClass = idle ? "idle" : "busy";
        const classes = [
          "terminal-entry",
          stateClass,
          focused ? "focused" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={entry.sessionId}
            className={classes}
            onClick={() => handleClick(entry.sessionId)}
          >
            <div className={`status-dot ${stateClass}`} />
            <div className="entry-info">
              <div className="entry-top">
                <span className="shell-name">
                  {shellBasename(entry.shell)}
                </span>
                <span className="status-label">
                  {idle
                    ? "idle"
                    : entry.foreground || "running"}
                </span>
              </div>
              <div className="entry-cwd">
                {truncateCwd(entry.cwd)}
              </div>
            </div>
          </div>
        );
      })}
      {entries.length === 0 && (
        <div
          style={{
            padding: "12px",
            color: "var(--muted, #666)",
            fontSize: "11px",
          }}
        >
          No terminals open
        </div>
      )}
    </div>
  );
}

export default App;
