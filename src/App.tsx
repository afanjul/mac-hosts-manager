import React, { useEffect, useState, useRef } from "react";
import "./styles/index.css";
import { Save, RefreshCw, Plus, Trash2, GripVertical } from "lucide-react";

// dnd-kit imports
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// SortableItem component for dnd-kit
function SortableItem({
  id,
  children,
  dragOverlay,
  disabled,
  ...props
}: {
  id: string | number;
  children: React.ReactNode;
  dragOverlay?: boolean;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    // transition, // Remove transition from destructuring
    isDragging,
    isSorting,
  } = useSortable({
    id,
    disabled,
    // Remove animateLayoutChanges for default behavior
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        `host-line`
      }
      {...props}
    >
      {/* Drag handle */}
      <div
        className="host-col-drag"
        style={{
          cursor: disabled ? "not-allowed" : "grab",
          opacity: disabled ? 0.3 : 1,
          display: "flex",
          alignItems: "center",
          padding: "0 6px",
          userSelect: "none",
        }}
        {...attributes}
        {...listeners}
        tabIndex={-1}
        title={disabled ? "" : "Drag to reorder"}
      >
        <GripVertical size={16} />
      </div>
      {children}
    </div>
  );
}

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

  // dnd-kit state
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
      setStatus("Saved");
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
    setStatus("Modified");
  }

  function deleteLine(idx: number) {
    setParsedLines((prev) => prev.filter((_, i) => i !== idx));
    setStatus("Modified");
  }

  function isComment(line: HostLine) {
    return line.type === "comment";
  }

  // Filtering logic
  const filtered = parsedLines
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
    });

  // For dnd-kit, use originalIdx as the id for each item
  const filteredIds = filtered.map(([_, originalIdx]) => originalIdx);

  // Drag end handler
  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    // Find the indices in filteredIds
    const oldIndex = filteredIds.indexOf(active.id);
    const newIndex = filteredIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) {
      setActiveId(null);
      return;
    }

    // Reorder filteredIds, then map back to parsedLines
    const newFilteredIds = arrayMove(filteredIds, oldIndex, newIndex);

    // Build new parsedLines array by moving the items in parsedLines according to newFilteredIds
    const newParsedLines = [...parsedLines];
    // Remove the items in filteredIds from newParsedLines
    const itemsToMove = filteredIds.map(idx => parsedLines[idx]);
    let insertionPoints = filteredIds.slice().sort((a, b) => b - a);
    for (const idx of insertionPoints) {
      newParsedLines.splice(idx, 1);
    }
    // Insert items back in new order at the position of the first filtered index
    const insertAt = Math.min(...filteredIds);
    newParsedLines.splice(insertAt, 0, ...newFilteredIds.map(idx => itemsToMove[filteredIds.indexOf(idx)]));

    // Update state BEFORE clearing activeId to avoid snap-back
    setParsedLines(newParsedLines);
    setStatus("Modified");
    setTimeout(() => setActiveId(null), 0); // Let React update before removing overlay
  }

  // Drag start handler
  function handleDragStart(event: any) {
    setActiveId(event.active.id);
  }

  // Drag cancel handler
  function handleDragCancel() {
    setActiveId(null);
  }

  // For DragOverlay, find the dragged item
  const activeItem =
    activeId != null
      ? (() => {
          const idx = filteredIds.indexOf(activeId as number);
          if (idx !== -1) {
            const [line, originalIdx] = filtered[idx];
            return { line, originalIdx };
          }
          return null;
        })()
      : null;

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="app-title">macOS Hosts Manager</h1>
        <div>
          <button onClick={loadHosts}>
            <RefreshCw size={16} /> Reload
          </button>
          <button
            onClick={saveHosts}
            className={status === "Modified" ? "pending-save" : ""}
          >
            <Save size={16} /> {status === "Modified" ? "Save *" : "Save"}
          </button>
        </div>
      </header>

      <main className="content-area">
        <div className="hosts-list" ref={hostsListRef}>
          <div className="host-header-wrapper sticky sticky-top">
            {/* Header row */}
            <div className="host-header-row">
              <div className="host-col-drag"></div>
              <div className="host-col-toggle"></div>
              <div className="host-col-ip">IP</div>
              <div className="host-col-domain">Domain</div>
              <div className="host-col-comment">Comment</div>
              <div className="host-col-actions"></div>
            </div>
            {/* Search row */}
            <div className="host-header-row search-row" style={{ background: "#f8f8f8" }}>
              <div className="host-col-drag"></div>
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
          {/* Filtered rows with drag-and-drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            // Use default modifiers, remove custom ones
          >
            <SortableContext
              items={filteredIds}
              strategy={verticalListSortingStrategy}
            >
              {filtered.map(([line, originalIdx], idx) => (
                <React.Fragment key={originalIdx}>
                  {/* Drop target before each row */}
                  <div
                    className="drop-target"
                    style={{ height: 16 }}
                    data-drop-index={idx}
                  />
                  <SortableItem
                    id={originalIdx}
                    disabled={filtered.length === 1}
                  >
                    {line.type === "entry" ? (
                      <>
                        {/* Toggle */}
                        <div className="host-col-toggle">
                          <input
                            type="checkbox"
                            checked={line.enabled}
                            onChange={e => {
                              const newLines = [...parsedLines];
                              newLines[originalIdx] = { ...line, enabled: e.target.checked };
                              setParsedLines(newLines);
                              setStatus("Modified");
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
                              setStatus("Modified");
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
                              setStatus("Modified");
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
                              setStatus("Modified");
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
                              setStatus("Modified");
                            }}
                            title="Delete"
                            tabIndex={-1}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
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
                              setStatus("Modified");
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
                              setStatus("Modified");
                            }}
                            title="Delete"
                            tabIndex={-1}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </SortableItem>
                </React.Fragment>
              ))}
              {/* Drop target after last row */}
              <div className="drop-target" style={{ height: 16 }} data-drop-index="end" />
            </SortableContext>
          </DndContext>
          <div className="add-actions-row sticky sticky-bottom">
            <button
              onClick={() => {
                setParsedLines([
                  ...parsedLines,
                  { type: "entry", ip: "", domain: "", comment: "", enabled: true }
                ]);
                setStatus("Modified");
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
                setStatus("Modified");
              }}
              className="add-line-btn"
            >
              <Plus size={16} /> Add Comment
            </button>
          </div>
        </div>
      </main>
      <footer className="footer">
        <span>{status}</span>
      </footer>
    </div>
  );
}

export default App;
