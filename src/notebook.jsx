import React, { useRef, useState } from "react";
import RichText from "./rich-text.jsx";
import { attachFile, attachmentUrl, removeAttachment, formatSize } from "./files.js";

// Тетрадь предмета: блоки, которые вы называете сами, внутри — ветки (темы),
// внутри ветки — конспект с форматированием и прикреплённые файлы.
export default function Notebook({ blocks, onChange, prefix }) {
  const [openBlocks, setOpenBlocks] = useState({});
  const [openBranches, setOpenBranches] = useState({});
  const [title, setTitle] = useState("");

  const list = blocks || [];

  function addBlock() {
    if (!title.trim()) return;
    const id = "blk-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    onChange([...list, { id, title: title.trim(), branches: [] }]);
    setOpenBlocks((p) => ({ ...p, [id]: true }));
    setTitle("");
  }

  function patchBlock(id, patch) {
    onChange(list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function dropBlock(id) {
    onChange(list.filter((b) => b.id !== id));
  }

  function patchBranch(blockId, branchId, patch) {
    onChange(
      list.map((b) =>
        b.id === blockId ? { ...b, branches: b.branches.map((r) => (r.id === branchId ? { ...r, ...patch } : r)) } : b
      )
    );
  }

  function addBranch(blockId, name) {
    if (!name.trim()) return;
    const id = "brn-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    onChange(
      list.map((b) =>
        b.id === blockId ? { ...b, branches: [...b.branches, { id, title: name.trim(), html: "", files: [] }] } : b
      )
    );
    setOpenBranches((p) => ({ ...p, [id]: true }));
  }

  function dropBranch(blockId, branchId) {
    const branch = list.find((b) => b.id === blockId)?.branches.find((r) => r.id === branchId);
    (branch?.files || []).forEach((f) => removeAttachment(f).catch(() => {}));
    onChange(list.map((b) => (b.id === blockId ? { ...b, branches: b.branches.filter((r) => r.id !== branchId) } : b)));
  }

  return (
    <div style={styles.wrap}>
      {list.length === 0 && (
        <p style={styles.muted}>
          Блоков пока нет. Блок — это крупная часть курса, которую вы называете сами; внутри него ветки — темы
          занятий с конспектом и файлами.
        </p>
      )}

      {list.map((block) => {
        const open = openBlocks[block.id];
        return (
          <div key={block.id} style={styles.block}>
            <div style={styles.blockHead}>
              <button onClick={() => setOpenBlocks((p) => ({ ...p, [block.id]: !open }))} style={styles.chevron}>
                {open ? "▾" : "▸"}
              </button>
              <input
                value={block.title}
                onChange={(e) => patchBlock(block.id, { title: e.target.value })}
                style={styles.blockTitle}
              />
              <span style={styles.count}>{block.branches.length}</span>
              <button onClick={() => dropBlock(block.id)} style={styles.remove} title="Удалить блок">
                ×
              </button>
            </div>

            {open && (
              <div style={styles.branches}>
                {block.branches.map((branch) => (
                  <Branch
                    key={branch.id}
                    branch={branch}
                    prefix={prefix}
                    open={!!openBranches[branch.id]}
                    onToggle={() => setOpenBranches((p) => ({ ...p, [branch.id]: !p[branch.id] }))}
                    onPatch={(patch) => patchBranch(block.id, branch.id, patch)}
                    onRemove={() => dropBranch(block.id, branch.id)}
                  />
                ))}
                <AddRow placeholder="Название ветки — например: признаки государства" onAdd={(v) => addBranch(block.id, v)} />
              </div>
            )}
          </div>
        );
      })}

      <div style={styles.addBlockRow}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addBlock()}
          placeholder="Название блока — например: теория государства и права"
          style={styles.input}
        />
        <button onClick={addBlock} style={styles.addBtn} disabled={!title.trim()}>
          + Блок
        </button>
      </div>
    </div>
  );
}

