import React, { useRef, useState } from "react";
import RichText from "./rich-text.jsx";
import Collapsible from "./collapsible.jsx";
import { attachFile, attachmentUrl, removeAttachment, formatSize } from "./files.js";

// Тетрадь предмета: блоки, которые вы называете сами, внутри — ветки (темы),
// внутри ветки — конспект с форматированием и прикреплённые файлы.
// Пустую ветку не о чем предупреждать: ни текста, ни файлов — терять нечего.
function isBranchEmpty(branch) {
  const text = String(branch.html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return !text && !(branch.files || []).length;
}

function isBlockEmpty(block) {
  const branches = block.branches || [];
  return branches.length === 0 || branches.every(isBranchEmpty);
}

function branchFiles(branch) {
  return branch.files || [];
}

export default function Notebook({ blocks, onChange, onUndo, prefix }) {
  const [openBlocks, setOpenBlocks] = useState({});
  const [openBranches, setOpenBranches] = useState({});
  const [title, setTitle] = useState("");

  const list = blocks || [];

  // Правки считаются от текущей тетради, а не от той, что была на экране при
  // нажатии: пока грузился файл, в ней могли появиться ветки и текст.
  function update(fn) {
    onChange((prev) => fn(prev || []));
  }

  function addBlock() {
    if (!title.trim()) return;
    const id = "blk-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    const name = title.trim();
    update((cur) => [...cur, { id, title: name, branches: [] }]);
    setOpenBlocks((p) => ({ ...p, [id]: true }));
    setTitle("");
  }

  function patchBlock(id, patch) {
    update((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function dropBlock(id) {
    const index = list.findIndex((b) => b.id === id);
    if (index === -1) return;
    const block = list[index];
    update((cur) => cur.filter((b) => b.id !== id));

    const files = (block.branches || []).flatMap(branchFiles);
    if (isBlockEmpty(block)) {
      files.forEach((f) => removeAttachment(f).catch(() => {}));
      return;
    }
    if (!onUndo) return;
    onUndo(
      `Вы удалили блок «${block.title}»`,
      () => {
        update((cur) => {
          const next = cur.filter((b) => b.id !== id);
          next.splice(Math.min(index, next.length), 0, block);
          return next;
        });
      },
      () => files.forEach((f) => removeAttachment(f).catch(() => {}))
    );
  }

  // patch — объект или функция от текущей ветки.
  function patchBranch(blockId, branchId, patch) {
    update((cur) =>
      cur.map((b) =>
        b.id === blockId
          ? {
              ...b,
              branches: (b.branches || []).map((r) =>
                r.id === branchId ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r
              ),
            }
          : b
      )
    );
  }

  function addBranch(blockId, name) {
    if (!name.trim()) return;
    const id = "brn-" + Date.now() + "-" + Math.round(Math.random() * 1000);
    const branchTitle = name.trim();
    update((cur) =>
      cur.map((b) =>
        b.id === blockId ? { ...b, branches: [...(b.branches || []), { id, title: branchTitle, html: "", files: [] }] } : b
      )
    );
    setOpenBranches((p) => ({ ...p, [id]: true }));
  }

  function dropBranch(blockId, branchId) {
    const block = list.find((b) => b.id === blockId);
    const branches = (block && block.branches) || [];
    const index = branches.findIndex((r) => r.id === branchId);
    if (index === -1) return;
    const branch = branches[index];
    update((cur) =>
      cur.map((b) => (b.id === blockId ? { ...b, branches: (b.branches || []).filter((r) => r.id !== branchId) } : b))
    );

    const files = branchFiles(branch);
    if (isBranchEmpty(branch)) {
      files.forEach((f) => removeAttachment(f).catch(() => {}));
      return;
    }
    if (!onUndo) return;
    onUndo(
      `Вы удалили ветку «${branch.title}»`,
      () => {
        update((cur) =>
          cur.map((b) => {
            if (b.id !== blockId) return b;
            const next = (b.branches || []).filter((r) => r.id !== branchId);
            next.splice(Math.min(index, next.length), 0, branch);
            return { ...b, branches: next };
          })
        );
      },
      () => files.forEach((f) => removeAttachment(f).catch(() => {}))
    );
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
              <button
                onClick={() => setOpenBlocks((p) => ({ ...p, [block.id]: !open }))}
                className="ap-row"
                style={styles.chevron}
                aria-expanded={!!open}
                aria-label={(open ? "Свернуть блок: " : "Раскрыть блок: ") + block.title}
              >
                {open ? "▾" : "▸"}
              </button>
              <input
                value={block.title}
                onChange={(e) => patchBlock(block.id, { title: e.target.value })}
                style={styles.blockTitle}
              />
              <span style={styles.count}>{block.branches.length}</span>
              <button onClick={() => dropBlock(block.id)} className="ap-row" style={styles.remove} title="Удалить блок" aria-label={"Удалить блок: " + block.title}>
                ×
              </button>
            </div>

            <Collapsible open={open}>
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
            </Collapsible>
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
    // Файл дописывается к тому списку, что есть сейчас, а не к снимку до загрузки.
    onChange((cur) => [...(cur || []), res.attachment]);
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
    const same = (f) => (att.path ? f.path === att.path : att.key ? f.key === att.key : f === att);
    onChange((cur) => (cur || []).filter((f) => !same(f)));
  }

  return (
    <>
      <FileGrid files={list} onDownload={openFile} onRemove={drop} />
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

// Файл — плиткой. Длинное имя сокращается в одну строку и не вылезает за
// экран; нажали на имя — развернулось целиком. Скачивание — своей кнопкой,
// чтобы, разворачивая имя, файл случайно не скачать.
// Плитки файлов — и в тетради, и у домашнего задания.
export function FileGrid({ files, onDownload, onRemove }) {
  if (!files || !files.length) return null;
  return (
    <div style={styles.fileGrid}>
      {files.map((f, i) => (
        <FileTile key={f.path || f.key || i} file={f} onDownload={() => onDownload(f)} onRemove={() => onRemove(f)} />
      ))}
    </div>
  );
}

function FileTile({ file, onDownload, onRemove }) {
  const [full, setFull] = useState(false);
  const dot = String(file.name || "").lastIndexOf(".");
  const ext = dot > 0 ? file.name.slice(dot + 1).slice(0, 4).toUpperCase() : "";
  return (
    <div style={styles.fileTile}>
      <span style={styles.fileExt} aria-hidden="true">
        {ext || "ФАЙЛ"}
      </span>
      <button
        type="button"
        onClick={() => setFull(!full)}
        style={styles.fileNameBtn}
        aria-expanded={full}
        title={full ? "Сократить имя" : file.name}
      >
        <span style={full ? styles.fileNameFull : styles.fileNameShort}>{file.name}</span>
        <span style={styles.fileSize}>{formatSize(file.size)}</span>
      </button>
      <button type="button" onClick={onDownload} className="ap-row" style={styles.fileIconBtn} aria-label={"Скачать: " + file.name} title="Скачать">
        <DownloadIcon />
      </button>
      <button type="button" onClick={onRemove} className="ap-row" style={styles.fileIconBtn} aria-label={"Убрать файл: " + file.name} title="Убрать файл">
        ×
      </button>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="M7 10.5l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function Branch({ branch, open, onToggle, onPatch, onRemove, prefix }) {
  const files = branch.files || [];

  return (
    <div style={styles.branch}>
      <div style={styles.branchHead}>
        <button
          onClick={onToggle}
          className="ap-row"
          style={styles.chevron}
          aria-expanded={!!open}
          aria-label={(open ? "Свернуть ветку: " : "Раскрыть ветку: ") + branch.title}
        >
          {open ? "▾" : "▸"}
        </button>
        <input value={branch.title} onChange={(e) => onPatch({ title: e.target.value })} style={styles.branchTitle} />
        {files.length > 0 && <span style={styles.count}>📎 {files.length}</span>}
        <button onClick={onRemove} className="ap-row" style={styles.remove} title="Удалить ветку" aria-label={"Удалить ветку: " + branch.title}>
          ×
        </button>
      </div>

      <Collapsible open={open}>
        <div style={styles.branchBody}>
          <RichText docId={branch.id} html={branch.html} onChange={(html) => onPatch({ html })} />
          <Attachments
            files={files}
            onChange={(next) =>
              onPatch(typeof next === "function" ? (cur) => ({ files: next(cur.files || []) }) : { files: next })
            }
            prefix={prefix}
          />
        </div>
      </Collapsible>
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
  muted: { fontSize: 13, color: "var(--ink3)", lineHeight: 1.55, margin: 0 },
  block: { border: "1px solid var(--line)", borderRadius: 5, background: "var(--panel)" },
  blockHead: { display: "flex", alignItems: "center", gap: 6, padding: "7px 8px" },
  blockTitle: {
    flex: 1,
    minWidth: 0,
    border: "1px solid transparent",
    background: "transparent",
    fontFamily: "'PT Serif', Georgia, serif",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--ink)",
    padding: "2px 4px",
    borderRadius: 3,
  },
  branches: { padding: "0 8px 10px 20px", display: "flex", flexDirection: "column", gap: 8 },
  branch: { borderLeft: "2px solid var(--line)", paddingLeft: 8 },
  branchHead: { display: "flex", alignItems: "center", gap: 6 },
  branchTitle: {
    flex: 1,
    minWidth: 0,
    border: "1px solid transparent",
    background: "transparent",
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--ink)",
    padding: "2px 4px",
    borderRadius: 3,
  },
  branchBody: { marginTop: 6, display: "flex", flexDirection: "column", gap: 6 },
  // Кнопки раскрытия и удаления — с палец размером: стрелка в 14 px на
  // телефоне ловилась через раз.
  chevron: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    width: 34, height: 34, margin: "-4px 0", background: "none", border: "none", borderRadius: 8,
    padding: 0, fontSize: 15, color: "var(--ink3)", cursor: "pointer",
  },
  count: { fontSize: 11, color: "var(--mute)" },
  remove: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    width: 30, height: 30, margin: "-3px 0", background: "none", border: "none", borderRadius: 8,
    color: "var(--red)", fontSize: 17, lineHeight: 1, padding: 0, cursor: "pointer",
  },
  addBlockRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  addRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 },
  input: { flex: "1 1 180px", minWidth: 0, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 13, background: "var(--panel2)" },
  addBtn: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 4, padding: "6px 12px", fontSize: 13, fontWeight: 600 },
  addBtnSmall: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600 },
  fileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 6 },
  fileTile: {
    display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "6px 6px 6px 8px",
    border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel2)",
  },
  fileExt: {
    flexShrink: 0, minWidth: 34, height: 34, padding: "0 4px", borderRadius: 7, display: "inline-flex",
    alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
    color: "var(--ink3)", background: "var(--neutralBg)",
  },
  fileNameBtn: {
    flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
    background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--ink)",
  },
  fileNameShort: { maxWidth: "100%", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fileNameFull: { maxWidth: "100%", fontSize: 12.5, overflowWrap: "anywhere" },
  fileIconBtn: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 32, height: 32,
    padding: 0, border: "1px solid var(--line)", borderRadius: 8, background: "transparent",
    color: "var(--ink3)", fontSize: 17, lineHeight: 1, cursor: "pointer",
  },
  fileSize: { fontSize: 11, color: "var(--mute)" },
  fileActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  fileBtn: { border: "1px solid var(--line)", background: "var(--panel2)", borderRadius: 4, padding: "4px 9px", fontSize: 12, color: "var(--ink2)" },
  error: { fontSize: 11.5, color: "var(--red)" },
};
