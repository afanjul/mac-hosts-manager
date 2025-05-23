import React, { useEffect, useState, useRef, useCallback } from "react";
import "./styles/index.css";
import "./styles/macos.css";
import { 
  Save, 
  RefreshCw, 
  Plus, 
  Trash2, 
  GripVertical, 
  Info, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Search, 
  X, 
  Settings, 
  HelpCircle,
  Moon,
  Sun,
  Command,
  Keyboard
} from "lucide-react";

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
    isDragging,
    isSorting,
  } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    boxShadow: isDragging ? 'var(--macos-shadow-strong)' : 'none',
    position: isDragging ? 'relative' : 'static',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`host-line ${isDragging ? 'dragging' : ''}`}
      {...props}
    >
      {/* Drag handle */}
      <div
        className="host-col-drag macos-tooltip"
        style={{
          cursor: disabled ? "not-allowed" : "grab",
          opacity: disabled ? 0.3 : 0.6,
          display: "flex",
          alignItems: "center",
          padding: "0 6px",
          userSelect: "none",
        }}
        {...attributes}
        {...listeners}
        tabIndex={-1}
        data-tooltip={disabled ? "Sorting disabled" : "Drag to reorder"}
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
  // UI state
  const [darkMode, setDarkMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{show: boolean, message: string, onConfirm: () => void} | null>(null);
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
    confirmAction(
      "Are you sure you want to delete this entry?",
      () => {
        setParsedLines((prev) => prev.filter((_, i) => i !== idx));
        setStatus("Modified");
      }
    );
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

  // Status indicator component
  const StatusIndicator = ({ status }: { status: string }) => {
    if (status === "Loading..." || status === "Saving...") {
      return (
        <div className="status-indicator">
          <RefreshCw size={14} className="animate-spin" />
          <span>{status}</span>
        </div>
      );
    } else if (status === "Loaded" || status === "Saved") {
      return (
        <div className="status-indicator success">
          <CheckCircle2 size={14} />
          <span>{status}</span>
        </div>
      );
    } else if (status === "Modified") {
      return (
        <div className="status-indicator warning">
          <AlertCircle size={14} />
          <span>Unsaved Changes</span>
        </div>
      );
    } else if (status.startsWith("Error")) {
      return (
        <div className="status-indicator error">
          <AlertCircle size={14} />
          <span>{status}</span>
        </div>
      );
    }
    return (
      <div className="status-indicator">
        <Info size={14} />
        <span>{status}</span>
      </div>
    );
  };

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);

  // Show help dialog
  const openHelp = useCallback(() => {
    setShowHelp(true);
  }, []);

  // Close help dialog
  const closeHelp = useCallback(() => {
    setShowHelp(false);
  }, []);

  // Confirm dialog
  const confirmAction = useCallback((message: string, onConfirm: () => void) => {
    setShowConfirmDialog({ show: true, message, onConfirm });
  }, []);

  // Close confirm dialog
  const closeConfirmDialog = useCallback(() => {
    setShowConfirmDialog(null);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveHosts();
      }
      // Command+R or Ctrl+R to reload
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        loadHosts();
      }
      // Command+D or Ctrl+D to toggle dark mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        toggleDarkMode();
      }
      // Command+N or Ctrl+N to add new entry
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        addLine();
      }
      // Command+/ or Ctrl+/ to show help
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        openHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [saveHosts, loadHosts, toggleDarkMode, addLine, openHelp]);

  return (
    <div className={`app-container ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <div className="app-title-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={20} />
          <h1 className="app-title">Hosts Manager</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <StatusIndicator status={status} />
          <button 
            className="macos-button macos-button-secondary" 
            onClick={loadHosts}
            title="Reload hosts file (⌘R)"
          >
            <RefreshCw size={16} /> Reload
          </button>
          <button
            onClick={saveHosts}
            className={`macos-button ${status === "Modified" ? "pending-save" : ""}`}
            title="Save changes (⌘S)"
          >
            <Save size={16} /> {status === "Modified" ? "Save Changes" : "Save"}
          </button>
          <button
            onClick={toggleDarkMode}
            className="macos-button macos-button-icon"
            title="Toggle dark mode (⌘D)"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={openHelp}
            className="macos-button macos-button-icon"
            title="Help (⌘/)"
          >
            <HelpCircle size={16} />
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
              <div className="host-col-ip">IP Address</div>
              <div className="host-col-domain">Domain</div>
              <div className="host-col-comment">Comment</div>
              <div className="host-col-actions"></div>
            </div>
            {/* Search row */}
            <div className="host-header-row search-row">
              <div className="host-col-drag"></div>
              <div className="host-col-toggle"></div>
              <div className="host-col-ip">
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--macos-text-secondary)' }} />
                  <input
                    className="macos-input"
                    type="text"
                    value={searchIp}
                    onChange={e => setSearchIp(e.target.value)}
                    placeholder="Filter by IP"
                    style={{ width: '100%', paddingLeft: '32px' }}
                    spellCheck={false}
                  />
                  {searchIp && (
                    <button 
                      onClick={() => setSearchIp('')}
                      style={{ 
                        position: 'absolute', 
                        right: '8px', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '50%'
                      }}
                    >
                      <X size={14} style={{ color: 'var(--macos-text-secondary)' }} />
                    </button>
                  )}
                </div>
              </div>
              <div className="host-col-domain">
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--macos-text-secondary)' }} />
                  <input
                    className="macos-input"
                    type="text"
                    value={searchDomain}
                    onChange={e => setSearchDomain(e.target.value)}
                    placeholder="Filter by domain"
                    style={{ width: '100%', paddingLeft: '32px' }}
                    spellCheck={false}
                  />
                  {searchDomain && (
                    <button 
                      onClick={() => setSearchDomain('')}
                      style={{ 
                        position: 'absolute', 
                        right: '8px', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '50%'
                      }}
                    >
                      <X size={14} style={{ color: 'var(--macos-text-secondary)' }} />
                    </button>
                  )}
                </div>
              </div>
              <div className="host-col-comment">
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--macos-text-secondary)' }} />
                  <input
                    className="macos-input"
                    type="text"
                    value={searchComment}
                    onChange={e => setSearchComment(e.target.value)}
                    placeholder="Filter by comment"
                    style={{ width: '100%', paddingLeft: '32px' }}
                    spellCheck={false}
                  />
                  {searchComment && (
                    <button 
                      onClick={() => setSearchComment('')}
                      style={{ 
                        position: 'absolute', 
                        right: '8px', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '50%'
                      }}
                    >
                      <X size={14} style={{ color: 'var(--macos-text-secondary)' }} />
                    </button>
                  )}
                </div>
              </div>
              <div className="host-col-actions"></div>
            </div>
          </div>
          {parsedLines.length === 0 && (
            <div className="empty-state">
              <FileText size={48} />
              <h3>No Entries Found</h3>
              <p>Your hosts file is empty. Add an entry to get started.</p>
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
                            className="macos-checkbox"
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
                            className="macos-input"
                            value={line.ip}
                            onChange={e => {
                              const newLines = [...parsedLines];
                              newLines[originalIdx] = { ...line, ip: e.target.value };
                              setParsedLines(newLines);
                              setStatus("Modified");
                            }}
                            spellCheck={false}
                            placeholder="Enter IP address"
                          />
                        </div>
                        {/* Domain */}
                        <div className="host-col-domain">
                          <input
                            className="macos-input"
                            value={line.domain}
                            onChange={e => {
                              const newLines = [...parsedLines];
                              newLines[originalIdx] = { ...line, domain: e.target.value };
                              setParsedLines(newLines);
                              setStatus("Modified");
                            }}
                            spellCheck={false}
                            placeholder="Enter domain name"
                          />
                        </div>
                        {/* Comment */}
                        <div className="host-col-comment">
                          <input
                            className="macos-input"
                            value={line.comment ?? ""}
                            onChange={e => {
                              const newLines = [...parsedLines];
                              newLines[originalIdx] = { ...line, comment: e.target.value };
                              setParsedLines(newLines);
                              setStatus("Modified");
                            }}
                            spellCheck={false}
                            placeholder="Optional comment"
                          />
                        </div>
                        {/* Actions */}
                        <div className="host-col-actions">
                          <button
                            onClick={() => {
                              setParsedLines(parsedLines.filter((_, i) => i !== originalIdx));
                              setStatus("Modified");
                            }}
                            className="action-button danger macos-tooltip"
                            data-tooltip="Delete entry"
                            tabIndex={-1}
                          >
                            <Trash2 size={16} />
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
                            className="macos-textarea"
                            value={line.text}
                            rows={Math.max(1, line.text.split('\n').length)}
                            onChange={e => {
                              const newLines = [...parsedLines];
                              newLines[originalIdx] = { ...line, text: e.target.value };
                              setParsedLines(newLines);
                              setStatus("Modified");
                            }}
                            spellCheck={false}
                            placeholder="# Add your comment here"
                          />
                        </div>
                        {/* Actions */}
                        <div className="host-col-actions">
                          <button
                            onClick={() => {
                              setParsedLines(parsedLines.filter((_, i) => i !== originalIdx));
                              setStatus("Modified");
                            }}
                            className="action-button danger macos-tooltip"
                            data-tooltip="Delete comment"
                            tabIndex={-1}
                          >
                            <Trash2 size={16} />
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
                // Scroll to the bottom after adding a new entry
                setTimeout(() => {
                  if (hostsListRef.current) {
                    hostsListRef.current.scrollTop = hostsListRef.current.scrollHeight;
                  }
                }, 100);
              }}
              className="macos-button"
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
                // Scroll to the bottom after adding a new comment
                setTimeout(() => {
                  if (hostsListRef.current) {
                    hostsListRef.current.scrollTop = hostsListRef.current.scrollHeight;
                  }
                }, 100);
              }}
              className="macos-button macos-button-secondary"
            >
              <Plus size={16} /> Add Comment
            </button>
            
            {/* Help button */}
            <div style={{ marginLeft: 'auto' }}>
              <button 
                className="action-button macos-tooltip" 
                data-tooltip="Help & Information"
                onClick={() => {
                  alert("Hosts Manager Help\n\n• Drag entries to reorder them\n• Toggle checkbox to enable/disable entries\n• Use the search filters to find specific entries\n• Changes are not saved until you click 'Save'");
                }}
              >
                <HelpCircle size={16} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Add an info section */}
        {parsedLines.length > 0 && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px 16px', 
            background: 'rgba(0, 113, 227, 0.05)', 
            borderRadius: 'var(--macos-radius-sm)', 
            fontSize: '13px',
            color: 'var(--macos-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Info size={16} />
            <div>
              <strong>Tip:</strong> Changes to your hosts file require administrator privileges and will only take effect after saving.
            </div>
          </div>
        )}
      </main>
      <footer className="footer">
        <div className="status-indicator">
          <FileText size={14} />
          <span>Hosts file: /etc/hosts</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <StatusIndicator status={status} />
        </div>
      </footer>

      {/* Help Dialog */}
      {showHelp && (
        <div className="help-dialog">
          <div className="help-dialog-content">
            <button className="help-dialog-close" onClick={closeHelp}>
              <X size={16} />
            </button>
            <h2>Hosts Manager Help</h2>
            <p>
              Hosts Manager is a simple tool to manage your system's hosts file. 
              It allows you to easily add, edit, and remove host entries.
            </p>
            
            <h3>Keyboard Shortcuts</h3>
            <ul>
              <li><div className="keyboard-shortcut"><Command size={14} /><span>S</span></div> Save changes</li>
              <li><div className="keyboard-shortcut"><Command size={14} /><span>R</span></div> Reload hosts file</li>
              <li><div className="keyboard-shortcut"><Command size={14} /><span>D</span></div> Toggle dark mode</li>
              <li><div className="keyboard-shortcut"><Command size={14} /><span>N</span></div> Add new entry</li>
              <li><div className="keyboard-shortcut"><Command size={14} /><span>/</span></div> Show this help</li>
            </ul>
            
            <h3>Features</h3>
            <ul>
              <li>Drag and drop to reorder entries</li>
              <li>Enable/disable entries with the checkbox</li>
              <li>Filter entries by IP, domain, or comment</li>
              <li>Add comments to document your hosts file</li>
              <li>Dark mode support</li>
            </ul>
            
            <h3>About</h3>
            <p>
              Hosts Manager for macOS is an open-source tool designed to make editing your hosts file easier.
              Changes to your hosts file require administrator privileges and will only take effect after saving.
            </p>
            
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="macos-button" onClick={closeHelp}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="confirm-dialog">
          <div className="confirm-dialog-content">
            <h3 className="confirm-dialog-title">Confirm Action</h3>
            <p className="confirm-dialog-message">{showConfirmDialog.message}</p>
            <div className="confirm-dialog-actions">
              <button 
                className="macos-button macos-button-secondary" 
                onClick={closeConfirmDialog}
              >
                Cancel
              </button>
              <button 
                className="macos-button" 
                onClick={() => {
                  showConfirmDialog.onConfirm();
                  closeConfirmDialog();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
