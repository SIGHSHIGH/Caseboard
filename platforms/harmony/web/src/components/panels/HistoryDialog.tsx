/**
 * 历史面板（M4）：版本快照 + 回收站。
 *
 * 定位：撤销栈只覆盖本次会话的 200 步；快照是「跨会话」的整份存档，
 * 回收站是「删错了但撤销栈已经被后续操作顶掉」的第二道保险。
 * 组件只做交互，读写全部走 src/services/storage.ts。
 */
import { useCallback, useEffect, useState } from 'react';
import { replaceDocument, restoreEdge, restoreEntities } from '../../commands';
import type { SnapshotMeta } from '../../services/db/repo';
import {
  createSnapshot,
  listSnapshotsInStorage,
  listTrashInStorage,
  listTrashItemsInStorage,
  loadSnapshotFromStorage,
  purgeTrashInStorage,
  takeTrashFromStorage,
  type TrashRow,
} from '../../services/storage';
import { useBackend, useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { CaseEdge, CaseNode } from '../../types';

interface HistoryDialogProps {
  onClose: () => void;
}

type Tab = 'snapshots' | 'trash';

const KIND_LABEL: Record<string, string> = {
  node: '实体',
  edge: '关系',
  group: '分组',
  asset: '素材',
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function timeText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function HistoryDialog({ onClose }: HistoryDialogProps) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const backend = useBackend();
  const askConfirm = useUiStore((s) => s.askConfirm);
  const [tab, setTab] = useState<Tab>('snapshots');
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [trash, setTrash] = useState<TrashRow[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const caseId = doc.meta.id;

  const refresh = useCallback(async () => {
    if (backend !== 'sqlite') return;
    try {
      const [nextSnapshots, nextTrash] = await Promise.all([
        listSnapshotsInStorage(caseId),
        listTrashInStorage(caseId),
      ]);
      setSnapshots(nextSnapshots);
      setTrash(nextTrash);
    } catch (problem) {
      setError('读取历史失败：' + errorText(problem));
    }
  }, [backend, caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const message = await action();
      if (message) setStatus(message);
      await refresh();
    } catch (problem) {
      setError('操作失败：' + errorText(problem));
    } finally {
      setBusy(false);
    }
  };

  const snapshotNow = () =>
    run(async () => {
      const ok = await createSnapshot(doc, '手动快照');
      if (!ok) throw new Error('当前存储后端不支持版本快照');
      return '已创建快照：' + doc.nodes.length + ' 实体 / ' + doc.edges.length + ' 关系';
    });

  const restoreSnapshot = (item: SnapshotMeta) =>
    run(async () => {
      const restored = await loadSnapshotFromStorage(item.id);
      if (!restored) throw new Error('快照内容为空');
      dispatch(replaceDocument(restored));
      return '已恢复到 ' + timeText(item.createdAt) + ' 的版本（可用 Ctrl+Z 撤回）';
    });

  const restoreTrashRow = (row: TrashRow) =>
    run(async () => {
      const item = await takeTrashFromStorage(row.id);
      if (!item) throw new Error('该条目已被清理');
      if (item.kind === 'node') {
        const node = item.payload as CaseNode;
        // 删除实体时挂在它身上的关系也进了回收站：一起取出来，用同一条命令恢复（一次 Ctrl+Z 全撤）
        const rows = await listTrashItemsInStorage(caseId);
        const companions = rows
          .filter((row) => row.kind === 'edge')
          .map((row) => row.payload as CaseEdge)
          .filter((edge) => edge && (edge.source === node.id || edge.target === node.id));
        const edges: CaseEdge[] = [];
        for (const companion of companions) {
          const row = rows.find((item2) => item2.kind === 'edge' && (item2.payload as CaseEdge).id === companion.id);
          if (!row) continue;
          const taken = await takeTrashFromStorage(row.id);
          if (taken) edges.push(taken.payload as CaseEdge);
        }
        dispatch(restoreEntities({ nodes: [node], edges }));
        return '已恢复实体：' + item.label + (edges.length > 0 ? '（含 ' + edges.length + ' 条关系，可一次撤销）' : '');
      }
      if (item.kind === 'edge') {
        const edge = item.payload as CaseEdge;
        const hasSource = doc.nodes.some((node) => node.id === edge.source);
        const hasTarget = doc.nodes.some((node) => node.id === edge.target);
        if (!hasSource || !hasTarget) throw new Error('两端实体不在画布上，请先恢复实体');
        dispatch(restoreEdge(edge));
        return '已恢复关系：' + item.label;
      }
      throw new Error('暂不支持恢复该类型（' + (KIND_LABEL[item.kind] ?? item.kind) + '）');
    });

  const emptyTrash = () => {
    // ArkWeb 里 window.confirm 静默返回 false，会把「清空回收站」直接吞掉 → 改用应用内确认框
    void (async () => {
      const ok = await askConfirm({
        title: '清空回收站',
        message: '清空回收站后无法恢复，确定继续？',
        confirmText: '清空',
        danger: true,
      });
      if (!ok) return;
      await run(async () => {
        await purgeTrashInStorage(caseId);
        return '回收站已清空';
      });
    })();
  };

  return (
    <div className="cb-modal__mask" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cb-modal cb-history" role="dialog" aria-modal="true" aria-label="历史与回收站">
        <header className="cb-history__head">
          <div>
            <h2 className="cb-modal__title">历史与回收站</h2>
            <p className="cb-modal__sub">
              快照保留最近 50 份，每 5 分钟自动存一份；回收站只记录被删除的实体与关系。
            </p>
          </div>
          <button type="button" className="cb-btn" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="cb-history__tabs">
          <button type="button" className={'cb-btn' + (tab === 'snapshots' ? ' is-active' : '')} onClick={() => setTab('snapshots')}>
            版本快照（{snapshots.length}）
          </button>
          <button type="button" className={'cb-btn' + (tab === 'trash' ? ' is-active' : '')} onClick={() => setTab('trash')}>
            回收站（{trash.length}）
          </button>
          <button type="button" className="cb-btn" disabled={busy || backend !== 'sqlite'} onClick={() => void snapshotNow()}>
            立即快照
          </button>
        </div>

        {backend !== 'sqlite' ? (
          <p className="cb-panel__note">当前是浏览器本机存储，版本快照与回收站只在桌面端 SQLite 可用。</p>
        ) : null}

        {tab === 'snapshots' ? (
          <ul className="cb-history__list">
            {snapshots.length === 0 ? <li className="cb-history__empty">还没有快照。点「立即快照」存一份当前案件。</li> : null}
            {snapshots.map((item) => (
              <li key={item.id} className="cb-history__item">
                <div className="cb-history__main">
                  <span className="cb-history__title">{item.label || '自动快照'}</span>
                  <span className="cb-history__time">
                    {item.nodes} 实体 / {item.edges} 关系 · {timeText(item.createdAt)}
                  </span>
                </div>
                <button type="button" className="cb-btn" disabled={busy} onClick={() => void restoreSnapshot(item)}>
                  恢复此版本
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="cb-history__list">
              {trash.length === 0 ? <li className="cb-history__empty">回收站是空的。删除实体或关系后会先落到这里。</li> : null}
              {trash.map((row) => (
                <li key={row.id} className="cb-history__item">
                  <div className="cb-history__main">
                    <span className="cb-history__title">
                      {KIND_LABEL[row.kind] ?? row.kind}：{row.label || row.entityId}
                    </span>
                    <span className="cb-history__time">删除于 {timeText(row.deletedAt)}</span>
                  </div>
                  <button type="button" className="cb-btn" disabled={busy} onClick={() => void restoreTrashRow(row)}>
                    恢复
                  </button>
                </li>
              ))}
            </ul>
            <div className="cb-history__foot">
              <span className="cb-panel__hint">恢复后按 Ctrl+Z 仍可撤回。</span>
              <button type="button" className="cb-btn" disabled={busy || trash.length === 0} onClick={emptyTrash}>
                清空回收站
              </button>
            </div>
          </>
        )}

        {status ? <p className="cb-export__status">{status}</p> : null}
        {error ? <p className="cb-panel__note cb-panel__note--warn">{error}</p> : null}
      </div>
    </div>
  );
}

export default HistoryDialog;
