/* M1 逻辑验收：命令 / 撤销重做 / JSON 往返 / 删除联动。
   用法：scripts\pnpm.cmd smoke（先 tsc 编译到 dist-smoke，再用 node 跑） */
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist-smoke');
if (!fs.existsSync(out)) {
  console.error('缺少 dist-smoke，请先运行 pnpm smoke（会先编译）');
  process.exit(1);
}
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }), 'utf8');

const { useDocStore } = require(path.join(out, 'store', 'docStore.js'));
const { addNode, deleteNode, moveNode, updateNode } = require(path.join(out, 'commands', 'nodeCommands.js'));
const { addEdge, deleteEdge, updateEdge } = require(path.join(out, 'commands', 'edgeCommands.js'));
const { toJson, fromJson } = require(path.join(out, 'serializers', 'json.js'));
const { normalizeDoc } = require(path.join(out, 'serializers', 'migrate.js'));
const { NODE_TEMPLATES, NODE_TYPE_ORDER, fieldEntriesOf } = require(path.join(out, 'lib', 'nodeTemplates.js'));
const { addComment, deleteComment } = require(path.join(out, 'commands', 'nodeCommands.js'));

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log('  PASS ' + name);
  } else {
    failures += 1;
    console.log('  FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
  }
}

const store = useDocStore;
const state = () => store.getState();
const doc = () => state().doc;

console.log('[1] 预置演示案件');
check('节点 6 个', doc().nodes.length === 6, doc().nodes.length);
check('关系 6 条', doc().edges.length === 6, doc().edges.length);
const styles = new Set(doc().edges.map((e) => e.style));
check('三种线型齐全', styles.has('solid') && styles.has('dashed') && styles.has('dotted'), [...styles]);
check('含分组占位', doc().groups.length === 1);
check('每条边的端点在节点表内', doc().edges.every((e) => doc().nodes.some((n) => n.id === e.source) && doc().nodes.some((n) => n.id === e.target)));

console.log('[2] 新增节点 → 撤销 → 重做');
const before = doc().nodes.length;
state().dispatch(addNode({ type: 'note', title: '便签A', x: 10, y: 10 }));
check('新增后 7 个', doc().nodes.length === before + 1, doc().nodes.length);
const added = doc().nodes[doc().nodes.length - 1];
check('新节点标题正确', added.title === '便签A', added.title);
state().undo();
check('撤销后回到 6 个', doc().nodes.length === before, doc().nodes.length);
state().redo();
check('重做后回到 7 个', doc().nodes.length === before + 1, doc().nodes.length);
check('重做后仍是同一 id', doc().nodes.some((n) => n.id === added.id));

console.log('[3] 撤销栈清空后不再生效');
state().undo();
state().undo();
const baseline = doc().nodes.length;
check('撤销到新增前', baseline === before, baseline);
state().undo();
check('无更多历史时保持稳定', doc().nodes.length === before, doc().nodes.length);

console.log('[4] 删除节点联动清理关系');
state().dispatch(deleteNode('zhang'));
check('张建国被删除', !doc().nodes.some((n) => n.id === 'zhang'));
check('关联的 4 条边一并删除', doc().edges.length === 2, doc().edges.map((e) => e.id));
check('残留边不含已删节点', doc().edges.every((e) => e.source !== 'zhang' && e.target !== 'zhang'));
state().undo();
check('撤销删除后节点与边复原', doc().nodes.length === before && doc().edges.length === 6, [doc().nodes.length, doc().edges.length]);

console.log('[5] 更新与移动');
state().dispatch(updateNode('li', { confidence: 88, status: 'confirmed' }));
const li = doc().nodes.find((n) => n.id === 'li');
check('置信度已更新', li && li.confidence === 88, li && li.confidence);
check('状态已更新', li && li.status === 'confirmed', li && li.status);
state().dispatch(moveNode('li', 777, 888));
const movedLi = doc().nodes.find((n) => n.id === 'li');
check('坐标已更新', movedLi && movedLi.x === 777 && movedLi.y === 888, [movedLi.x, movedLi.y]);

console.log('[6] 关系新增/修改/删除');
const edgeCount = doc().edges.length;
state().dispatch(addEdge({ source: 'li', target: 'ktv', relType: 'place', label: '到访', style: 'dashed' }));
check('新增关系后 +1', doc().edges.length === edgeCount + 1, doc().edges.length);
const newEdge = doc().edges[doc().edges.length - 1];
state().dispatch(updateEdge(newEdge.id, { style: 'solid', confidence: 90 }));
const updated = doc().edges.find((e) => e.id === newEdge.id);
check('关系线型可改', updated && updated.style === 'solid', updated && updated.style);
state().dispatch(deleteEdge(newEdge.id));
check('删除关系后恢复', doc().edges.length === edgeCount, doc().edges.length);

