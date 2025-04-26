import React, { useEffect, useState, useRef } from "react";
import "./styles/index.css";
import { Save, RefreshCw, Plus, Trash2 } from "lucide-react";

type HostLine =
  | { type: "entry"; ip: string; domain: string; comment?: string; enabled: boolean }
  | { type: "comment"; text: string };

function parseHosts(content: string): HostLine[] {
  // Strict IP regex for IPv4 and IPv6
  const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$|^(?:[a-fA-F0-9:]+:+)+[a-fA-F0-9]+$/;
  const lines = content.split(/\r?\n/);
  const result: HostLine[] = [];
  let commentBlock: string[] = [];

  const flushCommentBlock = () => {
    if (commentBlock.length > 0) {
      result.push({ type: "comment", text: commentBlock.join("\n") });
      commentBlock = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flushCommentBlock();
      continue;
    }
    if (trimmed.startsWith("#")) {
      // Try to parse as a disabled entry ONLY if the uncommented part matches the host entry regex
      const uncommented = trimmed.replace(/^#+\s*/, "");
      const entryMatch = uncommented.match(
        /^([^\s#]+)\s+([^\s#]+)(?:\s*#\s*(.*))?$/
      );
      if (
        entryMatch &&
        ipRegex.test(entryMatch[1])
      ) {
        // Only treat as disabled entry if the first field is a valid IP address
        flushCommentBlock();
        const [, ip, domain, comment] = entryMatch;
        const entry: HostLine = {
          type: "entry",
          ip,
          domain,
          enabled: false,
        };
        if (comment) entry.comment = comment;
        result.push(entry);
      } else {
        // Otherwise, treat as part of a comment block
        commentBlock.push(line);
      }
      continue;
    }
    flushCommentBlock();
    // Parse host entry: [ip] [domain] [# comment]
    const match = line.match(
      /^([^\s#]+)\s+([^\s#]+)(?:\s*#\s*(.*))?$/
    );
    if (match) {
      const [, ip, domain, comment] = match;
      const entry: HostLine = {
        type: "entry",
        ip,
        domain,
        enabled: true,
      };
      if (comment) entry.comment = comment;
      result.push(entry);
    } else {
      // If line is not a comment and doesn't match entry, treat as a comment block for safety
      result.push({ type: "comment", text: line });
    }
  }
  flushCommentBlock();
  return result;
}

const DEFAULT_PLACEHOLDER = "# macOS Hosts Manager";

function App() {
  const [hostsContent, setHostsContent] = useState("");
  const [parsedLines, setParsedLines] = useState<HostLine[]>([]);
  const [status, setStatus] = useState("");
  // Search fields for filtering
  const [searchIp, setSearchIp] = useState("");
  const [searchDomain, setSearchDomain] = useState("");
  const [searchComment, setSearchComment] = useState("");
  // Scroll to bottom when a new entry is added
  useEffect(() => {
    if (parsedLines.length > 0) {
      const last = parsedLines[parsedLines.length - 1];
      if (
        (last.type === "entry" && last.ip === "" && last.domain === "") ||
        (last.type === "comment" && last.text.trim() === "#")
      ) {
        if (hostsListRef.current) {
          hostsListRef.current.scrollTop = hostsListRef.current.scrollHeight;
        }
      }
    }
  }, [parsedLines]);
  const hostsListRef = useRef<HTMLDivElement>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  async function loadHosts() {
    setStatus("Loading...");
    if (!window.hostsAPI) {
      setStatus("Not in Electron.");
      return;
    }
    const res = await window.hostsAPI.loadHosts();
    if (res.success) {
      setHostsContent(res.content!);
      setParsedLines(parseHosts(res.content!));
      setHasUnsavedChanges(false);
      setStatus("Loaded.");
    } else {
      setStatus("Error: " + res.error);
    }
  }

  async function saveHosts() {
    setStatus("Saving...");
    // Serialize parsedLines to hosts file format
    const content = parsedLines.map(l => {
      if (l.type === "entry") {
        const base = `${l.ip} ${l.domain}`;
        const lineStr =
          l.comment && l.comment.trim() !== ""
            ? `${base} # ${l.comment}`
            : base;
        return l.enabled ? lineStr : `# ${lineStr}`;
      } else if (l.type === "comment") {
        return l.text;
      }
      return "";
    }).join("\n");
    const res = await window.hostsAPI.saveHosts(content);
    if (res.success) {
      setStatus("Saved successfully.");
      setHasUnsavedChanges(false);
    } else {
      setStatus("Error: " + res.error);
    }
  }

  useEffect(() => {
    loadHosts();
  }, []);


  function addLine() {
    setParsedLines((prev) => [
      ...prev,
      { type: "entry", ip: "", domain: "", enabled: true }
    ]);
  }

  function deleteLine(idx: number) {
    setParsedLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function isComment(line: HostLine) {
    return line.type === "comment";
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>macOS Hosts Manager</h1>
        <div>
          <button onClick={loadHosts}>
            <RefreshCw size={16} /> Reload
          </button>
          <button
            onClick={saveHosts}
            className={hasUnsavedChanges ? "pending-save" : ""}
          >
            <Save size={16} /> Save
          </button>
        </div>
      </header>

      <main className="content-area">
        <div className="hosts-list" ref={hostsListRef}>
          <div className="host-header-wrapper sticky sticky-top">
            {/* Header row */}
            <div className="host-header-row">
              <div className="host-col-toggle"></div>
              <div className="host-col-ip">IP</div>
              <div className="host-col-domain">Domain</div>
              <div className="host-col-comment">Comment</div>
              <div className="host-col-actions"></div>
            </div>
            {/* Search row */}
            <div className="host-header-row search-row" style={{ background: "#f8f8f8" }}>
              <div className="host-col-toggle"></div>
              <div className="host-col-ip">
                <input
                  className="monospace"
                  type="text"
                  value={searchIp}
                  onChange={e => setSearchIp(e.target.value)}
                  placeholder="Search IP"
                  style={{ width: "100%" }}
                  spellCheck={false}
                />
              </div>
              <div className="host-col-domain">
                <input
                  className="monospace"
                  type="text"
                  value={searchDomain}
                  onChange={e => setSearchDomain(e.target.value)}
                  placeholder="Search Domain"
                  style={{ width: "100%" }}
                  spellCheck={false}
                />
              </div>
              <div className="host-col-comment">
                <input
                  className="monospace"
                  type="text"
                  value={searchComment}
                  onChange={e => setSearchComment(e.target.value)}
                  placeholder="Search Comment"
                  style={{ width: "100%" }}
                  spellCheck={false}
                />
              </div>
              <div className="host-col-actions"></div>
            </div>
          </div>
          {parsedLines.length === 0 && (
            <div style={{ opacity: 0.4, fontStyle: "italic", padding: 12 }}>
              (hosts file is empty)
            </div>
          )}
          {/* Filtered rows */}
          {parsedLines
            .map((line, originalIdx) => [line, originalIdx] as const)
            .filter(([line]) => {
              if (line.type !== "entry") return true; // Show comments always
              // Case-insensitive, partial match for each field
              const ipMatch =
                searchIp.trim() === "" ||
                line.ip.toLowerCase().includes(searchIp.trim().toLowerCase());
              const domainMatch =
                searchDomain.trim() === "" ||
                line.domain.toLowerCase().includes(searchDomain.trim().toLowerCase());
              const commentMatch =
                searchComment.trim() === "" ||
                (line.comment ?? "").toLowerCase().includes(searchComment.trim().toLowerCase());
              return ipMatch && domainMatch && commentMatch;
            })
            .map(([line, originalIdx]) => {
              if (line.type === "entry") {
                return (
                  <div key={originalIdx} className="host-line">
                    {/* Toggle */}
                    <div className="host-col-toggle">
                      <input
                        type="checkbox"
                        checked={line.enabled}
                        onChange={e => {
                          const newLines = [...parsedLines];
                          newLines[originalIdx] = { ...line, enabled: e.target.checked };
                          setParsedLines(newLines);
                          setHasUnsavedChanges(true);
                        }}
                        title={line.enabled ? "Enabled" : "Disabled"}
                      />
                    </div>
                    {/* IP */}
                    <div className="host-col-ip">
                      <input
                        className="monospace"
                        value={line.ip}
                        onChange={e => {
                          const newLines = [...parsedLines];
                          newLines[originalIdx] = { ...line, ip: e.target.value };
                          setParsedLines(newLines);
                          setHasUnsavedChanges(true);
                        }}
                        spellCheck={false}
                        placeholder="IP"
                      />
                    </div>
                    {/* Domain */}
                    <div className="host-col-domain">
                      <input
                        className="monospace"
                        value={line.domain}
                        onChange={e => {
                          const newLines = [...parsedLines];
                          newLines[originalIdx] = { ...line, domain: e.target.value };
                          setParsedLines(newLines);
                          setHasUnsavedChanges(true);
                        }}
                        spellCheck={false}
                        placeholder="Domain"
                      />
                    </div>
                    {/* Comment */}
                    <div className="host-col-comment">
                      <input
                        className="monospace"
                        value={line.comment ?? ""}
                        onChange={e => {
                          const newLines = [...parsedLines];
                          newLines[originalIdx] = { ...line, comment: e.target.value };
                          setParsedLines(newLines);
                          setHasUnsavedChanges(true);
                        }}
                        spellCheck={false}
                        placeholder="Comment"
                      />
                    </div>
                    {/* Actions */}
                    <div className="host-col-actions">
                      <button
                        onClick={() => {
                          setParsedLines(parsedLines.filter((_, i) => i !== originalIdx));
                          setHasUnsavedChanges(true);
                        }}
                        title="Delete"
                        tabIndex={-1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              } else if (line.type === "comment") {
                return (
                  <div key={originalIdx} className="host-line host-line-comment">
                    {/* Toggle (hidden/disabled for comments) */}
                    <div className="host-col-toggle"></div>
                    {/* Comment textarea */}
                    <div className="host-col-ip host-col-domain host-col-comment" style={{ flex: 1 }}>
                      <textarea
                        className="monospace comment-textarea"
                        value={line.text}
                        rows={Math.max(1, line.text.split('\n').length)}
                        onChange={e => {
                          const newLines = [...parsedLines];
                          newLines[originalIdx] = { ...line, text: e.target.value };
                          setParsedLines(newLines);
                          setHasUnsavedChanges(true);
                        }}
                        spellCheck={false}
                        placeholder="# Comment"
                      />
                    </div>
                    {/* Actions */}
                    <div className="host-col-actions">
                      <button
                        onClick={() => {
                          setParsedLines(parsedLines.filter((_, i) => i !== originalIdx));
                          setHasUnsavedChanges(true);
                        }}
                        title="Delete"
                        tabIndex={-1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              } else {
                return null;
              }
            })}
            <div className="add-actions-row sticky sticky-bottom">
              <button
                onClick={() => {
                  setParsedLines([
                    ...parsedLines,
                    { type: "entry", ip: "", domain: "", comment: "", enabled: true }
                  ]);
                  setHasUnsavedChanges(true);
                }}
                className="add-line-btn"
              >
                <Plus size={16} /> Add Entry
              </button>
              <button
                onClick={() => {
                  setParsedLines([
                    ...parsedLines,
                    { type: "comment", text: "# " }
                  ]);
                  setHasUnsavedChanges(true);
                }}
                className="add-line-btn"
              >
                <Plus size={16} /> Add Comment block
              </button>
            </div>
        </div>
        <div className="status">{status}</div>
        
        
      </main>
    </div>
  );
}

export default App;
