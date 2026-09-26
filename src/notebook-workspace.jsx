import React, { useEffect, useMemo, useState } from "react";
import RichText from "./rich-text.jsx";
import MoreMenu from "./more-menu.jsx";
import { Attachments } from "./notebook.jsx";
import { removeAttachment } from "./files.js";

// Тетрадь в две панели: слева оглавление (блоки и ветки), справа открытая
// ветка на всю оставшуюся ширину. Раньше блоки и ветки раскрывались гармошкой
// одна в другой, и конспект читался в узкой коробке внутри коробки, а названия
// были всегда открытыми полями с крестиком удаления рядом.
//
// На телефоне панели идут по очереди: оглавление → ветка, назад — кнопкой
// «‹ Оглавление». Какая панель видна, решает data-view на обёртке и таблица
// стилей (.ap-nbw).
function plain(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBranchEmpty(branch) {
  return !plain(branch.html) && !(branch.files || []).length;
}

const newId = (p) => p + "-" + Date.now() + "-" + Math.round(Math.random() * 1000);

export default function NotebookWorkspace({ owner, blocks, onChange, onUndo, prefix, focus, compact }) {
  const list = blocks || [];
  const [sel, setSel] = useState(null); // { blockId, branchId }
  const [view, setView] = useState("outline");
  const [closed, setClosed] = useState({});
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(null); // blockId | "block"
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(null);

  // Сменили предмет — выбор сбрасывается на первую ветку новой тетради.
  // Стоит раньше эффекта поиска: пришли из поиска в другую тетрадь — сначала
  // сброс, потом найденная ветка, а не наоборот.
  useEffect(() => {
    setSel(null);
    setView("outline");
    setQuery("");
  }, [prefix]);

  // Пришли из поиска — открываем найденную ветку сразу в редакторе.
  useEffect(() => {
    if (!focus || !focus.branchId) return;
    setSel({ blockId: focus.blockId, branchId: focus.branchId });
    setClosed((p) => ({ ...p, [focus.blockId]: false }));
    setView("editor");
  }, [focus]);

  const current = useMemo(() => {
    if (sel) {
      const b = list.find((x) => x.id === sel.blockId);
      const r = b && (b.branches || []).find((x) => x.id === sel.branchId);
      if (r) return { block: b, branch: r };
    }
    for (const b of list) if ((b.branches || []).length) return { block: b, branch: b.branches[0] };
    return null;
  }, [sel, list]);

  const q = query.trim().toLowerCase();
  const matches = (b, r) => !q || r.title.toLowerCase().includes(q) || plain(r.html).toLowerCase().includes(q) || b.title.toLowerCase().includes(q);

  function update(fn) {
    onChange((prev) => fn(prev || []));
  }

  function commitAdd() {
    const name = draft.trim();
    if (!name) {
      setAdding(null);
      return;
    }
    if (adding === "block") {
      const id = newId("blk");
      update((cur) => [...cur, { id, title: name, branches: [] }]);
      setClosed((p) => ({ ...p, [id]: false }));
      setAdding(id);
      setDraft("");
      return;
    }
    const blockId = adding;
    const id = newId("brn");
    update((cur) =>
      cur.map((b) => (b.id === blockId ? { ...b, branches: [...(b.branches || []), { id, title: name, html: "", files: [] }] } : b))
    );
    setSel({ blockId, branchId: id });
    setView("editor");
    setAdding(null);
    setDraft("");
  }

  function renameBlock(id, title) {
    update((cur) => cur.map((b) => (b.id === id ? { ...b, title } : b)));
  }

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

  function dropBlock(block) {
    const index = list.findIndex((b) => b.id === block.id);
    update((cur) => cur.filter((b) => b.id !== block.id));
    const files = (block.branches || []).flatMap((r) => r.files || []);
    const empty = (block.branches || []).every(isBranchEmpty);
    if (empty || !onUndo) {
      files.forEach((f) => removeAttachment(f).catch(() => {}));
      return;
    }
    onUndo(
      `Вы удалили блок «${block.title}»`,
      () =>
        update((cur) => {
          const next = cur.filter((b) => b.id !== block.id);
          next.splice(Math.min(index, next.length), 0, block);
          return next;
        }),
      () => files.forEach((f) => removeAttachment(f).catch(() => {}))
    );
  }

  function dropBranch(block, branch) {
    const index = (block.branches || []).findIndex((r) => r.id === branch.id);
    update((cur) => cur.map((b) => (b.id === block.id ? { ...b, branches: (b.branches || []).filter((r) => r.id !== branch.id) } : b)));
    setSel(null);
    setView("outline");
    const files = branch.files || [];
    if (isBranchEmpty(branch) || !onUndo) {
      files.forEach((f) => removeAttachment(f).catch(() => {}));
      return;
    }
    onUndo(
      `Вы удалили ветку «${branch.title}»`,
      () =>
        update((cur) =>
          cur.map((b) => {
            if (b.id !== block.id) return b;
            const next = (b.branches || []).filter((r) => r.id !== branch.id);
            next.splice(Math.min(index, next.length), 0, branch);
            return { ...b, branches: next };
          })
        ),
      () => files.forEach((f) => removeAttachment(f).catch(() => {}))
    );
  }

  const branchCount = list.reduce((n, b) => n + (b.branches || []).length, 0);
  const fileCount = list.reduce((n, b) => n + (b.branches || []).reduce((m, r) => m + (r.files || []).length, 0), 0);

  function addRow(placeholder) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitAdd();
          if (e.key === "Escape") setAdding(null);
        }}
        onBlur={commitAdd}
        placeholder={placeholder}
        style={S.addInput}
      />
    );
  }

  return (
    <div className={"ap-nbw" + (compact ? " is-compact" : "")} data-view={view} style={S.wrap}>
      <section className="ap-nbw-outline" aria-label="Оглавление тетради" style={S.outline}>
        {owner && (
          <div style={S.ownerHead}>
            <div style={S.ownerRow}>
              <span style={{ ...S.ownerDot, background: owner.color }} />
              <span style={S.ownerName}>{owner.name}</span>
            </div>
            <div style={S.ownerMeta}>
              {list.length ? `${list.length} ${word(list.length, "блок", "блока", "блоков")} · ${branchCount} ${word(branchCount, "ветка", "ветки", "веток")}` : "Тетрадь пока пустая"}
              {fileCount ? ` · ${fileCount} ${word(fileCount, "файл", "файла", "файлов")}` : ""}
            </div>
          </div>
        )}
        {branchCount > 3 && (
          <label style={S.search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в тетради" style={S.searchInput} aria-label="Найти в тетради" />
          </label>
        )}

        {list.length === 0 && (
          <p style={S.muted}>
            Блок — крупная часть курса, которую вы называете сами; внутри него ветки — темы с конспектом и файлами.
          </p>
        )}

        <div style={S.blocks}>
          {list.map((block) => {
            const shown = (block.branches || []).filter((r) => matches(block, r));
            if (q && !shown.length) return null;
            const isOpen = q ? true : closed[block.id] !== true;
            return (
              <div key={block.id} data-focus-id={"block:" + block.id} style={S.block}>
                <div style={S.blockHead}>
                  <button
                    type="button"
                    onClick={() => setClosed((p) => ({ ...p, [block.id]: isOpen }))}
                    aria-expanded={isOpen}
                    className="ap-row"
                    style={S.blockToggle}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    {renaming === block.id ? (
                      <input
                        autoFocus
                        defaultValue={block.title}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                        }}
                        onBlur={(e) => {
                          if (e.target.value.trim()) renameBlock(block.id, e.target.value.trim());
                          setRenaming(null);
                        }}
                        style={S.renameInput}
                        aria-label="Название блока"
                      />
                    ) : (
                      <span style={S.blockTitle}>{block.title}</span>
                    )}
                    <span style={S.count}>{(block.branches || []).length || "пусто"}</span>
                  </button>
                  <MoreMenu
                    quiet
                    label={"Блок «" + block.title + "»"}
                    size={32}
                    items={[
                      { label: "Переименовать", onSelect: () => setRenaming(block.id) },
                      { label: "+ Ветка", onSelect: () => { setAdding(block.id); setDraft(""); setClosed((p) => ({ ...p, [block.id]: false })); } },
                      { label: "Удалить блок", danger: true, onSelect: () => dropBlock(block) },
                    ]}
                  />
                </div>
                {isOpen && (
                  <div style={S.branches}>
                    {shown.map((r) => {
                      const on = current && current.branch.id === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          data-focus-id={"branch:" + r.id}
                          onClick={() => {
                            setSel({ blockId: block.id, branchId: r.id });
                            setView("editor");
                          }}
                          aria-current={on ? "true" : undefined}
                          className="ap-nbw-branch"
                          style={{ ...S.branch, ...(on ? S.branchOn : null) }}
                        >
                          <span style={S.branchText}>
                            <span style={S.branchTitle}>{r.title || "Без названия"}</span>
                            <span className="ap-nbw-preview" style={S.preview}>{plain(r.html) || "пусто"}</span>
                          </span>
                          {(r.files || []).length > 0 && <ClipIcon />}
                        </button>
                      );
                    })}
                    {adding === block.id ? (
                      addRow("Название ветки — например: признаки государства")
                    ) : (
                      <button type="button" onClick={() => { setAdding(block.id); setDraft(""); }} style={S.addBranch}>
                        + Ветка
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {adding === "block" ? (
          addRow("Название блока — например: теория государства и права")
        ) : (
          <button type="button" onClick={() => { setAdding("block"); setDraft(""); }} style={S.addBlock}>
            + Новый блок
          </button>
        )}
      </section>

      <section className="ap-nbw-editor" aria-label="Открытая ветка" style={S.editor}>
        {current ? (
          <Editor
            key={current.branch.id}
            owner={owner}
            block={current.block}
            branch={current.branch}
            prefix={prefix}
            onUndo={onUndo}
            onBack={() => setView("outline")}
            onPatch={(patch) => patchBranch(current.block.id, current.branch.id, patch)}
            onRemove={() => dropBranch(current.block, current.branch)}
          />
        ) : (
          <div style={S.emptyEditor}>
            <div style={S.emptyTitle}>{list.length ? "Выберите ветку" : "Начните тетрадь"}</div>
            <p style={S.muted}>
              {list.length
                ? "Слева — оглавление. Откройте ветку или добавьте новую в нужный блок."
                : "Добавьте первый блок — большую тему курса, — а в нём ветки с конспектами."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Editor({ owner, block, branch, prefix, onUndo, onBack, onPatch, onRemove }) {
  const files = branch.files || [];
  return (
    <div style={S.editorInner}>
      <div style={S.editorTop}>
        <button type="button" onClick={onBack} className="ap-mobile-only" style={S.back}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Оглавление
        </button>
        <div className="ap-nbw-crumbs" style={S.crumbs}>
          {owner ? owner.name : ""} <span style={{ color: "var(--line)" }}>›</span> {block.title}
        </div>
        <MoreMenu
          label={"Ветка «" + branch.title + "»"}
          items={[{ label: "Удалить ветку", danger: true, onSelect: onRemove }]}
        />
      </div>
      {/* Название правится прямо в заголовке: оно выглядит заголовком, а не полем,
          пока в него не нажали. */}
      <input
        value={branch.title}
        onChange={(e) => onPatch({ title: e.target.value })}
        className="ap-nbw-title"
        style={S.title}
        aria-label="Название ветки"
        placeholder="Без названия"
      />
      <div style={S.meta}>
        {files.length ? `${files.length} ${word(files.length, "файл", "файла", "файлов")}` : "без файлов"}
      </div>
      <RichText docId={branch.id} html={branch.html} onChange={(html) => onPatch({ html })} large />
      <div style={S.files}>
        <div style={S.filesLabel}>Файлы</div>
        <Attachments
          files={files}
          onChange={(next) => onPatch(typeof next === "function" ? (cur) => ({ files: next(cur.files || []) }) : { files: next })}
          prefix={prefix}
          onUndo={onUndo}
        />
      </div>
    </div>
  );
}

function ClipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="есть файлы" style={{ flexShrink: 0 }}>
      <path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
    </svg>
  );
}

function word(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
  return many;
}

const S = {
  wrap: { display: "grid", gridTemplateColumns: "300px minmax(0, 1fr)", minHeight: 560, minWidth: 0 },
  outline: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "18px 14px",
    background: "var(--neutralBg)",
    borderRight: "1px solid var(--line)",
    minWidth: 0,
  },
  ownerHead: { padding: "0 6px" },
  ownerRow: { display: "flex", alignItems: "center", gap: 10 },
  ownerDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  ownerName: { fontFamily: "var(--serif)", fontSize: 23, lineHeight: 1.2 },
  ownerMeta: { fontSize: 13, color: "var(--ink3)", marginTop: 4 },
  search: {
    display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px",
    border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel2)", color: "var(--mute)",
  },
  searchInput: { flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 13.5, minHeight: 0, padding: 0, boxShadow: "none" },
  muted: { fontSize: 13.5, color: "var(--ink3)", lineHeight: 1.55, margin: 0 },
  blocks: { display: "flex", flexDirection: "column", gap: 8 },
  block: { display: "flex", flexDirection: "column", gap: 2 },
  blockHead: { display: "flex", alignItems: "center", gap: 4 },
  blockToggle: {
    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 6px",
    border: "none", borderRadius: 9, background: "none", color: "var(--ink)", textAlign: "left", cursor: "pointer",
  },
  blockTitle: { flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  renameInput: { flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700, padding: "4px 8px", border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)" },
  count: { fontSize: 12, color: "var(--mute)", flexShrink: 0 },
  branches: { display: "flex", flexDirection: "column", gap: 2, paddingLeft: 20 },
  branch: {
    display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 38, padding: "6px 10px",
    border: "none", borderRadius: 9, background: "transparent", color: "var(--ink)", textAlign: "left", cursor: "pointer",
  },
  branchOn: { background: "var(--accentSoft)", fontWeight: 600 },
  branchText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 },
  branchTitle: { fontSize: 14, lineHeight: 1.35, overflowWrap: "anywhere" },
  preview: { display: "none", fontSize: 12.5, fontWeight: 400, color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  addBranch: { alignSelf: "flex-start", minHeight: 34, padding: "0 10px", border: "none", background: "none", color: "var(--accent)", fontSize: 13.5, fontWeight: 500, cursor: "pointer" },
  addBlock: { minHeight: 40, marginTop: 4, border: "1px dashed var(--line)", borderRadius: 10, background: "transparent", color: "var(--ink2)", fontSize: 13.5, cursor: "pointer" },
  addInput: { width: "100%", minHeight: 38, padding: "6px 10px", border: "1px solid var(--accent)", background: "var(--panel2)", color: "var(--ink)", fontSize: 14 },
  editor: { minWidth: 0, background: "var(--panel)", display: "flex", flexDirection: "column" },
  editorInner: { display: "flex", flexDirection: "column", gap: 12, padding: "22px 34px 28px", minWidth: 0 },
  editorTop: { display: "flex", alignItems: "center", gap: 10 },
  back: { alignItems: "center", gap: 4, minHeight: 40, padding: "0 6px 0 0", border: "none", background: "none", color: "var(--ink3)", fontSize: 15, cursor: "pointer" },
  crumbs: { flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  title: {
    width: "100%", fontFamily: "var(--serif)", fontSize: 32, lineHeight: 1.2, padding: "2px 0",
    border: "none", borderBottom: "1px solid transparent", background: "transparent", color: "var(--ink)", borderRadius: 0,
  },
  meta: { fontSize: 13, color: "var(--mute)", marginTop: -6 },
  files: { display: "flex", flexDirection: "column", gap: 8, paddingTop: 14, borderTop: "1px solid var(--line2)" },
  filesLabel: { fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--mute)" },
  emptyEditor: { margin: "auto", maxWidth: 360, textAlign: "center", padding: 32, display: "flex", flexDirection: "column", gap: 8 },
  emptyTitle: { fontFamily: "var(--serif)", fontSize: 24 },
};