console.log('[7] JSON 导出 → 导入往返');
const json = toJson(doc());
const parsed = fromJson(json);
check('节点数量一致', parsed.nodes.length === doc().nodes.length, [parsed.nodes.length, doc().nodes.length]);
check('关系数量一致', parsed.edges.length === doc().edges.length);
check('标题一致', parsed.meta.title === doc().meta.title, parsed.meta.title);
check('节点字段完整', JSON.stringify(parsed.nodes[0].fields) === JSON.stringify(doc().nodes[0].fields));
check('非法 JSON 会被拒绝', (() => {
  try {
    fromJson('{ not json');
    return false;
  } catch {
    return true;
  }
})());
check('缺字段 JSON 会被拒绝', (() => {
  try {
    fromJson(JSON.stringify({ meta: { id: 'x', title: 'y' } }));
    return false;
  } catch {
    return true;
  }
})());

console.log('[8] M2-1 节点模板');
check('8 类节点模板齐全', NODE_TYPE_ORDER.length === 8 && NODE_TYPE_ORDER.every((t) => !!NODE_TEMPLATES[t]), NODE_TYPE_ORDER);
check('每类模板至少 3 个字段', NODE_TYPE_ORDER.every((t) => NODE_TEMPLATES[t].fields.length >= 3), NODE_TYPE_ORDER.map((t) => NODE_TEMPLATES[t].fields.length));
check('证据模板含「证据种类」下拉', (NODE_TEMPLATES.evidence.fields.find((f) => f.key === '证据种类') || {}).kind === 'select');
check('人物模板含前科长文本', (NODE_TEMPLATES.person.fields.find((f) => f.key === '前科记录') || {}).kind === 'textarea');
const zhangFields = fieldEntriesOf('person', { 年龄: 42, 籍贯: '常州', 职业: '无业', 自定义备注: '有前科' });
check('字段展示按模板顺序且含自定义字段', zhangFields[0].key === '年龄' && zhangFields[zhangFields.length - 1].key === '自定义备注', zhangFields.map((f) => f.key));
check('字段展示跳过空值', fieldEntriesOf('person', { 年龄: 42, 籍贯: '' }).length === 1);

console.log('[9] M2-1 旧文档迁移兜底');
const legacy = {
  meta: { id: 'legacy-1', title: '老存档' },
  nodes: [
    { id: 'n1', type: 'person', title: '旧节点' },
    { id: 'n2', type: '未知类型', title: '坏类型' },
    { id: 'n1', type: 'note', title: '重复 id' },
    { id: 'n3', title: '缺端点节点的边应被丢弃' },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n1', target: 'ghost' },
  ],
};
const migrated = normalizeDoc(legacy);
check('旧文档可迁移且去重', migrated.nodes.length === 3, migrated.nodes.map((n) => n.id));
check('未知类型落到 note', migrated.nodes.find((n) => n.id === 'n2').type === 'note');
check('缺失字段补齐为默认', (() => {
  const node = migrated.nodes.find((n) => n.id === 'n1');
  return Array.isArray(node.tags) && Array.isArray(node.attachments) && node.status === 'todo' && node.confidence === 50 && node.w > 0;
})(), migrated.nodes.find((n) => n.id === 'n1'));
check('悬空边被丢弃', migrated.edges.length === 1 && migrated.edges[0].id === 'e1', migrated.edges.map((e) => e.id));
check('缺 meta 会抛错', (() => {
  try {
    normalizeDoc({ nodes: [], edges: [] });
    return false;
  } catch {
    return true;
  }
})());
check('缺字段的 JSON 也能导入', (() => {
  const partial = fromJson(JSON.stringify({ meta: { id: 'x', title: 'y' }, nodes: [], edges: [] }));
  return partial.nodes.length === 0 && partial.settings.lineLegend.solid.label === '已证实';
})());

console.log('[10] M2-1 评论与折叠');
const commentNodeId = doc().nodes[0].id;
const beforeComments = (doc().nodes[0].comments || []).length;
state().dispatch(addComment(commentNodeId, '  待调取通话详单  '));
const withComment = doc().nodes.find((n) => n.id === commentNodeId);
check('评论已追加且去空白', withComment.comments.length === beforeComments + 1 && withComment.comments[beforeComments].text === '待调取通话详单', withComment.comments);
state().dispatch(deleteComment(commentNodeId, withComment.comments[beforeComments].id));
check('评论可删除', (doc().nodes.find((n) => n.id === commentNodeId).comments || []).length === beforeComments);
state().undo();
check('撤销可恢复评论', (doc().nodes.find((n) => n.id === commentNodeId).comments || []).length === beforeComments + 1);
state().dispatch(updateNode(commentNodeId, { collapsed: true }));
check('折叠详情可写入', doc().nodes.find((n) => n.id === commentNodeId).collapsed === true);
state().dispatch(updateNode(commentNodeId, { collapsed: undefined }));
check('折叠详情可取消', doc().nodes.find((n) => n.id === commentNodeId).collapsed === undefined);

console.log('');
if (failures > 0) {
  console.log('结果：' + failures + ' 项失败');
  process.exit(1);
}
console.log('结果：全部通过');