export function Attachments({ files, onChange, prefix }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = files || [];

  async function onPick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const res = await attachFile(file, prefix);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange([...list, res.attachment]);
  }

  async function openFile(att) {
    const res = await attachmentUrl(att);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const a = document.createElement("a");
    a.href = res.url;
    a.download = att.name;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function drop(att) {
    removeAttachment(att).catch(() => {});
    onChange(list.filter((f) => f !== att));
  }

  return (
    <>
      {list.map((f, i) => (
        <div key={f.path || f.key || i} style={styles.fileRow}>
          <button onClick={() => openFile(f)} style={styles.fileLink}>
            {f.name}
          </button>
          <span style={styles.fileSize}>{formatSize(f.size)}</span>
          <button onClick={() => drop(f)} style={styles.remove} title="Убрать файл">
            ×
          </button>
        </div>
      ))}
      <div style={styles.fileActions}>
        <input ref={fileRef} type="file" onChange={onPick} style={{ display: "none" }} />
        <button onClick={() => fileRef.current.click()} style={styles.fileBtn} disabled={busy}>
          {busy ? "Загружаю…" : "+ файл"}
        </button>
        {error && <span style={styles.error}>{error}</span>}
      </div>
    </>
  );
}

function Branch({ branch, open, onToggle, onPatch, onRemove, prefix }) {
  const files = branch.files || [];

  return (
    <div style={styles.branch}>
      <div style={styles.branchHead}>
        <button onClick={onToggle} style={styles.chevron}>
          {open ? "▾" : "▸"}
        </button>
        <input value={branch.title} onChange={(e) => onPatch({ title: e.target.value })} style={styles.branchTitle} />
        {files.length > 0 && <span style={styles.count}>📎 {files.length}</span>}
        <button onClick={onRemove} style={styles.remove} title="Удалить ветку">
          ×
        </button>
      </div>

      {open && (
        <div style={styles.branchBody}>
          <RichText docId={branch.id} html={branch.html} onChange={(html) => onPatch({ html })} />
          <Attachments files={files} onChange={(next) => onPatch({ files: next })} prefix={prefix} />
        </div>
      )}
    </div>
  );
}

function AddRow({ placeholder, onAdd }) {
  const [value, setValue] = useState("");
  function submit() {
    if (!value.trim()) return;
    onAdd(value);
    setValue("");
  }
  return (
    <div style={styles.addRow}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        style={styles.input}
      />
      <button onClick={submit} style={styles.addBtnSmall} disabled={!value.trim()}>
        + Ветка
      </button>
    </div>
  );
}

const styles = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 },
  muted: { fontSize: 13, color: "#6B6656", lineHeight: 1.55, margin: 0 },
  block: { border: "1px solid #DCD5C4", borderRadius: 5, background: "#FBF9F4" },
  blockHead: { display: "flex", alignItems: "center", gap: 6, padding: "7px 8px" },
  blockTitle: {
    flex: 1,
    minWidth: 0,
    border: "1px solid transparent",
    background: "transparent",
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 15,
    fontWeight: 700,
    color: "#2B2822",
    padding: "2px 4px",
    borderRadius: 3,
  },
  branches: { padding: "0 8px 10px 20px", display: "flex", flexDirection: "column", gap: 8 },
  branch: { borderLeft: "2px solid #DCD5C4", paddingLeft: 8 },
  branchHead: { display: "flex", alignItems: "center", gap: 6 },
  branchTitle: {
    flex: 1,
    minWidth: 0,
    border: "1px solid transparent",
    background: "transparent",
    fontSize: 13.5,
    fontWeight: 600,
    color: "#2B2822",
    padding: "2px 4px",
    borderRadius: 3,
  },
  branchBody: { marginTop: 6, display: "flex", flexDirection: "column", gap: 6 },
  chevron: { background: "none", border: "none", padding: 0, fontSize: 12, color: "#8A8370", width: 14 },
  count: { fontSize: 11, color: "#8A8370" },
  remove: { background: "none", border: "none", color: "#8B4A4A", fontSize: 16, lineHeight: 1, padding: "0 4px" },
  addBlockRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  addRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 },
  input: { flex: "1 1 180px", minWidth: 0, padding: "6px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, background: "#fff" },
  addBtn: { border: "none", color: "#fff", background: "#2B2822", borderRadius: 4, padding: "6px 12px", fontSize: 13, fontWeight: 600 },
  addBtnSmall: { border: "none", color: "#fff", background: "#2B2822", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600 },
  fileRow: { display: "flex", alignItems: "center", gap: 8 },
  fileLink: { background: "none", border: "none", padding: 0, fontSize: 12.5, color: "#2F4E70", textDecoration: "underline", textAlign: "left" },
  fileSize: { fontSize: 11, color: "#8A8370" },
  fileActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  fileBtn: { border: "1px solid #C9C1AC", background: "#fff", borderRadius: 4, padding: "4px 9px", fontSize: 12, color: "#5A5347" },
  error: { fontSize: 11.5, color: "#8B4A4A" },
};
