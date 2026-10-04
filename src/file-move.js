// Перенос файла, перетащенного мышью, в ветку тетради.
//
// notebooks — { ключТетради: [блок…] }, у блока ветки, у ветки files.
// drag.source: { kind: "notebook", ownerKey, blockId, branchId } — из ветки:
// файл переезжает (из старой ветки уходит); { kind: "homework", id } — от
// задания: в тетради появляется тот же файл, у задания он остаётся.
// target: { ownerKey, blockId, branchId } — ветка; { ownerKey, inbox: true } —
// предмет целиком: файл ложится в блок «Файлы», ветку «Разное» (их нет —
// создаются).
//
// Файл не копируется и не удаляется из хранилища: меняются только ссылки.

import { fileId } from "./file-library.js";

export const INBOX_BLOCK = "Файлы";
export const INBOX_BRANCH = "Разное";

function patchBranch(blocks, blockId, branchId, fn) {
  return blocks.map((b) =>
    b.id !== blockId ? b : { ...b, branches: (b.branches || []).map((r) => (r.id !== branchId ? r : { ...r, files: fn(r.files || []) })) }
  );
}

function findBranch(blocks, blockId, branchId) {
  const block = (blocks || []).find((b) => b.id === blockId);
  const branch = block && (block.branches || []).find((r) => r.id === branchId);
  return block && branch ? { block, branch } : null;
}

// Возвращает null, если переносить нечего (та же ветка, ветки нет), иначе
// { notebooks, placed: { ownerKey, blockId, branchId, block, branch }, moved, added, from }.
// ids — { block, branch }: id для блока «Файлы» и ветки «Разное», если их придётся создать.
export function moveFile(notebooks, drag, target, ids = {}) {
  if (!drag || !drag.file || !target || !target.ownerKey) return null;
  const id = fileId(drag.file);
  let next = { ...notebooks };
  let blocks = next[target.ownerKey] || [];
  let blockId = target.blockId;
  let branchId = target.branchId;
  let created = null;

  if (target.inbox) {
    let block = blocks.find((b) => b.title === INBOX_BLOCK);
    if (!block) {
      block = { id: ids.block || "blk-files-" + Date.now().toString(36), title: INBOX_BLOCK, branches: [] };
      blocks = [...blocks, block];
      created = { block: block.id };
    }
    let branch = (block.branches || []).find((r) => r.title === INBOX_BRANCH);
    if (!branch) {
      branch = { id: ids.branch || "brn-files-" + Date.now().toString(36), title: INBOX_BRANCH, html: "", files: [] };
      blocks = blocks.map((b) => (b.id === block.id ? { ...b, branches: [...(b.branches || []), branch] } : b));
      created = { ...(created || {}), branch: branch.id };
    }
    blockId = block.id;
    branchId = branch.id;
  }

  const src = drag.source || {};
  const fromNotebook = src.kind === "notebook";
  if (fromNotebook && src.ownerKey === target.ownerKey && src.blockId === blockId && src.branchId === branchId) return null;
  if (!findBranch(blocks, blockId, branchId)) return null;
  next[target.ownerKey] = blocks;

  // Из старой ветки — убираем (запомнив место, чтобы «Вернуть» поставило туда же).
  let from = null;
  if (fromNotebook) {
    const was = findBranch(next[src.ownerKey], src.blockId, src.branchId);
    const index = was ? (was.branch.files || []).findIndex((f) => fileId(f) === id) : -1;
    if (index >= 0) {
      from = { ownerKey: src.ownerKey, blockId: src.blockId, branchId: src.branchId, index };
      next[src.ownerKey] = patchBranch(next[src.ownerKey], src.blockId, src.branchId, (files) => files.filter((f) => fileId(f) !== id));
    }
  }

  // В новую — добавляем, если его там ещё нет.
  const here = findBranch(next[target.ownerKey], blockId, branchId);
  const added = !(here.branch.files || []).some((f) => fileId(f) === id);
  if (added) next[target.ownerKey] = patchBranch(next[target.ownerKey], blockId, branchId, (files) => [...files, drag.file]);
  const placed = findBranch(next[target.ownerKey], blockId, branchId);
  return {
    notebooks: next,
    placed: { ownerKey: target.ownerKey, blockId, branchId, block: placed.block, branch: placed.branch },
    moved: !!from,
    added,
    from,
    created,
    file: drag.file,
  };
}

// «Вернуть»: файл уходит из новой ветки (если его туда добавили) и встаёт в
// старую на прежнее место. Созданные блок «Файлы» и ветка «Разное» убираются,
// если в них так ничего и не появилось.
export function undoMove(notebooks, res) {
  if (!res) return notebooks;
  const id = fileId(res.file);
  const next = { ...notebooks };
  const p = res.placed;
  if (res.added && next[p.ownerKey]) {
    next[p.ownerKey] = patchBranch(next[p.ownerKey], p.blockId, p.branchId, (files) => files.filter((f) => fileId(f) !== id));
  }
  if (res.created && next[p.ownerKey]) {
    let blocks = next[p.ownerKey];
    const spot = findBranch(blocks, p.blockId, p.branchId);
    const emptyBranch = spot && !(spot.branch.files || []).length && !String(spot.branch.html || "").trim();
    if (res.created.branch && emptyBranch) {
      blocks = blocks.map((b) => (b.id === p.blockId ? { ...b, branches: (b.branches || []).filter((r) => r.id !== p.branchId) } : b));
    }
    if (res.created.block) blocks = blocks.filter((b) => b.id !== res.created.block || (b.branches || []).length);
    next[p.ownerKey] = blocks;
  }
  const f = res.from;
  if (f && next[f.ownerKey]) {
    next[f.ownerKey] = patchBranch(next[f.ownerKey], f.blockId, f.branchId, (files) => {
      if (files.some((x) => fileId(x) === id)) return files;
      const out = files.slice();
      out.splice(Math.min(f.index, out.length), 0, res.file);
      return out;
    });
  }
  return next;
}
