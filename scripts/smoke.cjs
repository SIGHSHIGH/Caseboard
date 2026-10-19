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
const { buildDoc } = require(path.join(__dirname, 'fixtures.cjs'));

const { useDocStore } = require(path.join(out, 'store', 'docStore.js'));
const {
  addAnnotation,
  clearAnnotations,
  deleteAnnotation,
  linkAnnotation,
  updateAnnotation,
} = require(path.join(out, 'commands', 'annotationCommands.js'));
const { addNode, deleteNode, moveNode, updateNode } = require(path.join(out, 'commands', 'nodeCommands.js'));
const { addEdge, deleteEdge, updateEdge } = require(path.join(out, 'commands', 'edgeCommands.js'));
const { toJson, fromJson } = require(path.join(out, 'serializers', 'json.js'));
const { normalizeDoc } = require(path.join(out, 'serializers', 'migrate.js'));
const { NODE_TEMPLATES, NODE_TYPE_ORDER, fieldEntriesOf } = require(path.join(out, 'lib', 'nodeTemplates.js'));
const { addComment, deleteComment } = require(path.join(out, 'commands', 'nodeCommands.js'));
const {
  addGroup,
  assignNodesToGroup,
  canParentGroup,
  deleteGroup,
  moveGroup,
  resizeGroup,
  toggleGroupCollapsed,
  updateGroup,
} = require(path.join(out, 'commands', 'groupCommands.js'));
const { extractedName, formatDuration, parsePageRange, planFrameTimes } = require(path.join(out, 'lib', 'mediaPlan.js'));
const {
  buildRenderModel,
  descendantGroupIds,
  isAggEdgeId,
  nodeIdsInRect,
  parseBoardNodeId,
  superNodeId,
  weakestStyle,
} = require(path.join(out, 'lib', 'groups.js'));

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

console.log('[11] M2-2 组系统');
check('演示数据含分组且成员已绑定', (() => {
  const g = doc().groups.find((item) => item.id === 'g-suspect');
  return doc().groups.length === 1 && g.title === '诈骗团伙' && doc().nodes.find((n) => n.id === 'zhang').groupId === 'g-suspect';
})());
let rm = buildRenderModel(doc());
check('展开态渲染：分组 1 / 超级节点 0 / 节点 6', rm.groups.length === 1 && rm.superNodes.length === 0 && rm.nodes.length === 6, {
  groups: rm.groups.length,
  supers: rm.superNodes.length,
  nodes: rm.nodes.length,
});
const groupsBefore = doc().groups.length;
state().dispatch(addGroup({ id: 'g-test', title: '测试组', x: 1200, y: 900, w: 240, h: 160 }));
check('可新建分组', doc().groups.length === groupsBefore + 1 && doc().groups.find((g) => g.id === 'g-test').title === '测试组');
state().undo();
check('撤销新建分组', doc().groups.length === groupsBefore);
state().redo();
check('重做新建分组', doc().groups.length === groupsBefore + 1);
state().dispatch(addGroup({ id: 'g-nested', title: '子组', x: 120, y: 140, w: 200, h: 140, parentId: 'g-suspect' }));
check('支持嵌套分组', doc().groups.find((g) => g.id === 'g-nested').parentId === 'g-suspect');
check('后代组可枚举', descendantGroupIds(doc(), 'g-suspect').includes('g-nested'));
check('禁止把上级设成自己的后代', canParentGroup(doc(), 'g-suspect', 'g-nested') === false);
state().dispatch(updateGroup('g-suspect', { parentId: 'g-nested' }));
check('成环的分组父级被拒绝', doc().groups.find((g) => g.id === 'g-suspect').parentId === undefined);
state().dispatch(updateGroup('g-suspect', { opacity: 5 }));
check('分组透明度被夹到 0.6', doc().groups.find((g) => g.id === 'g-suspect').opacity === 0.6);
state().dispatch(assignNodesToGroup(['li'], 'g-nested'));
check('节点可归入子组', doc().nodes.find((n) => n.id === 'li').groupId === 'g-nested');
rm = buildRenderModel(doc());
check('子组出现在渲染模型', rm.groups.some((item) => item.group.id === 'g-nested'));
const inRect = nodeIdsInRect(doc().nodes, { x: 100, y: 100, w: 300, h: 200 });
check('矩形圈选按节点中心命中', inRect.includes('zhang') && !inRect.includes('ktv'), inRect);
state().dispatch(toggleGroupCollapsed('g-suspect'));
rm = buildRenderModel(doc());
check('折叠后成员节点全部隐藏', !rm.nodes.some((n) => ['zhang', 'gang', 'li'].includes(n.id)), rm.nodes.map((n) => n.id));
check('折叠后出现超级节点', rm.superNodes.length === 1 && rm.superNodes[0].group.id === 'g-suspect');
check('折叠后组内子组一并隐藏', !rm.groups.some((item) => item.group.id === 'g-nested'));
const aggEdges = rm.edges.filter((e) => isAggEdgeId(e.id));
check('指向组内的关系聚合为合成边', aggEdges.length >= 1 && aggEdges.every((e) => e.target === superNodeId('g-suspect')), aggEdges.map((e) => e.id));
check('被折叠节点不再作为端点出现', !rm.edges.some((e) => ['zhang', 'gang', 'li'].includes(e.source) || ['zhang', 'gang', 'li'].includes(e.target)));
check('聚合线型取最弱', weakestStyle(['solid', 'solid', 'dotted']) === 'dotted' && weakestStyle(['solid', 'dashed']) === 'dashed');
state().dispatch(toggleGroupCollapsed('g-suspect'));
check('再次折叠可展开', buildRenderModel(doc()).nodes.length >= 6);
const zx = doc().nodes.find((n) => n.id === 'zhang').x;
const gy = doc().groups.find((g) => g.id === 'g-suspect').bounds.y;
state().dispatch(moveGroup('g-suspect', 10, 20));
check('移动分组带动组内节点', doc().nodes.find((n) => n.id === 'zhang').x === zx + 10 && doc().groups.find((g) => g.id === 'g-suspect').bounds.y === gy + 20);
state().undo();
check('撤销分组移动', doc().nodes.find((n) => n.id === 'zhang').x === zx);
state().dispatch(resizeGroup('g-test', { x: 0, y: 0, w: 10, h: 10 }));
const clamped = doc().groups.find((g) => g.id === 'g-test').bounds;
check('分组尺寸有下限 120×80', clamped.w >= 120 && clamped.h >= 80, clamped);
const liBefore = doc().nodes.find((n) => n.id === 'li').groupId;
state().dispatch(deleteGroup('g-nested'));
check('删除分组保留节点并提升归属', !doc().groups.some((g) => g.id === 'g-nested') && doc().nodes.find((n) => n.id === 'li').groupId === 'g-suspect', { before: liBefore });
check('合成 id 可解析', parseBoardNodeId(superNodeId('g-suspect')).kind === 'super'
  && parseBoardNodeId('__agg:a->b').kind === 'agg'
  && parseBoardNodeId('zhang').kind === 'node');
check('迁移会夹紧分组透明度', (() => {
  const migrated = normalizeDoc({
    meta: { id: 'm', title: 't' },
    nodes: [],
    edges: [],
    groups: [{ id: 'g1', title: 'g', bounds: { x: 0, y: 0, w: 200, h: 100 }, opacity: 9, collapsed: 'yes' }],
  });
  const g = migrated.groups[0];
  return g.opacity === 0.6 && g.collapsed === false;
})());

// ---------- M2-3 素材编号 / 缩略图 / 去重 / EXIF ----------
const { computeThumbSize, dedupeCandidates, formatAssetNo, formatBytes, nextAssetNo, parseAssetNo } = require(
  path.join(out, 'lib', 'assetMeta.js'),
);
const { normalizeExifDate, parseExif } = require(path.join(out, 'services', 'exif.js'));
const { deleteAsset, importAssets, updateAsset } = require(path.join(out, 'commands', 'assetCommands.js'));
const {
  fitImageSize,
  nextZIndex,
  reorderLayers,
  resizeImageRect,
  snapImageRect,
  snapRotation,
  alignRects,
  distributeRects,
} = require(path.join(out, 'lib', 'imageNode.js'));
const {
  addImageNode,
  attachImageNode,
  deleteImageNode,
  moveImageNode,
  moveImageNodes,
  resizeImageNode,
  rotateImageNode,
  setImageLayer,
  updateImageNode,
} = require(path.join(out, 'commands', 'imageNodeCommands.js'));

console.log('[11] 素材编号与缩略图尺寸');
check('编号格式 IMG-0001', formatAssetNo(1) === 'IMG-0001', formatAssetNo(1));
check('编号解析', parseAssetNo('IMG-0042') === 42 && parseAssetNo('随便') === 0);
check('下一个编号取最大值 +1', nextAssetNo([{ no: 'IMG-0003' }, { no: 'IMG-0009' }]) === 'IMG-0010');
check('空库从 IMG-0001 开始', nextAssetNo([]) === 'IMG-0001');
const thumb1 = computeThumbSize(4000, 3000, 256);
check('横图等比缩到 256 宽', thumb1.w === 256 && thumb1.h === 192, thumb1);
const thumb2 = computeThumbSize(100, 50, 256);
check('小图不放大', thumb2.w === 100 && thumb2.h === 50, thumb2);
const thumb3 = computeThumbSize(0, 0, 256);
check('非法尺寸回退正方形', thumb3.w === 256 && thumb3.h === 256, thumb3);
check('文件大小可读化', formatBytes(1536) === '1.5 KB' && formatBytes(undefined) === '—', formatBytes(1536));

console.log('[12] SHA-256 去重');
const dedupe = dedupeCandidates(
  [{ id: 'a1', hash: 'h1' }],
  [
    { hash: 'h1', name: 'dup-lib.png' },
    { hash: 'h2', name: 'new.png' },
    { hash: 'h2', name: 'same-batch.png' },
    { hash: 'h3', name: 'new2.png' },
  ],
);
check('库内重复被拦下', dedupe.duplicates.some((d) => d.reason === 'hash' && d.existingId === 'a1'), dedupe.duplicates);
check('批内重复被拦下', dedupe.duplicates.some((d) => d.reason === 'batch' && d.item.name === 'same-batch.png'));
check('新图片保留 2 张', dedupe.fresh.length === 2, dedupe.fresh.map((i) => i.name));

console.log('[13] EXIF 解析（合成 JPEG）');
/** 手工拼一段最小 JPEG：SOI + APP1(Exif) + TIFF(IFD0/ExifIFD/GPSIFD)，不依赖任何图片库 */
function buildExifJpeg() {
  const buf = new Uint8Array(260);
  const dv = new DataView(buf.buffer);
  const u16 = (pos, value) => dv.setUint16(pos, value, true);
  const u32 = (pos, value) => dv.setUint32(pos, value, true);
  const ascii = (pos, text) => {
    for (let i = 0; i < text.length; i += 1) buf[pos + i] = text.charCodeAt(i);
  };
  const entry = (ifdRel, index, tag, type, count, valueOrOffset) => {
    const base = 12 + ifdRel + 2 + index * 12;
    dv.setUint16(base, tag, true);
    dv.setUint16(base + 2, type, true);
    dv.setUint32(base + 4, count, true);
    dv.setUint32(base + 8, valueOrOffset, true);
  };
  // 外壳
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe1;
  dv.setUint16(4, 240, false);
  ascii(6, 'Exif');
  buf[10] = 0;
  buf[11] = 0;
  // TIFF 头（小端）
  const tiff = 12;
  ascii(tiff, 'II');
  u16(tiff + 2, 42);
  u32(tiff + 4, 8);
  // IFD0
  u16(tiff + 8, 4);
  entry(8, 0, 0x010f, 2, 8, 146);
  entry(8, 1, 0x0110, 2, 5, 154);
  entry(8, 2, 0x8769, 4, 1, 74);
  entry(8, 3, 0x8825, 4, 1, 92);
  u32(tiff + 58, 0);
  // Exif IFD
  u16(tiff + 74, 1);
  entry(74, 0, 0x9003, 2, 20, 159);
  u32(tiff + 88, 0);
  // GPS IFD
  u16(tiff + 92, 4);
  entry(92, 0, 0x0001, 2, 2, 0);
  entry(92, 1, 0x0002, 5, 3, 184);
  entry(92, 2, 0x0003, 2, 2, 0);
  entry(92, 3, 0x0004, 5, 3, 208);
  u32(tiff + 142, 0);
  // EXIF 规范：不超过 4 字节的 ASCII 直接内联在 value 字段（不能写成偏移）
  buf[tiff + 94 + 8] = 78; // 'N'
  buf[tiff + 94 + 9] = 0;
  buf[tiff + 118 + 8] = 69; // 'E'
  buf[tiff + 118 + 9] = 0;
  // 数据区
  ascii(tiff + 146, 'TestCam\0');
  ascii(tiff + 154, 'X100\0');
  ascii(tiff + 159, '2026:09:03 20:10:00\0');
  u32(tiff + 184, 31);
  u32(tiff + 188, 1);
  u32(tiff + 192, 47);
  u32(tiff + 196, 1);
  u32(tiff + 200, 0);
  u32(tiff + 204, 1);
  u32(tiff + 208, 119);
  u32(tiff + 212, 1);
  u32(tiff + 216, 58);
  u32(tiff + 220, 1);
  u32(tiff + 224, 0);
  u32(tiff + 228, 1);
  return buf.buffer;
}
const exif = parseExif(buildExifJpeg());
check('读出台相机机型', exif && exif.camera === 'TestCam X100', exif && exif.camera);
check('DateTimeOriginal 归一化', exif && exif.capturedAt === '2026-09-03T20:10:00', exif && exif.capturedAt);
check('GPS 度分秒转十进制', exif && Math.abs(exif.gps.lat - (31 + 47 / 60)) < 1e-6 && Math.abs(exif.gps.lng - (119 + 58 / 60)) < 1e-6, exif && exif.gps);
check('非 JPEG 返回 null', parseExif(new Uint8Array([1, 2, 3]).buffer) === null);
check('无 EXIF 的 JPEG 返回 null', parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer) === null);
check('日期格式非法返回 undefined', normalizeExifDate('not a date') === undefined);

console.log('[14] 导入命令（素材 + 证据节点 + 关联）');
const assetsBefore = doc().assets.length;
const nodesBefore = doc().nodes.length;
const zhangBefore = doc().nodes.find((n) => n.id === 'zhang').attachments.length;
state().dispatch(
  importAssets({
    assets: [
      {
        id: 'a-smoke',
        path: 'assets/a-smoke',
        kind: 'image',
        hash: 'cafe'.repeat(16),
        thumbnails: ['a-smoke:256', 'a-smoke:1024'],
        source: 'import',
        sourceLabel: '现场照片',
        zone: 'evidence',
        width: 1200,
        height: 900,
        name: '现场.png',
        no: 'IMG-0100',
        annotations: [],
      },
    ],
    evidenceNodes: [
      { id: 'n-smoke', title: '照片 IMG-0100', x: 160, y: 160, fields: { 来源: '现场照片' }, attachments: ['a-smoke'] },
    ],
    linkNodeId: 'zhang',
  }),
);
check('素材入库', doc().assets.length === assetsBefore + 1 && doc().assets.some((a) => a.id === 'a-smoke'));
const smokeNode = doc().nodes.find((n) => n.id === 'n-smoke');
check(
  '证据节点按草稿建立',
  doc().nodes.length === nodesBefore + 1 && smokeNode.type === 'evidence' && smokeNode.status === 'todo' && smokeNode.confidence === 30 && smokeNode.attachments.includes('a-smoke'),
  smokeNode && { type: smokeNode.type, status: smokeNode.status },
);
check('关联实体挂上附件', doc().nodes.find((n) => n.id === 'zhang').attachments.length === zhangBefore + 1);
state().undo();
check('一次撤销回退素材/节点/附件', doc().assets.length === assetsBefore && doc().nodes.length === nodesBefore && doc().nodes.find((n) => n.id === 'zhang').attachments.length === zhangBefore);
state().redo();
state().dispatch(updateAsset('a-smoke', { sourceLabel: '书证翻拍', no: 'IMG-0101' }));
check('素材可改编号与来源', doc().assets.find((a) => a.id === 'a-smoke').no === 'IMG-0101' && doc().assets.find((a) => a.id === 'a-smoke').sourceLabel === '书证翻拍');

console.log('[15] 图片纯函数（尺寸 / 旋转 / 缩放 / 层级 / 吸附 / 对齐）');
const fit = fitImageSize(1200, 900);
check('按素材比例缩到 320×240', fit.w === 320 && fit.h === 240, fit);
const small = fitImageSize(100, 50);
check('小图不放大', small.w === 100 && small.h === 50, small);
const fallbackSize = fitImageSize(undefined, undefined);
check('缺尺寸回落 320×240', fallbackSize.w === 320 && fallbackSize.h === 240, fallbackSize);
check('旋转 14° 吸附到 15°', snapRotation(14) === 15, snapRotation(14));
check('旋转 20° 不吸附', snapRotation(20) === 20, snapRotation(20));
check('旋转 88° 吸附到 90°', snapRotation(88) === 90, snapRotation(88));
check('旋转 359° 吸附回 0°', snapRotation(359) === 0, snapRotation(359));
const east = resizeImageRect({ x: 0, y: 0, w: 200, h: 100 }, 'e', 40, 0);
check('东侧手柄只改宽', east.w === 240 && east.h === 100 && east.x === 0, east);
const corner = resizeImageRect({ x: 0, y: 0, w: 200, h: 100 }, 'se', 40, 20, { lockAspect: true });
check('等比缩放保持 2:1', corner.w === 240 && corner.h === 120, corner);
const center = resizeImageRect({ x: 100, y: 100, w: 100, h: 100 }, 'e', 20, 0, { fromCenter: true });
check('从中心对称缩放', center.w === 140 && center.x === 80, center);
const layers = reorderLayers([{ id: 'a', zIndex: 1 }, { id: 'b', zIndex: 2 }, { id: 'c', zIndex: 3 }], 'a', 'front');
check('置顶后 a 最大', layers.a === 3 && layers.b === 1 && layers.c === 2, layers);
const upLayers = reorderLayers([{ id: 'a', zIndex: 1 }, { id: 'b', zIndex: 2 }, { id: 'c', zIndex: 3 }], 'b', 'up');
check('上移一层与 c 交换', upLayers.b === 3 && upLayers.c === 2, upLayers);
check('nextZIndex 取最大值 +1', nextZIndex([{ zIndex: 3 }, { zIndex: 7 }]) === 8);
const aligned = snapImageRect({ x: 100, y: 100, w: 50, h: 50 }, [{ x: 100, y: 300, w: 50, h: 50 }]);
check('左边对齐吸附', aligned.rect.x === 100 && aligned.snap === 'align', aligned);
check('对齐时产出竖向参考线', aligned.guides.length === 1 && aligned.guides[0].axis === 'x' && aligned.guides[0].pos === 100, aligned.guides);
const gridSnap = snapImageRect({ x: 103, y: 101, w: 10, h: 10 }, []);
check('无对齐目标时按 8px 网格吸附', gridSnap.snap === 'grid' && gridSnap.rect.x === 104 && gridSnap.rect.y === 104, gridSnap);
const leftAligned = alignRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 20, w: 20, h: 10 }], 'left');
check('多选左对齐', leftAligned[0].x === 0 && leftAligned[1].x === 0, leftAligned);
const distributed = distributeRects(
  [{ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 }],
  'x',
);
// 首尾固定，中间两张按相等间隙（gap = (110 - 30) / 2 = 40）摆放 → 0 / 50 / 100
check('三张等距分布', distributed[0].x === 0 && distributed[1].x === 50 && distributed[2].x === 100, distributed);

console.log('[16] 图片命令（增删改 / 层级 / 多选 / 吸附）');
const imagesBefore = doc().imageNodes.length;
state().dispatch(addImageNode({ id: 'img-a', assetId: 'a-smoke', x: 100, y: 100, assetWidth: 1200, assetHeight: 900 }));
const imgA = doc().imageNodes.find((item) => item.id === 'img-a');
check('新增图片节点', doc().imageNodes.length === imagesBefore + 1 && imgA.kind === 'freeImage');
check('新增按素材比例定尺寸', imgA.w === 320 && imgA.h === 240 && imgA.zIndex === 1, imgA);
state().dispatch(updateImageNode('img-a', { rotation: -90, borderStyle: 'polaroid', pinned: true }));
const rotated = doc().imageNodes.find((item) => item.id === 'img-a');
check('角度归一 + 边框 + 图钉', rotated.rotation === 270 && rotated.borderStyle === 'polaroid' && rotated.pinned === true, rotated);
state().dispatch(resizeImageNode('img-a', { x: 120, y: 130, w: 400, h: 300 }));
const resized = doc().imageNodes.find((item) => item.id === 'img-a');
check('缩放与位置写入', resized.x === 120 && resized.w === 400 && resized.h === 300, resized);
state().dispatch(addImageNode({ id: 'img-b', assetId: 'a-smoke', x: 600, y: 200, siblings: doc().imageNodes }));
check('第二张图片层级递增', doc().imageNodes.find((item) => item.id === 'img-b').zIndex === 2, doc().imageNodes.map((i) => i.zIndex));
state().dispatch(setImageLayer('img-a', 'front'));
check('置顶后层级换序', doc().imageNodes.find((item) => item.id === 'img-a').zIndex === 2 && doc().imageNodes.find((item) => item.id === 'img-b').zIndex === 1);
state().undo();
check('撤销置顶恢复层级', doc().imageNodes.find((item) => item.id === 'img-a').zIndex === 1);
state().dispatch(moveImageNodes([{ id: 'img-a', x: 10, y: 20 }, { id: 'img-b', x: 30, y: 40 }]));
const movedBoth = doc().imageNodes.every((item) => (item.id === 'img-a' ? item.x === 10 && item.y === 20 : item.x === 30 && item.y === 40));
check('多选移动一条命令改两张', movedBoth, doc().imageNodes.map((i) => [i.x, i.y]));
state().undo();
check('撤销多选移动整组回退', doc().imageNodes.find((item) => item.id === 'img-a').x === 120 && doc().imageNodes.find((item) => item.id === 'img-b').x === 600);
const zhangPhotoBefore = doc().nodes.find((n) => n.id === 'zhang').photo;
state().dispatch(attachImageNode('img-a', 'zhang'));
check('吸附人物写头像照片', doc().nodes.find((n) => n.id === 'zhang').photo === 'a-smoke' && doc().imageNodes.find((i) => i.id === 'img-a').linkedNodeId === 'zhang');
state().dispatch(attachImageNode('img-b', 'n-smoke'));
check('吸附非人物并入附件', doc().nodes.find((n) => n.id === 'n-smoke').attachments.filter((id) => id === 'a-smoke').length >= 1);
state().dispatch(attachImageNode('img-a', null));
check('取消吸附清掉关联', doc().imageNodes.find((i) => i.id === 'img-a').linkedNodeId === undefined);
void zhangPhotoBefore;
const countBeforeDelete = doc().imageNodes.length;
state().dispatch(deleteImageNode('img-b'));
check('删除图片', doc().imageNodes.length === countBeforeDelete - 1);
state().undo();
check('撤销删除恢复图片', doc().imageNodes.length === countBeforeDelete);
state().dispatch(deleteAsset('a-smoke'));
check('删除素材级联删掉引用它的图片', doc().imageNodes.every((item) => item.assetId !== 'a-smoke'), doc().imageNodes.map((i) => i.assetId));
check('删除素材同时摘掉头像', doc().nodes.find((n) => n.id === 'zhang').photo === undefined);
state().undo();
check('撤销级联恢复素材与图片', doc().imageNodes.length === countBeforeDelete && doc().assets.some((a) => a.id === 'a-smoke'));
const dangling = normalizeDoc({
  meta: { id: 'legacy-img', title: '旧存档', createdAt: 'now', updatedAt: 'now' },
  nodes: [],
  edges: [],
  assets: [],
  imageNodes: [{ id: 'img-ghost', assetId: 'a-gone', x: 0, y: 0, w: 100, h: 100 }],
});
check('迁移丢弃素材不存在的图片节点', dangling.imageNodes.length === 0, dangling.imageNodes.length);
const noImages = normalizeDoc({ meta: { id: 'legacy-noimg', title: '旧存档2', createdAt: 'now', updatedAt: 'now' }, nodes: [], edges: [] });
check('旧文档自动补空 imageNodes', Array.isArray(noImages.imageNodes) && noImages.imageNodes.length === 0);
const roundTrip = fromJson(toJson(doc()));
check('JSON 往返保留图片节点', roundTrip.imageNodes.length === doc().imageNodes.length, roundTrip.imageNodes.length);

console.log('[17] 标注几何（归一化 / 命中 / 马赛克 / 像素换算）');
const {
  annotationBBox,
  arrowHeadPoints,
  clamp01,
  createAnnotation,
  describeAnnotation,
  hitAnnotation,
  mosaicCells,
  normalizeGeom,
  rectFromPoints,
  toPixelPoints,
  toPixelRect,
} = require(path.join(out, 'lib', 'annotation.js'));
check('clamp01 夹紧越界与 NaN', clamp01(1.4) === 1 && clamp01(-2) === 0 && clamp01(Number.NaN) === 0);
const clipped = normalizeGeom({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 });
check('归一化夹到 0–1 并收窄宽高', clipped.x === 0 && clipped.y === 0.9 && clipped.w === 0.5 && Math.abs(clipped.h - 0.1) < 1e-9, clipped);
const dragRect = rectFromPoints({ x: 0.6, y: 0.2 }, { x: 0.2, y: 0.7 });
check('拖动两点生成左上角矩形', dragRect.x === 0.2 && dragRect.y === 0.2 && Math.abs(dragRect.w - 0.4) < 1e-9 && Math.abs(dragRect.h - 0.5) < 1e-9, dragRect);
const rectAnn = createAnnotation('rect', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { text: '  黄框  ', color: '#2E7D64', id: 'an-smoke' });
check('标注默认带色并 trim 文本', rectAnn.text === '黄框' && rectAnn.color === '#2E7D64' && rectAnn.id === 'an-smoke', rectAnn);
const penAnn = createAnnotation('pen', { x: 0, y: 0, w: 0, h: 0, points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] });
check('默认色是证据红', penAnn.color === '#C0392B', penAnn.color);
const penBox = annotationBBox(penAnn);
check('折线外接框由点集推出', penBox.x === 0.1 && penBox.y === 0.2 && Math.abs(penBox.w - 0.4) < 1e-9 && Math.abs(penBox.h - 0.4) < 1e-9, penBox);
check('命中判定落在框内', hitAnnotation(rectAnn, { x: 0.2, y: 0.2 }));
check('容差内视为命中', hitAnnotation(rectAnn, { x: 0.31, y: 0.2 }, 0.02) && !hitAnnotation(rectAnn, { x: 0.4, y: 0.2 }, 0.02));
const cells = mosaicCells({ x: 0.2, y: 0.2, w: 0.4, h: 0.2 }, 8);
check('马赛克按 8 列切格并落在区域内', cells.length === 32 && cells.every((c) => c.x >= 0.2 - 1e-9 && c.y >= 0.2 - 1e-9 && c.x + c.w <= 0.6 + 1e-9 && c.y + c.h <= 0.4 + 1e-9), cells.length);
const heads = arrowHeadPoints({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 0.05);
check('箭头两翼分居轴线两侧并朝向箭尾', heads[0].x < 1 && heads[1].x < 1 && (heads[0].y - 0.5) * (heads[1].y - 0.5) < 0, heads);
check('归一化矩形换算像素', JSON.stringify(toPixelRect({ x: 0.5, y: 0.25, w: 0.25, h: 0.5 }, 800, 400)) === JSON.stringify({ x: 400, y: 100, w: 200, h: 200 }));
const pxPoints = toPixelPoints([{ x: 0.5, y: 0.5 }], 200, 100);
check('归一化点换算像素', pxPoints[0].x === 100 && pxPoints[0].y === 50, pxPoints[0]);
check('标注摘要文案', describeAnnotation({ ...rectAnn, text: undefined }) === '矩形框' && describeAnnotation({ ...rectAnn, shape: 'text' }) === '文字：黄框', describeAnnotation(rectAnn));
const annMigrated = normalizeDoc({
  meta: { id: 'legacy-ann', title: '旧标注存档', createdAt: 'now', updatedAt: 'now' },
  nodes: [],
  edges: [],
  assets: [
    {
      id: 'a-ann',
      path: 'assets/a-ann',
      kind: 'image',
      hash: 'h',
      annotations: [
        { id: 'an-ok', shape: 'rect', geom: { x: 1.4, y: -0.5, w: 0.3, h: 0.3 } },
        { id: 'an-empty', shape: 'rect', geom: {} },
        { id: 'an-bad', shape: 'star', geom: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      ],
    },
  ],
});
const migratedAnn = annMigrated.assets[0].annotations;
check('迁移夹紧越界坐标并补默认色', migratedAnn.length === 1 && migratedAnn[0].id === 'an-ok' && migratedAnn[0].geom.x === 1 && migratedAnn[0].geom.y === 0 && migratedAnn[0].color === '#C0392B', migratedAnn);
check('迁移丢弃空几何与非法图形', !migratedAnn.some((a) => a.id === 'an-empty' || a.id === 'an-bad'));
check('导出 JSON 保留标注', fromJson(toJson(annMigrated)).assets[0].annotations.length === 1);

console.log('[18] 标注命令（增改删 / 区域锚点 / 撤销）');
const annAsset = () => doc().assets.find((a) => a.id === 'a-smoke');
state().dispatch(addAnnotation('a-smoke', createAnnotation('rect', { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, { id: 'an-1' })));
check('新增标注写入素材', annAsset().annotations.length === 1 && annAsset().annotations[0].id === 'an-1', annAsset().annotations.length);
state().dispatch(addAnnotation('a-smoke', createAnnotation('anchor', { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, { id: 'an-2' })));
check('区域锚点可新增', annAsset().annotations.length === 2);
state().dispatch(linkAnnotation('a-smoke', 'an-2', 'zhang'));
check('区域锚点关联节点', annAsset().annotations.find((a) => a.id === 'an-2').linkedNodeId === 'zhang');
state().dispatch(linkAnnotation('a-smoke', 'an-2', null));
check('取消区域锚点关联', annAsset().annotations.find((a) => a.id === 'an-2').linkedNodeId === undefined);
state().dispatch(updateAnnotation('a-smoke', 'an-1', { geom: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, text: '重点区域' }));
const updatedAnn = annAsset().annotations.find((a) => a.id === 'an-1');
check('修改标注几何与文字', updatedAnn.geom.x === 0.5 && updatedAnn.text === '重点区域', updatedAnn);
state().undo();
check('撤销修改恢复原始几何', annAsset().annotations.find((a) => a.id === 'an-1').geom.x === 0.1);
state().dispatch(deleteAnnotation('a-smoke', 'an-1'));
check('删除标注', annAsset().annotations.length === 1 && annAsset().annotations[0].id === 'an-2');
state().undo();
check('撤销删除恢复标注', annAsset().annotations.length === 2);
state().dispatch(clearAnnotations('a-smoke'));
check('清空标注', annAsset().annotations.length === 0);
state().undo();
check('撤销清空恢复标注', annAsset().annotations.length === 2);
state().dispatch(deleteAnnotation('a-smoke', 'an-2'));
state().dispatch(deleteAnnotation('a-smoke', 'an-1'));
check('标注清空后素材仍可导出 JSON', fromJson(toJson(doc())).assets.find((a) => a.id === 'a-smoke').annotations.length === 0);

console.log('[19] PDF 抽页 / 视频抽帧规划（M2-5）');
check('页码范围解析多段并升序去重', JSON.stringify(parsePageRange('3,1-2,2', 9)) === JSON.stringify([1, 2, 3]), parsePageRange('3,1-2,2', 9));
check('页码范围夹到文档末页', JSON.stringify(parsePageRange('1-9', 4)) === JSON.stringify([1, 2, 3, 4]));
check('页码范围支持全角逗号与顿号', JSON.stringify(parsePageRange('2，4、5', 9)) === JSON.stringify([2, 4, 5]));
check('页码范围倒序区间自动纠正', JSON.stringify(parsePageRange('3-1', 5)) === JSON.stringify([1, 2, 3]));
check('页码范围越界单页被丢弃', JSON.stringify(parsePageRange('2,7', 5)) === JSON.stringify([2]));
check('空页码范围与零页文档返回空', parsePageRange('', 10).length === 0 && parsePageRange('1-3', 0).length === 0);
const frames = planFrameTimes(60, 4);
check('抽帧取每段中点', JSON.stringify(frames) === JSON.stringify([7.5, 22.5, 37.5, 52.5]), frames);
check('抽帧数量夹到 1', JSON.stringify(planFrameTimes(10, 0)) === JSON.stringify([5]));
check('抽帧数量夹到 24', planFrameTimes(120, 99).length === 24);
check('非法时长不抽帧', planFrameTimes(0, 5).length === 0 && planFrameTimes(Number.NaN, 5).length === 0);
check('时长格式化 1:23', formatDuration(83) === '1:23');
check('时长格式化 1:02:03', formatDuration(3723) === '1:02:03');
check('时长格式化补零与异常值', formatDuration(9) === '0:09' && formatDuration(-5) === '0:00');
check('抽页文件名去扩展名', extractedName('办案记录.pdf', '第1页') === '办案记录-第1页.png');
check('抽帧文件名无扩展名兜底', extractedName('无扩展名', 'y') === '无扩展名-y.png' && extractedName('.hidden', 'x') === '.hidden-x.png');

console.log('[20] DSL 序列化（M3-1）');
const { createNameTable, serializeDoc, stableJson } = require(path.join(out, 'dsl', 'serialize.js'));
const { createDemoDoc } = require(path.join(out, 'data', 'demo.js'));
const base = createDemoDoc();
const withParts = (patch) => ({ ...base, ...patch });
const text1 = serializeDoc(base);
const dslLines = text1.split('\n');
check('序列化非空且以右花括号收尾', dslLines.length > 10 && dslLines[dslLines.length - 2] === '}', text1.slice(-40));
check(
  '标题行写入案件名与编号',
  dslLines[2] === 'case ' + JSON.stringify(base.meta.title) + ' caseNo ' + JSON.stringify(base.meta.caseNo) + ' {',
  dslLines[2],
);
check('两次序列化逐字节一致（幂等）', serializeDoc(base) === text1);
check('节点数组顺序不影响输出', serializeDoc(withParts({ nodes: [...base.nodes].reverse() })) === text1);
check('行尾无空格、无制表符、无连续空行结尾', dslLines.every((line) => line === line.replace(/[ \t]+$/, '') && !line.includes('\t')) && !/\n\n$/.test(text1));
check('实体按类型顺序排列（人物在事件之前）', text1.indexOf('  person ') > 0 && text1.indexOf('  person ') < text1.indexOf('  event '));
check(
  '每个实体与组都写出坐标',
  (text1.match(/^ {4}at\(/gm) || []).length === base.nodes.length + base.groups.length,
  (text1.match(/^ {4}at\(/gm) || []).length,
);
check(
  '每个实体与组都写出尺寸',
  (text1.match(/^ {4}size\(/gm) || []).length === base.nodes.length + base.groups.length,
);
check('三种线型箭头齐全', text1.includes('--转账 50 万-->') && text1.includes('-.疑似同伙.->') && text1.includes('..通话..>'));
check('边块写出 rel 与 style', text1.includes('    rel: transfer') && text1.includes('    style: solid'));
check(
  'style 条数与模型一致',
  (text1.match(/^ {4}style: solid$/gm) || []).length === base.edges.filter((edge) => edge.style === 'solid').length,
);
check(
  '分组块含颜色与成员列表',
  text1.includes('group g_suspect ' + JSON.stringify(base.groups[0].title) + ' color=' + JSON.stringify(base.groups[0].color) + ' {') &&
    text1.includes('    nodes: ['),
);
check('视图块保留类型与名称', text1.includes('view timeline ' + JSON.stringify(base.views[0].name) + ' {'));

const renamed = withParts({
  nodes: base.nodes.map((node) => (node.id === 'zhang' ? { ...node, id: '人物-甲' } : node)),
  edges: base.edges.map((edge) => ({
    ...edge,
    source: edge.source === 'zhang' ? '人物-甲' : edge.source,
    target: edge.target === 'zhang' ? '人物-甲' : edge.target,
  })),
});
const renamedText = serializeDoc(renamed);
check('非 ASCII id 名称化为合法标识符', renamedText.includes(' 人物_甲 ') && !renamedText.includes(' 人物-甲 '));
check('名称化后原名用 id 字段保留', renamedText.includes('    id: "人物-甲"'));
check(
  '被改名 id 的连线跟着改名',
  renamedText.split('\n').some((line) => line.includes(' 人物_甲 ') && line.includes('--')),
);

const fieldDoc = withParts({
  nodes: base.nodes.map((node) => (node.id === 'zhang' ? { ...node, fields: { 自定义: 1, 年龄: 42 } } : node)),
});
check('字段按模板顺序、自定义键排后', serializeDoc(fieldDoc).includes('fields: { 年龄: 42, 自定义: 1 }'));

const escDoc = withParts({
  nodes: base.nodes.map((node) => (node.id === 'zhang' ? { ...node, title: '引用"测试"\n第二行' } : node)),
});
const escText = serializeDoc(escDoc);
check('标题引号与换行被转义', escText.includes(JSON.stringify('引用"测试"\n第二行')));
check('转义后不产生额外物理行', escText.split('\n').length === text1.split('\n').length);

const timeDoc = withParts({
  nodes: base.nodes.map((node) => (node.id === 'zhang' ? { ...node, time: { start: '2026-09-01', end: '2026-09-10' } } : node)),
});
check('时间区间写成 start/end 形式', serializeDoc(timeDoc).includes('time: 2026-09-01/2026-09-10'));

const litDoc = withParts({
  nodes: base.nodes.map((node) => (node.id === 'zhang' ? { ...node, fields: { 金额: 1234.5, 已核实: true } } : node)),
});
const litText = serializeDoc(litDoc);
check('数字与布尔字面量不加引号', litText.includes('金额: 1234.5') && litText.includes('已核实: true'));

const plainEdgeDoc = withParts({ edges: base.edges.map((edge) => ({ ...edge, label: undefined })) });
check('无标签关系写成裸箭头', /--> [A-Za-z_][A-Za-z0-9_]* \{/.test(serializeDoc(plainEdgeDoc)));

const quotedLabelDoc = withParts({
  edges: base.edges.map((edge) => (edge.id === base.edges[0].id ? { ...edge, label: '疑似->同伙' } : edge)),
});
check('标签含箭头符号时加引号', serializeDoc(quotedLabelDoc).includes('--' + JSON.stringify('疑似->同伙') + '-->'));

const clashDoc = withParts({
  nodes: [...base.nodes, { ...base.nodes[0], id: 'a-b' }, { ...base.nodes[0], id: 'a_b' }],
  edges: [],
});
const clashText = serializeDoc(clashDoc);
check('名称冲突自动加序号', clashText.includes(' a_b ') && clashText.includes(' a_b_2 '));
check('冲突双方都保留原 id', clashText.includes('    id: "a-b"') && clashText.includes('    id: "a_b"'));

const emptyText = serializeDoc(withParts({ nodes: [], edges: [], groups: [], views: [] }));
check(
  '空文档仍输出合法骨架',
  emptyText.trim().startsWith('// 案情板') && emptyText.includes('case ') && emptyText.trim().endsWith('}'),
);
check('空文档不出现 undefined / null 字面量', !/undefined|null/.test(emptyText));

const snapshot = JSON.stringify(base);
serializeDoc(base);
check('序列化不修改模型（纯函数）', JSON.stringify(base) === snapshot);
check('跨 JSON 往返输出不变', serializeDoc(fromJson(toJson(base))) === text1);
check('stableJson 递归排序对象键', stableJson({ b: 1, a: { d: 2, c: 3 } }) === '{"a":{"c":3,"d":2},"b":1}');
check(
  'createNameTable 双向映射且去重',
  (() => {
    const table = createNameTable(['x-y', 'x_y']);
    return table.names.get('x-y') === 'x_y' && table.names.get('x_y') === 'x_y_2' && table.reverse.get('x_y_2') === 'x_y';
  })(),
);

console.log('[21] DSL 解析（M3-2）');
const { parseDsl, parseArrow, hasErrors } = require(path.join(out, 'dsl', 'parse.js'));
const demoText = serializeDoc(base);
const parsedDemo = parseDsl(demoText);
check('演示文档解析无诊断', parsedDemo.diagnostics.length === 0, parsedDemo.diagnostics);
check(
  '解析后节点/关系/组/视图数量一致',
  parsedDemo.doc.nodes.length === base.nodes.length &&
    parsedDemo.doc.edges.length === base.edges.length &&
    parsedDemo.doc.groups.length === base.groups.length &&
    parsedDemo.doc.views.length === base.views.length,
  {
    nodes: parsedDemo.doc.nodes.length,
    edges: parsedDemo.doc.edges.length,
    groups: parsedDemo.doc.groups.length,
    views: parsedDemo.doc.views.length,
  },
);
check('解析后再序列化逐字节一致', serializeDoc(parsedDemo.doc) === demoText);
check('标题与案号往返', parsedDemo.doc.meta.title === base.meta.title && parsedDemo.doc.meta.caseNo === base.meta.caseNo);
const zhangSrc = base.nodes.find((node) => node.id === 'zhang');
const zhangDst = parsedDemo.doc.nodes.find((node) => node.id === 'zhang');
check(
  '节点坐标/尺寸/状态/置信度保真',
  Boolean(zhangDst) &&
    ['x', 'y', 'w', 'h', 'status', 'confidence', 'type', 'title'].every((key) => zhangDst[key] === zhangSrc[key]),
  zhangDst,
);
check(
  '字段值/标签/别名/备注保真',
  Boolean(zhangDst) &&
    JSON.stringify(zhangDst.fields) === JSON.stringify(zhangSrc.fields) &&
    zhangDst.tags.join(',') === zhangSrc.tags.join(',') &&
    (zhangDst.aliases || []).join(',') === (zhangSrc.aliases || []).join(',') &&
    zhangDst.notes === zhangSrc.notes,
);
const transferSrc = base.edges.find((edge) => edge.id === 'e-transfer');
const transferDst = parsedDemo.doc.edges.find((edge) => edge.id === 'e-transfer');
check(
  '关系端点/类型/线型/权重/证据保真',
  Boolean(transferDst) &&
    transferDst.source === transferSrc.source &&
    transferDst.target === transferSrc.target &&
    transferDst.relType === transferSrc.relType &&
    transferDst.style === transferSrc.style &&
    transferDst.label === transferSrc.label &&
    transferDst.weight === transferSrc.weight &&
    JSON.stringify(transferDst.evidenceIds) === JSON.stringify(transferSrc.evidenceIds),
  transferDst,
);
check('关系时间区间保真', JSON.stringify(transferDst.time) === JSON.stringify(transferSrc.time), transferDst.time);
check(
  '组边界与颜色保真',
  JSON.stringify(parsedDemo.doc.groups[0].bounds) === JSON.stringify(base.groups[0].bounds) &&
    parsedDemo.doc.groups[0].color === base.groups[0].color &&
    parsedDemo.doc.groups[0].opacity === base.groups[0].opacity,
  parsedDemo.doc.groups[0],
);
check('组成员通过 groupId 回填', parsedDemo.doc.nodes.filter((node) => node.groupId === 'g-suspect').length === 2);
check(
  '视图类型与名称保真',
  parsedDemo.doc.views[0].kind === base.views[0].kind && parsedDemo.doc.views[0].name === base.views[0].name,
  parsedDemo.doc.views[0],
);

check(
  '空标签箭头三种线型',
  parseArrow('-->').style === 'solid' && parseArrow('-.->').style === 'dashed' && parseArrow('..>').style === 'dotted',
);
check('空标签箭头不带 label', parseArrow('-->').label === undefined);
check(
  '带标签箭头解析出线型与标签',
  parseArrow('--转账 500000-->').style === 'solid' &&
    parseArrow('--转账 500000-->').label === '转账 500000' &&
    parseArrow('..通话..>').style === 'dotted' &&
    parseArrow('..通话..>').label === '通话',
);
check('引号标签去引号', parseArrow('--"转账 50 万"-->').label === '转账 50 万');
check('无法识别的箭头返回 null', parseArrow('===>') === null && parseArrow('') === null);

const danglingEdge = parseDsl('case "x" {\n  person a "A" { }\n  a --call--> zzz { rel: call }\n}');
check(
  '悬空引用报错且已解析实体保留',
  hasErrors(danglingEdge.diagnostics) &&
    danglingEdge.doc.nodes.length === 1 &&
    danglingEdge.diagnostics.some((d) => d.message.includes('引用「zzz」没有对应声明')),
  danglingEdge.diagnostics,
);
const duplicate = parseDsl('case "x" {\n  person a "A" { }\n  person a "B" { }\n}');
check(
  '重复声明报错且只实例化一次',
  duplicate.doc.nodes.length === 1 && duplicate.diagnostics.some((d) => d.message.includes('id「a」重复声明')),
  { nodes: duplicate.doc.nodes.length, diagnostics: duplicate.diagnostics },
);
const selfLoop = parseDsl('case "x" {\n  person a "A" { }\n  a --自己--> a { }\n}');
check('自环报错且不生成关系', hasErrors(selfLoop.diagnostics) && selfLoop.doc.edges.length === 0, selfLoop.diagnostics);
const unclosed = parseDsl('case "x" {\n  person a "A" {\n');
check(
  '未闭合块报错但已解析实体保留',
  hasErrors(unclosed.diagnostics) && unclosed.doc.nodes.length === 1,
  { nodes: unclosed.doc.nodes.length, diagnostics: unclosed.diagnostics },
);
const badEnum = parseDsl('case "x" {\n  person a "A" { status: suspect }\n}');
check(
  '非法枚举报错并回落默认值',
  badEnum.doc.nodes[0].status === 'todo' && badEnum.diagnostics.some((d) => d.message.includes('status 只能是')),
  badEnum.doc.nodes[0],
);
const badCoord = parseDsl('case "x" {\n  person a "A" { at(a, b) }\n}');
check(
  '非数字坐标报错且给出修复建议',
  badCoord.diagnostics.filter((d) => d.message.includes('必须是数字')).length === 2 &&
    badCoord.diagnostics.some((d) => (d.hint || '').includes('at(x, y)')),
  badCoord.diagnostics,
);
const lineCheck = parseDsl('case "x" {\n  person a "A" {\n    status: suspect\n  }\n}');
check('诊断行号为一基且指向出错行', lineCheck.diagnostics[0].line === 3 && lineCheck.diagnostics[0].column > 0, lineCheck.diagnostics[0]);
check('诊断区间落在文本内', lineCheck.diagnostics.every((d) => d.from >= 0 && d.to <= 'case "x" {\n  person a "A" {\n    status: suspect\n  }\n}'.length && d.to >= d.from));

const quoted = parseDsl(
  'case "x" {\n  person a "A" { id: "p-a" }\n  person b "B" { }\n  group g "G" { nodes: ["p-a", b] }\n  "p-a" --> b { id: "e-x" }\n}',
);
check(
  'id 覆盖行生效且关系可用 quoted id 引用',
  !hasErrors(quoted.diagnostics) &&
    quoted.doc.nodes.some((node) => node.id === 'p-a') &&
    quoted.doc.edges.length === 1 &&
    quoted.doc.edges[0].source === 'p-a',
  quoted.diagnostics,
);
check(
  '组引用 quoted id 与名字混用',
  quoted.doc.nodes.filter((node) => node.groupId === 'g').length === 2,
  quoted.doc.nodes.map((node) => node.groupId),
);
const dupEdge = parseDsl('case "x" {\n  person a "A" { }\n  person b "B" { }\n  a --> b { id: "e1" }\n  a --> b { id: "e1" }\n}');
check(
  '关系 id 重复报错且只保留一条',
  dupEdge.doc.edges.length === 1 && dupEdge.diagnostics.some((d) => d.message.includes('关系 id「e1」重复')),
  dupEdge.diagnostics,
);
const noIdEdge = parseDsl('case "x" {\n  person a "A" { }\n  person b "B" { }\n  a --call--> b { }\n}');
check(
  '关系缺 id 时自动生成并警告',
  noIdEdge.doc.edges.length === 1 &&
    noIdEdge.doc.edges[0].id === 'e_a__b' &&
    noIdEdge.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('已自动生成')),
  noIdEdge.doc.edges,
);
const unknownField = parseDsl('case "x" {\n  person a "A" { foo: 1 }\n}');
check(
  '未知字段 warning 并给出 fields 提示',
  unknownField.doc.nodes[0] !== undefined &&
    unknownField.diagnostics.some((d) => d.severity === 'warning' && (d.hint || '').includes('fields:')),
  unknownField.diagnostics,
);
const noHeader = parseDsl('{ person a "A" { } }');
check(
  '缺 case 文件头仍解析块内语句',
  noHeader.doc.nodes.length === 1 &&
    noHeader.doc.meta.title === '未命名案件' &&
    noHeader.diagnostics.some((d) => d.severity === 'warning' && d.message.includes('缺少 case 文件头')),
  noHeader.doc.meta,
);
const commented = parseDsl('// 头注释\ncase "x" {\n  /* 块注释 */ person a "A" { }\n}');
check('注释行不产生诊断', !hasErrors(commented.diagnostics) && commented.doc.nodes.length === 1, commented.diagnostics);
let threw = false;
let emptyResult = null;
try {
  emptyResult = parseDsl('');
} catch (error) {
  threw = true;
}
check('空文本不抛异常且返回空文档', !threw && emptyResult !== null && emptyResult.doc.nodes.length === 0 && emptyResult.diagnostics.length > 0);

const rich = parseDsl(
  'case "x" {\n  person a "A" { time: 2026-09-01/2026-09-10 fields: { 年龄: 42 } confidence: 120 }\n  person b "B" { }\n  view timeline "T" { id: "v1" camera: 12, 34, 2 filters: { types: [person] } steps: [a, b] }\n  a -.证据不足.-> b { id: "e1" rel: call scenario: { s1: support } }\n}',
);
check('时间区间解析为 start/end', JSON.stringify(rich.doc.nodes[0].time) === JSON.stringify({ start: '2026-09-01', end: '2026-09-10' }), rich.doc.nodes[0].time);
check('置信度夹在 0–100', rich.doc.nodes[0].confidence === 100);
check(
  '视图 camera/filters/steps 解析',
  JSON.stringify(rich.doc.views[0].camera) === JSON.stringify({ x: 12, y: 34, zoom: 2 }) &&
    JSON.stringify(rich.doc.views[0].filters) === JSON.stringify({ types: ['person'] }) &&
    JSON.stringify(rich.doc.views[0].steps) === JSON.stringify(['a', 'b']),
  rich.doc.views[0],
);
check(
  '关系 scenario 与箭头线型解析',
  rich.doc.edges[0].style === 'dashed' &&
    rich.doc.edges[0].label === '证据不足' &&
    JSON.stringify(rich.doc.edges[0].scenario) === JSON.stringify({ s1: 'support' }),
  rich.doc.edges[0],
);
const metaA = parseDsl('case "同一案件" { }').doc.meta;
const metaB = parseDsl('case "同一案件" { }').doc.meta;
check(
  '解析为纯函数（同一文本得到同一 meta.id，不读时间）',
  metaA.id === metaB.id && metaA.id.startsWith('case_') && metaA.createdAt === '' && metaA.updatedAt === '',
  metaA,
);

console.log('[22] DSL 三方合并（M3-3）');
const { DSL_EDGE_KEYS, DSL_NODE_KEYS, diffDocs, mergeDslEdit } = require(path.join(out, 'dsl', 'diff.js'));
const { applyDslChanges } = require(path.join(out, 'commands', 'dslCommands.js'));
const { replaceDocument } = require(path.join(out, 'commands', 'docCommands.js'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const baseDoc = createDemoDoc();
const baseParsed = parseDsl(serializeDoc(baseDoc)).doc;
const baseParsedSnapshot = JSON.stringify(baseParsed);
check('同文档 diff 为空', diffDocs(baseDoc, baseDoc).length === 0);
check(
  'DSL 未表达的字段不算删除（sourceHandle 等）',
  diffDocs(baseDoc, baseParsed).length === 0,
  diffDocs(baseDoc, baseParsed),
);
const retitled = clone(baseParsed);
retitled.nodes.find((node) => node.id === 'li').title = '李梅（改）';
const titleChanges = diffDocs(baseParsed, retitled);
check(
  '只改标题时 diff 只有一条 title',
  titleChanges.length === 1 && titleChanges[0].field === 'title' && titleChanges[0].after === '李梅（改）',
  titleChanges,
);
const movedModel = clone(baseParsed);
const draggedLi = movedModel.nodes.find((node) => node.id === 'li');
draggedLi.x = 780;
draggedLi.y = 890;
const moveChanges = diffDocs(baseParsed, movedModel);
check(
  '拖动只产生 x / y 两条字段改动',
  moveChanges.length === 2 && moveChanges.every((change) => change.field === 'x' || change.field === 'y'),
  moveChanges,
);
const withExtra = clone(baseParsed);
withExtra.nodes.push({
  id: 'wang',
  type: 'person',
  title: '王强',
  x: 1200,
  y: 700,
  w: 208,
  h: 96,
  fields: {},
  tags: [],
  status: 'todo',
  confidence: 60,
  attachments: [],
});
check('新增实体产生 add 改动', diffDocs(baseParsed, withExtra).some((change) => change.op === 'add' && change.id === 'wang'));
const deleted = clone(baseParsed);
deleted.nodes = deleted.nodes.filter((node) => node.id !== 'ktv');
deleted.edges = deleted.edges.filter((edge) => edge.source !== 'ktv' && edge.target !== 'ktv');
check('删除实体产生 remove 改动', diffDocs(baseParsed, deleted).some((change) => change.op === 'remove' && change.kind === 'node'));

const mergedNoop = mergeDslEdit(baseParsed, baseParsed, baseParsed);
check('无改动时 changes 为空（不污染撤销栈）', mergedNoop.changes.length === 0 && mergedNoop.conflicts.length === 0);
check('无改动时合并不修改当前文档', JSON.stringify(mergedNoop.doc) === JSON.stringify(baseParsed));
const mergedDrag = mergeDslEdit(baseParsed, retitled, movedModel);
const mergedDragLi = mergedDrag.doc.nodes.find((node) => node.id === 'li');
check(
  '字段级三方合并：拖拽位置与代码改标题互不覆盖',
  mergedDragLi.x === 780 && mergedDragLi.y === 890 && mergedDragLi.title === '李梅（改）' && mergedDrag.conflicts.length === 0,
  { li: mergedDragLi, conflicts: mergedDrag.conflicts },
);
const conflictModel = clone(baseParsed);
conflictModel.nodes.find((node) => node.id === 'li').title = '李梅（画布改）';
const mergedConflict = mergeDslEdit(baseParsed, retitled, conflictModel);
check(
  '同字段冲突保留画布值并上报 conflict',
  mergedConflict.doc.nodes.find((node) => node.id === 'li').title === '李梅（画布改）' &&
    mergedConflict.conflicts.length === 1 &&
    mergedConflict.changes.length === 0,
  mergedConflict.conflicts,
);
const mergedAdd = mergeDslEdit(baseParsed, withExtra, baseParsed);
check(
  '文本新增实体合并进画布',
  mergedAdd.changes.some((change) => change.op === 'add' && change.id === 'wang') &&
    mergedAdd.doc.nodes.some((node) => node.id === 'wang'),
);
const canvasExtra = clone(baseParsed);
canvasExtra.nodes.push({
  id: 'canvas-only',
  type: 'note',
  title: '画布新便签',
  x: 10,
  y: 10,
  w: 200,
  h: 96,
  fields: {},
  tags: [],
  status: 'todo',
  confidence: 50,
  attachments: [],
});
const mergedBoth = mergeDslEdit(baseParsed, withExtra, canvasExtra);
check(
  '两侧各自新增的实体都保留',
  mergedBoth.doc.nodes.some((node) => node.id === 'wang') && mergedBoth.doc.nodes.some((node) => node.id === 'canvas-only'),
  mergedBoth.doc.nodes.map((node) => node.id),
);
const mergedRemove = mergeDslEdit(baseParsed, deleted, baseParsed);
check(
  '文本删除未被画布改动的实体',
  !mergedRemove.doc.nodes.some((node) => node.id === 'ktv') &&
    mergedRemove.changes.some((change) => change.op === 'remove' && change.id === 'ktv'),
);
const movedKtv = clone(baseParsed);
movedKtv.nodes.find((node) => node.id === 'ktv').x += 30;
const mergedRemoveConflict = mergeDslEdit(baseParsed, deleted, movedKtv);
check(
  '画布改过的实体不被文本删除（冲突保留）',
  mergedRemoveConflict.doc.nodes.some((node) => node.id === 'ktv') &&
    mergedRemoveConflict.conflicts.some((change) => change.op === 'remove' && change.id === 'ktv'),
  mergedRemoveConflict.conflicts,
);
check('合并是纯函数（不修改入参 base）', JSON.stringify(baseParsed) === baseParsedSnapshot);
check(
  '字段白名单覆盖 8 类节点与关系字段',
  DSL_NODE_KEYS.includes('photo') && DSL_NODE_KEYS.includes('fields') && DSL_EDGE_KEYS.includes('scenario') && DSL_EDGE_KEYS.includes('evidenceIds'),
);

// 命令层：一批改动 = 一条 Command = 一次撤销
// changes 是相对「当前文档」的增量，所以先让 store 处于合并时的 current 状态
state().dispatch(replaceDocument(movedModel));
const batchBase = clone(doc());
const batchReport = mergeDslEdit(baseParsed, retitled, movedModel);
const pastLen = state().past.length;
state().dispatch(applyDslChanges(batchReport.changes));
const afterBatch = doc();
check(
  '一批改动写入后画布同时包含位置与标题',
  afterBatch.nodes.find((node) => node.id === 'li').x === 780 && afterBatch.nodes.find((node) => node.id === 'li').title === '李梅（改）',
  afterBatch.nodes.find((node) => node.id === 'li'),
);
check('整批只占一条撤销记录', state().past.length === pastLen + 1, { before: pastLen, after: state().past.length });
state().undo();
check('一次撤销回滚整批改动', JSON.stringify(doc()) === JSON.stringify(batchBase), doc().nodes.find((node) => node.id === 'li'));
state().redo();
check('重做恢复整批改动', doc().nodes.find((node) => node.id === 'li').title === '李梅（改）');
const staleChanges = batchReport.changes.filter((change) => change.kind === 'node' && change.id === 'li');
state().dispatch(deleteNode('li'));
const beforeStale = doc().nodes.length;
state().dispatch(applyDslChanges(staleChanges));
check(
  '目标实体已删除时改动被忽略且不崩溃',
  doc().nodes.length === beforeStale && !doc().nodes.some((node) => node.id === 'li'),
  doc().nodes.length,
);

console.log('[23] DSL 代码视图同步（M3-4）');
const locate = require(path.join(out, 'dsl', 'locate.js'));
const codeMod = require(path.join(out, 'store', 'codeStore.js'));
const codeState = () => codeMod.useCodeStore.getState();

// 回到干净演示案（前面的分段改动过模型）
state().dispatch(replaceDocument(createDemoDoc()));
const viewDoc = doc();
const code0 = serializeDoc(viewDoc);
const decls = locate.locateDeclarations(code0);
check('定位出 6 个实体声明', decls.filter((item) => item.kind === 'node').length === 6, decls.filter((item) => item.kind === 'node').length);
check('定位出 6 条关系声明', decls.filter((item) => item.kind === 'edge').length === 6, decls.filter((item) => item.kind === 'edge').length);
check('定位出 1 个组与 1 个视图', decls.filter((item) => item.kind === 'group').length === 1 && decls.filter((item) => item.kind === 'view').length === 1);
check('定位是纯函数（同文本同结果）', JSON.stringify(locate.locateDeclarations(code0)) === JSON.stringify(decls));

const nodeRange = locate.findDeclRange(code0, viewDoc, 'zhang');
check('node 声明带名字范围', !!nodeRange && nodeRange.kind === 'node' && nodeRange.name === 'zhang' && code0.slice(nodeRange.from, nodeRange.to).startsWith('person zhang'), nodeRange);
const groupRange = locate.findDeclRange(code0, viewDoc, 'g-suspect');
check('group 用名字表对应声明', !!groupRange && groupRange.kind === 'group' && groupRange.name === 'g_suspect' && code0.slice(groupRange.from, groupRange.to).includes('group g_suspect'), groupRange);
const edgeRange = locate.findDeclRange(code0, viewDoc, 'e-transfer');
check('edge 按块内 id 定位', !!edgeRange && edgeRange.kind === 'edge' && code0.slice(edgeRange.from, edgeRange.to).includes('--转账 50 万-->'), edgeRange);
const viewRange = locate.findDeclRange(code0, viewDoc, 'view-timeline');
check('view 按块内 id 定位', !!viewRange && viewRange.kind === 'view' && code0.slice(viewRange.from, viewRange.to).startsWith('view timeline'), viewRange);
check('未出现在文本里的 id 返回 null', locate.findDeclRange(code0, viewDoc, 'nope') === null);

const nodeAt = locate.declIdAtPosition(code0, viewDoc, nodeRange.nameFrom + 1);
check('光标在实体声明内 → 反查模型 id', !!nodeAt && nodeAt.kind === 'node' && nodeAt.id === 'zhang', nodeAt);
const edgeAt = locate.declIdAtPosition(code0, viewDoc, edgeRange.nameFrom + 1);
check('光标在关系语句内 → 得到关系 id', !!edgeAt && edgeAt.kind === 'edge' && edgeAt.id === 'e-transfer', edgeAt);
const groupAt = locate.declIdAtPosition(code0, viewDoc, groupRange.nameFrom + 1);
check('光标在组声明内 → 反查组 id', !!groupAt && groupAt.kind === 'group' && groupAt.id === 'g-suspect', groupAt);
check('光标在块外 → null', locate.declIdAtPosition(code0, viewDoc, 0) === null);

codeMod.closeCodeView();
codeMod.openCodeView();
check('打开代码视图：open + idle', codeState().open === true && codeState().state === 'idle');
check('打开时代码是模型序列化', codeState().text === code0);
check('演示文本解析无错误诊断', !codeState().diagnostics.some((item) => item.severity === 'error'));

const pastBefore = state().past.length;
const retitledText = codeState().text.replace('"张建国"', '"张建国（改）"');
codeMod.syncCodeText(retitledText);
check('代码改标题写回模型', doc().nodes.find((node) => node.id === 'zhang').title === '张建国（改）', doc().nodes.find((node) => node.id === 'zhang').title);
check('代码编辑只占一条撤销记录', state().past.length === pastBefore + 1, { before: pastBefore, after: state().past.length });
check('状态进入 codeEditing', codeState().state === 'codeEditing');
check('代码编辑期间未误置 applyingCode', codeMod.isApplyingCode() === false);
state().undo();
check('一次撤销回滚代码改动', doc().nodes.find((node) => node.id === 'zhang').title === '张建国');

// 解析失败：模型不变、进入 error、图形只读（Board 读 state==='error'）
codeMod.closeCodeView();
state().dispatch(replaceDocument(createDemoDoc()));
codeMod.openCodeView();
const beforeBad = JSON.stringify(doc());
codeMod.syncCodeText('person a "A" {\n  status: suspect\n}');
check('非法枚举 → error', codeState().state === 'error');
check('解析失败不清空模型', JSON.stringify(doc()) === beforeBad);
check('诊断指出非法枚举', codeState().diagnostics.some((item) => item.message.includes('status')), codeState().diagnostics);
check('错误期间格式化返回 false', codeMod.formatCode() === false);

// 恢复合法文本后格式化：等价于按模型重新排版，不占撤销栈
codeMod.syncCodeText(code0);
check('修好后回到非错误状态', codeState().state !== 'error');
const pastFormat = state().past.length;
check('格式化成功返回 true', codeMod.formatCode() === true);
check('格式化不改模型、不占撤销栈', state().past.length === pastFormat && codeState().text === serializeDoc(doc()));

// 代码编辑中图形变化：不抢光标，只亮「点击合并」
codeMod.syncCodeText(code0);
codeState().setFocused(true);
state().dispatch(moveNode('zhang', 444, 555));
codeMod.noteGraphChange();
check('编辑中图形变化 → graphEditing 待合并', codeState().state === 'graphEditing' && codeState().pendingGraph === true);
codeMod.mergeGraphChanges();
check('合并后文本包含新坐标', codeState().state === 'idle' && codeState().text.includes('at(444, 555)'));
check('合并后 baseline 与模型一致', JSON.stringify(codeState().baseline) === JSON.stringify(doc()));

// 失焦且有待合并 → 自动刷新（光标保护只在聚焦时生效）
state().dispatch(moveNode('li', 321, 654));
codeMod.noteGraphChange();
check('聚焦时再次变化仍待合并', codeState().pendingGraph === true);
codeState().setFocused(false);
check('失焦后自动刷新代码', codeState().state === 'idle' && codeState().text.includes('at(321, 654)'));
codeMod.closeCodeView();
check('关闭代码视图复位', codeState().open === false && codeState().focused === false);

console.log('[24] 验收加固：错误矩阵 / 连续操作 / 1000 节点基准（M3-5）');
const errCases = [
  { name: '悬空引用', text: 'case "x" {\n  person a "A" { }\n  b --> a { rel: call }\n}', nodes: 1, edges: 0, views: 0, msg: '引用「b」没有对应声明', hint: '先声明实体' },
  { name: '重复 id', text: 'case "x" {\n  person a "A" { }\n  org a "B" { }\n}', nodes: 1, edges: 0, views: 0, msg: 'id「a」重复声明' },
  { name: '边连自己', text: 'case "x" {\n  person a "A" { }\n  a --> a { rel: call }\n}', nodes: 1, edges: 0, views: 0, msg: '关系不能连到自己' },
  { name: '未闭合块', text: 'case "x" {\n  person a "A" { }\n  org b "B" {\n', nodes: 2, edges: 0, views: 0, msg: '此处缺少内容或标点不正确', hint: '花括号' },
  { name: '非法枚举', text: 'case "x" {\n  person a "A" {\n    status: suspect\n  }\n}', nodes: 1, edges: 0, views: 0, msg: 'status 只能是 todo / checking / confirmed / ruledout' },
  { name: '非数字坐标', text: 'case "x" {\n  person a "A" {\n    at(x, y)\n  }\n}', nodes: 1, edges: 0, views: 0, msg: 'x 必须是数字，收到「x」', hint: 'at(x, y)' },
  { name: '非法 path', text: 'case "x" {\n  person a "A" { }\n  person b "B" { }\n  a --> b { rel: call path: curve }\n}', nodes: 2, edges: 1, views: 0, msg: 'path 只能是 bezier / straight / step' },
  { name: '非法视图类型', text: 'case "x" {\n  view chart "图" { }\n}', nodes: 0, edges: 0, views: 1, msg: '视图类型只能是 board / timeline / map / chain / presentation / scenario' },
  { name: '未知字段', text: 'case "x" {\n  person a "A" {\n    foo: 1\n  }\n}', nodes: 1, edges: 0, views: 0, msg: '未知字段「foo」，已忽略', hint: 'fields: {' },
  { name: '关系 id 重复', text: 'case "x" {\n  person a "A" { }\n  person b "B" { }\n  a --> b { id: "e1" }\n  b --> a { id: "e1" }\n}', nodes: 2, edges: 1, views: 0, msg: '关系 id「e1」重复' },
];
let errMsgHits = 0;
let errModelKept = 0;
let errPosOk = 0;
let errHintHits = 0;
for (const item of errCases) {
  const res = parseDsl(item.text);
  if (res.doc.nodes.length === item.nodes && res.doc.edges.length === item.edges && res.doc.views.length === item.views) errModelKept += 1;
  const hit = res.diagnostics.some((d) => d.message.includes(item.msg));
  if (hit) errMsgHits += 1;
  if (item.hint && res.diagnostics.some((d) => (d.hint || '').includes(item.hint))) errHintHits += 1;
  if (res.diagnostics.length > 0 && res.diagnostics.every((d) => d.line >= 1 && d.column >= 1 && d.from >= 0 && d.to >= d.from)) errPosOk += 1;
}
check('十类错误全部给出中文诊断', errMsgHits === errCases.length, errMsgHits + '/' + errCases.length);
check('解析失败时模型不被清空（好块保留）', errModelKept === errCases.length, errModelKept + '/' + errCases.length);
check('诊断带可定位的行列与范围', errPosOk === errCases.length, errPosOk + '/' + errCases.length);
check('诊断带修复建议 hint', errHintHits >= 4, errHintHits);
const t1000 = (() => { const started = Date.now(); const big = serializeDoc(buildDoc(1000)); const parsed = parseDsl(big); return { ms: Date.now() - started, big, parsed }; })();
check('1000 节点文档可解析并保全形状', t1000.parsed.doc.nodes.length === 1000 && t1000.parsed.doc.edges.length === 999 && t1000.parsed.diagnostics.length === 0, t1000.parsed.doc.nodes.length + '/' + t1000.parsed.doc.edges.length);
check('1000 节点解析 < 300ms', t1000.ms < 300, t1000.ms + 'ms');
const opApi = useDocStore.getState();
opApi.dispatch(replaceDocument(createDemoDoc()));
codeMod.openCodeView();
const opPastStart = useDocStore.getState().past.length;
const opAdded = [];
for (let i = 0; i < 50; i += 1) {
  const store = useDocStore.getState();
  const current = store.doc;
  const kind = i % 5;
  if (kind === 0) {
    const newId = 'n_op' + i;
    opAdded.push(newId);
    store.dispatch(addNode({ id: newId, type: 'note', title: '连续操作' + i, x: i, y: i }));
  } else if (kind === 1) {
    const target = current.nodes[0];
    store.dispatch(moveNode(target.id, target.x + 3, target.y + 2));
  } else if (kind === 2) {
    const target = current.nodes[1] || current.nodes[0];
    store.dispatch(updateNode(target.id, { title: '改名' + i }));
  } else if (kind === 3) {
    codeMod.flushGraphToCode();
    codeMod.syncCodeText(serializeDoc(useDocStore.getState().doc).replace('张建国', '张建国' + i));
  } else {
    const removed = opAdded.pop();
    if (removed) store.dispatch(deleteNode(removed));
  }
}
const opAfter = useDocStore.getState();
check('50 次增删改各压一条撤销记录', opAfter.past.length - opPastStart === 50, opAfter.past.length - opPastStart);
check('50 次操作后数据守恒（6 节点 6 关系）', opAfter.doc.nodes.length === 6 && opAfter.doc.edges.length === 6, opAfter.doc.nodes.length + '/' + opAfter.doc.edges.length);
check('50 次操作后文本往返仍无诊断', parseDsl(serializeDoc(opAfter.doc)).diagnostics.length === 0);
const opSnap = JSON.stringify(opAfter.doc);
let opUndos = 0;
while (useDocStore.getState().past.length > 0) { useDocStore.getState().undo(); opUndos += 1; }
for (let i = 0; i < opUndos; i += 1) useDocStore.getState().redo();
check('连续撤销 50 次再重做后完全一致', JSON.stringify(useDocStore.getState().doc) === opSnap, opUndos);
codeMod.closeCodeView();

// ------ M4：脱敏像素层 / .caseboard 容器 / 整板 SVG / 回收站恢复 ------
void main();

async function main() {
  const { restoreNode } = require(path.join(out, 'commands', 'nodeCommands.js'));
  const { restoreEdge } = require(path.join(out, 'commands', 'edgeCommands.js'));
  const { produce } = require('immer');
  const {
    applyRedactions,
    isRegionFlattened,
    mosaicRegion,
    redactRegionsFromAnnotations,
    regionToPixels,
  } = require(path.join(out, 'lib', 'redact.js'));
  const { boardToSvg, boardLayout } = require(path.join(out, 'serializers', 'svg.js'));
  const {
    CASEBOARD_FORMAT,
    CASEBOARD_VERSION,
    CaseboardError,
    buildCaseboard,
    readCaseboard,
  } = require(path.join(out, 'serializers', 'caseboard.js'));

  /** 确定性噪声图（避免 Math.random 让断言随机失败） */
  function makeNoiseImage(size) {
    const data = new Uint8ClampedArray(size * size * 4);
    let seed = 20261019;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = seed & 0xff;
      data[i + 1] = (seed >> 8) & 0xff;
      data[i + 2] = (seed >> 16) & 0xff;
      data[i + 3] = 255;
    }
    return { width: size, height: size, data };
  }

  console.log('[25] 脱敏马赛克（验收 6 的纯像素层，M4）');
  const redactRegion = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const noise = makeNoiseImage(64);
  const pixelRect = regionToPixels(noise, redactRegion);
  check(
    '归一化区域换算成像素矩形',
    pixelRect.left === 16 && pixelRect.top === 16 && pixelRect.right === 48 && pixelRect.bottom === 48,
    pixelRect,
  );
  check('未脱敏前区域不是均色', isRegionFlattened(noise, redactRegion) === false);
  const outsideBefore = noise.data.slice();
  const touched = mosaicRegion(noise, redactRegion);
  check('马赛克改写的像素数等于区域面积', touched === pixelRect.width * pixelRect.height, touched);
  check('脱敏后同一格完全均色（不可逆）', isRegionFlattened(noise, redactRegion) === true);
  let outsideChanged = 0;
  for (let y = 0; y < noise.height; y += 1) {
    for (let x = 0; x < noise.width; x += 1) {
      if (x >= pixelRect.left && x < pixelRect.right && y >= pixelRect.top && y < pixelRect.bottom) continue;
      const index = (y * noise.width + x) * 4;
      if (noise.data[index] !== outsideBefore[index] || noise.data[index + 1] !== outsideBefore[index + 1] || noise.data[index + 2] !== outsideBefore[index + 2]) {
        outsideChanged += 1;
      }
    }
  }
  check('区域外像素未被动过', outsideChanged === 0, outsideChanged);
  const edgeRect = regionToPixels(noise, { x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
  check('越界区域被夹到图像内', edgeRect.right === 64 && edgeRect.bottom === 64 && edgeRect.width === 6 && edgeRect.height === 6, edgeRect);
  const batch = applyRedactions(makeNoiseImage(64), [
    { x: 0, y: 0, w: 0.25, h: 0.25 },
    { x: 0.5, y: 0.5, w: 0.25, h: 0.25 },
  ]);
  check('批量脱敏统计区域数与像素数', batch.regions === 2 && batch.pixels === 512, batch);
  const demoAnnotations = createDemoDoc(true).assets[0].annotations;
  const redactRegions = redactRegionsFromAnnotations(demoAnnotations);
  check(
    '只有显式勾选脱敏的矩形进入区域列表',
    redactRegions.length === 1 && redactRegions[0].x === 0.34 && redactRegions[0].w === 0.22,
    redactRegions,
  );

  console.log('[26] .caseboard 单文件容器（验收 2）');
  const cbDoc = createDemoDoc(true);
  const fakeAsset = new Uint8Array(2048);
  for (let i = 0; i < fakeAsset.length; i += 1) fakeAsset[i] = (i * 37) & 0xff;
  const pkg = await buildCaseboard(cbDoc, {
    savedAt: '2026-10-19T10:00:00.000Z',
    app: '0.4.0',
    readAsset: () => fakeAsset,
  });
  check('容器是 zip 单文件', pkg.length > 1024 && pkg[0] === 0x50 && pkg[1] === 0x4b, pkg.length);
  const contents = readCaseboard(pkg);
  check(
    'manifest 格式与版本正确',
    contents.manifest.format === CASEBOARD_FORMAT && contents.manifest.version === CASEBOARD_VERSION && contents.manifest.app === '0.4.0',
    { format: contents.manifest.format, version: contents.manifest.version },
  );
  check(
    '案件数据无损还原',
    contents.doc.meta.title === cbDoc.meta.title && contents.doc.nodes.length === cbDoc.nodes.length && contents.doc.edges.length === cbDoc.edges.length && contents.doc.groups.length === cbDoc.groups.length,
    [contents.doc.nodes.length, contents.doc.edges.length],
  );
  const packedAsset = contents.assetFiles.get('a-demo-photo');
  check(
    '素材原件随包携带',
    contents.manifest.withAssets === true && packedAsset !== undefined && packedAsset.length === fakeAsset.length && packedAsset[100] === fakeAsset[100],
    packedAsset ? packedAsset.length : null,
  );
  check(
    'DSL 文本一并写入',
    contents.dsl.length > 200 && contents.dsl.includes('张建国') && contents.manifest.files.includes('case.cbd'),
    contents.dsl.length,
  );
  check(
    '清单计数与文档一致',
    contents.manifest.counts.nodes === cbDoc.nodes.length &&
      contents.manifest.counts.edges === cbDoc.edges.length &&
      contents.manifest.counts.assets === cbDoc.assets.length &&
      contents.manifest.counts.views === cbDoc.views.length,
    contents.manifest.counts,
  );
  check('读取无兼容性告警', contents.warnings.length === 0, contents.warnings);
  let brokenMessage = '';
  try {
    readCaseboard(new Uint8Array([1, 2, 3, 4, 5]));
  } catch (error) {
    brokenMessage = error instanceof CaseboardError ? error.message : '类型不对：' + String(error);
  }
  check('损坏文件给出中文错误', brokenMessage.startsWith('无法解压'), brokenMessage);

  console.log('[27] 整板 SVG 导出（验收 4）');
  const svgDoc = createDemoDoc();
  const svgOut = boardToSvg(svgDoc);
  const svgLayout = boardLayout(svgDoc);
  check(
    '尺寸 = 包围盒 + 外边距',
    svgOut.width === Math.round(svgLayout.width) && svgOut.height === Math.round(svgLayout.height) && Math.abs(svgOut.width - (svgOut.bounds.w + 128)) <= 1,
    { width: svgOut.width, height: svgOut.height, bounds: svgOut.bounds },
  );
  check('含 svg 根元素与 viewBox', svgOut.svg.startsWith('<?xml') && svgOut.svg.includes('<svg xmlns="http://www.w3.org/2000/svg"') && svgOut.svg.includes('viewBox="0 0 ' + svgLayout.width + ' ' + svgLayout.height + '"'));
  check(
    '六个节点标题都在图上',
    ['张建国', '李梅', '恒信财务', '夜色KTV', '首次接触', '银行流水'].every((title) => svgOut.svg.includes(title)),
  );
  const bezierCount = (svgOut.svg.match(/<path d="M /g) || []).length;
  check('关系线是贝塞尔 path ≥ 6 条', bezierCount >= 6, bezierCount);
  check('分组标题在图上', svgOut.svg.includes('诈骗团伙'));
  check(
    '三种线型图例齐全',
    ['已证实', '推测', '待核实'].every((label) => svgOut.svg.includes(label)) &&
      svgOut.svg.includes('stroke-dasharray="9 6"') &&
      svgOut.svg.includes('stroke-dasharray="2 5"'),
  );
  const escapedDoc = produce(svgDoc, (draft) => {
    const target = draft.nodes.find((node) => node.id === 'zhang');
    if (target) target.title = '张<建>国&"x"';
  });
  const escapedSvg = boardToSvg(escapedDoc).svg;
  check(
    '标题做 XML 转义',
    escapedSvg.includes('张&lt;建&gt;国&amp;&quot;x&quot;') && !escapedSvg.includes('张<建>国&"x"'),
  );
  const emptyDoc = Object.assign({}, svgDoc, { nodes: [], edges: [], groups: [], imageNodes: [] });
  const emptySvg = boardToSvg(emptyDoc);
  check('空案件不崩且仍保留图例', emptySvg.svg.includes('<svg') && emptySvg.svg.includes('已证实') && emptySvg.width > 0, [emptySvg.width, emptySvg.height]);

  console.log('[28] 回收站恢复命令（M4）');
  state().dispatch(replaceDocument(createDemoDoc()));
  const restorableNode = JSON.parse(JSON.stringify(doc().nodes.find((node) => node.id === 'zhang')));
  const restorableEdges = JSON.parse(JSON.stringify(doc().edges.filter((edge) => edge.source === 'zhang' || edge.target === 'zhang')));
  check('准备：zhang 关联 4 条关系', restorableEdges.length === 4, restorableEdges.map((edge) => edge.id));
  state().dispatch(deleteNode('zhang'));
  check('删除节点连带删除 4 条关系', doc().nodes.length === 5 && doc().edges.length === 2, [doc().nodes.length, doc().edges.length]);
  state().dispatch(restoreNode(restorableNode));
  check('恢复节点按原 id 放回', doc().nodes.length === 6 && doc().nodes.some((node) => node.id === 'zhang' && node.title === '张建国'));
  check('恢复节点不影响其他数据', doc().edges.length === 2 && doc().nodes.find((node) => node.id === 'li').title === '李梅');
  state().dispatch(restoreNode(restorableNode));
  check('重复恢复节点不产生副本', doc().nodes.length === 6);
  for (const edge of restorableEdges) state().dispatch(restoreEdge(edge));
  check('恢复关系回到原 id', doc().edges.length === 6 && restorableEdges.every((edge) => doc().edges.some((item) => item.id === edge.id)), doc().edges.length);
  state().dispatch(deleteNode('li'));
  const danglingEdge = restorableEdges.find((edge) => edge.source === 'li' || edge.target === 'li');
  state().dispatch(restoreEdge(danglingEdge));
  check('端点缺失时拒绝悬空关系', doc().edges.some((edge) => edge.id === danglingEdge.id) === false, danglingEdge.id);
  state().dispatch(replaceDocument(createDemoDoc()));

  console.log('[29] 批量恢复与多选移动（M4 人工验收 A4 / A7 热修）');
  const { restoreEntities } = require(path.join(out, 'commands', 'restoreCommands.js'));
  const { moveNodes } = require(path.join(out, 'commands', 'nodeCommands.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const handNode = JSON.parse(JSON.stringify(doc().nodes.find((node) => node.id === 'zhang')));
  const handEdges = JSON.parse(JSON.stringify(doc().edges.filter((edge) => edge.source === 'zhang' || edge.target === 'zhang')));
  state().dispatch(deleteNode('zhang'));
  const pastBeforeRestore = state().past.length;
  state().dispatch(restoreEntities({ nodes: [handNode], edges: handEdges }));
  check(
    '一次命令恢复实体与 4 条关系',
    doc().nodes.length === 6 &&
      doc().edges.length === 6 &&
      handEdges.every((edge) => doc().edges.some((item) => item.id === edge.id)),
    [doc().nodes.length, doc().edges.length],
  );
  check('整批恢复只压一条撤销记录', state().past.length - pastBeforeRestore === 1, state().past.length - pastBeforeRestore);
  check('撤销一次同时撤回实体与关系', (state().undo(), doc().nodes.length === 5 && doc().edges.length === 2), [doc().nodes.length, doc().edges.length]);
  check('重做恢复整批', (state().redo(), doc().nodes.length === 6 && doc().edges.length === 6), [doc().nodes.length, doc().edges.length]);
  state().dispatch(restoreEntities({ nodes: [handNode], edges: handEdges }));
  check('重复恢复同 id 不产生副本', doc().nodes.length === 6 && doc().edges.length === 6, [doc().nodes.length, doc().edges.length]);
  state().dispatch(deleteNode('li'));
  const liEdge = handEdges.find((edge) => edge.source === 'li' || edge.target === 'li');
  state().dispatch(restoreEntities({ edges: [liEdge] }));
  check('批恢复时端点缺失的关系被拒绝', doc().edges.some((edge) => edge.id === liEdge.id) === false, liEdge.id);
  state().dispatch(replaceDocument(createDemoDoc()));
  const beforeMove = JSON.parse(JSON.stringify(doc().nodes.filter((node) => node.id === 'zhang' || node.id === 'li')));
  const pastBeforeMove = state().past.length;
  state().dispatch(moveNodes([
    { id: 'zhang', x: 1234, y: 567 },
    { id: 'li', x: 1300, y: 700 },
  ]));
  check(
    '批量移动一次改多个坐标',
    doc().nodes.find((node) => node.id === 'zhang').x === 1234 &&
      doc().nodes.find((node) => node.id === 'zhang').y === 567 &&
      doc().nodes.find((node) => node.id === 'li').x === 1300,
    [doc().nodes.find((node) => node.id === 'zhang').x, doc().nodes.find((node) => node.id === 'li').x],
  );
  check('批量移动只压一条撤销记录', state().past.length - pastBeforeMove === 1, state().past.length - pastBeforeMove);
  state().undo();
  check(
    '撤销后两个坐标一起回原位',
    beforeMove.every((node) => doc().nodes.find((item) => item.id === node.id).x === node.x && doc().nodes.find((item) => item.id === node.id).y === node.y),
    doc().nodes.find((node) => node.id === 'zhang').x,
  );
  console.log('[30] 关系曲率手柄（M4 人工验收 A3 热修）');
  const {
    CURVE_MAX,
    clampCurveOffset,
    curveGeometry,
    curveOffsetFromHandle,
    curveOffsetOf,
    curvePath,
    normalizeControlPoints,
  } = require(path.join(out, 'lib', 'edgeCurve.js'));
  const straight = curveGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 40 });
  check('曲线中点落在手柄位置', straight.handle.x === 50 && straight.handle.y === 40, straight.handle);
  check(
    '控制点按 4/3 放大让曲线穿过手柄',
    Math.abs(straight.c1.y - 160 / 3) < 0.001 && straight.c1.x === 50 && straight.c1.y === straight.c2.y,
    straight.c1,
  );
  check('path 输出三次贝塞尔并保留两位小数', curvePath(straight) === 'M 0 0 C 50 53.33, 50 53.33, 100 0', curvePath(straight));
  const bigOffset = clampCurveOffset({ x: 5000, y: 0 });
  check('超限偏移被夹到 CURVE_MAX', bigOffset.x === CURVE_MAX && bigOffset.y === 0, bigOffset);
  const backOffset = curveOffsetFromHandle({ x: 50, y: 0 }, { x: 50, y: 40 });
  check('手柄位置反算回偏移', backOffset.x === 0 && backOffset.y === 40, backOffset);
  check(
    '没有曲率或抖动极小时视为直线',
    curveOffsetOf({}) === null && curveOffsetOf({ controlPoints: [] }) === null && curveOffsetOf({ controlPoints: [{ x: 0.5, y: 0.5 }] }) === null,
  );
  const normalizedCurve = normalizeControlPoints([{ x: 12.345, y: -6.789 }, null, { x: 'a' }]);
  check(
    '导入时规范化曲率点',
    JSON.stringify(normalizedCurve) === JSON.stringify([{ x: 12.3, y: -6.8 }]) && normalizeControlPoints('bad') === undefined,
    normalizedCurve,
  );
  state().dispatch(replaceDocument(createDemoDoc()));
  const pastBeforeCurve = state().past.length;
  state().dispatch(updateEdge('e-transfer', { controlPoints: [{ x: 0, y: 60 }] }));
  const curveEdge = doc().edges.find((edge) => edge.id === 'e-transfer');
  check(
    '命令写入曲率偏移',
    curveEdge.controlPoints.length === 1 && curveEdge.controlPoints[0].x === 0 && curveEdge.controlPoints[0].y === 60 && state().past.length - pastBeforeCurve === 1,
    curveEdge.controlPoints,
  );
  state().undo();
  check('撤销后曲率偏移消失', doc().edges.find((edge) => edge.id === 'e-transfer').controlPoints === undefined);
  state().redo();
  check('重做恢复曲率偏移', doc().edges.find((edge) => edge.id === 'e-transfer').controlPoints[0].y === 60);
  const curvedJson = toJson(doc());
  const curvedRoundTrip = fromJson(curvedJson).edges.find((edge) => edge.id === 'e-transfer');
  check(
    'JSON 往返保留曲率',
    curvedRoundTrip.controlPoints !== undefined && curvedRoundTrip.controlPoints[0].y === 60,
    curvedRoundTrip.controlPoints,
  );
  const withCurve = boardToSvg(doc());
  const curvePaths = [...withCurve.svg.matchAll(/<path[^>]*d="M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)"/g)];
  const symmetric = curvePaths.find((match) => match[3] === match[5] && match[4] === match[6]);
  let curveHandleDistance = 0;
  if (symmetric) {
    const midX = (Number(symmetric[1]) + Number(symmetric[7])) / 2;
    const midY = (Number(symmetric[2]) + Number(symmetric[8])) / 2;
    curveHandleDistance = Math.hypot(Number(symmetric[3]) - midX, Number(symmetric[4]) - midY);
  }
  check(
    'SVG 导出使用同一套曲线（控制点对称且到中点 80）',
    symmetric !== undefined && Math.abs(curveHandleDistance - 80) < 1.5,
    { paths: curvePaths.length, distance: Math.round(curveHandleDistance * 10) / 10 },
  );
  const straightSvg = boardToSvg(createDemoDoc()).svg;
  check('有曲率与无曲率的导出结果不同', withCurve.svg !== straightSvg);
  state().dispatch(replaceDocument(createDemoDoc()));

  console.log('[31] 分析内核：路径 / 中心度 / 自动布局 / 时间线（M5-1）');
  const {
    allPaths,
    betweennessCentrality,
    buildGraph,
    components,
    degreeCentrality,
    graphStats,
    neighborsWithin,
    pairKey,
    shortestPath,
  } = require(path.join(out, 'lib', 'graph.js'));
  const { computeLayout } = require(path.join(out, 'lib', 'layout.js'));
  const {
    advanceCursor,
    buildTimeline,
    clampCursor,
    cursorFromRatio,
    formatTimelineTime,
    laneGroups,
    nodesWithoutTime,
    parseTimelineTime,
    ratioFromCursor,
    sliceTimeline,
    timelineBands,
    timelineScale,
  } = require(path.join(out, 'lib', 'timeline.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const graph = buildGraph(doc());
  check('邻接表覆盖全部节点', graph.nodes.size === 6 && graph.edges.length === 6, [graph.nodes.size, graph.edges.length]);
  check('邻接表按 id 升序', JSON.stringify(graph.adjacency.get('zhang')) === JSON.stringify(['e1', 'gang', 'li']), graph.adjacency.get('zhang'));
  check('无向边对 key 与端点顺序无关', pairKey('zhang', 'li') === pairKey('li', 'zhang'));
  const shortPath = shortestPath(graph, 'zhang', 'ktv');
  check('最短路径为 张建国 → 首次接触 → 夜色KTV', JSON.stringify(shortPath) === JSON.stringify(['zhang', 'e1', 'ktv']), shortPath);
  check('最短路径可复现', JSON.stringify(shortestPath(graph, 'zhang', 'ktv')) === JSON.stringify(shortPath));
  check('不可达节点返回 null', shortestPath(graph, 'zhang', 'ev1') === null);
  const firstPaths = allPaths(graph, 'zhang', 'ktv');
  const secondPaths = allPaths(graph, 'zhang', 'ktv');
  check('两节点间全部路径稳定复现', JSON.stringify(firstPaths) === JSON.stringify(secondPaths) && firstPaths.length === 1, firstPaths);
  check('全部路径截断到上限', allPaths(graph, 'li', 'ktv', { maxPaths: 1, maxDepth: 6 }).length === 1);
  const degreeRank = degreeCentrality(graph);
  check(
    '度中心性前 3 稳定（张建国 / 首次接触 / 恒信财务）',
    JSON.stringify(degreeRank.slice(0, 3).map((entry) => entry.id)) === JSON.stringify(['zhang', 'e1', 'gang']),
    degreeRank.slice(0, 3),
  );
  const betweenness = betweennessCentrality(graph);
  check(
    '介数中心性可复现且张建国最高',
    JSON.stringify(betweenness) === JSON.stringify(betweennessCentrality(graph)) && betweenness[0].id === 'zhang',
    betweenness.slice(0, 3),
  );
  const near = neighborsWithin(graph, ['zhang'], 1);
  check('一跳聚焦按距离与 id 排序', JSON.stringify(near.map((item) => item.id)) === JSON.stringify(['zhang', 'e1', 'gang', 'li']), near);
  check('两跳聚焦覆盖 KTV', neighborsWithin(graph, ['zhang'], 2).some((item) => item.id === 'ktv'));
  const stats = graphStats(graph);
  check(
    '图统计：6 节点 / 6 边 / 1 个孤立点',
    stats.nodeCount === 6 && stats.edgeCount === 6 && stats.isolated.join() === 'ev1' && stats.componentCount === 2,
    stats,
  );
  check('连通分量按规模排序', JSON.stringify(components(graph).map((group) => group.length)) === JSON.stringify([5, 1]));

  const locked = ['zhang', 'li'];
  const gridFirst = computeLayout(doc(), { kind: 'grid', lockedIds: locked, gap: 40 });
  const gridSecond = computeLayout(doc(), { kind: 'grid', lockedIds: locked, gap: 40 });
  check('自动布局可复现（同输入同坐标）', JSON.stringify(gridFirst.placements) === JSON.stringify(gridSecond.placements));
  check(
    '锁定节点坐标逐位不变',
    locked.every((id) => {
      const node = doc().nodes.find((item) => item.id === id);
      const placement = gridFirst.placements.find((item) => item.id === id);
      return placement.locked && placement.x === node.x && placement.y === node.y;
    }),
    gridFirst.placements.filter((item) => item.locked),
  );
  const placed = gridFirst.placements.map((placement) => {
    const node = doc().nodes.find((item) => item.id === placement.id);
    return { ...node, x: placement.x, y: placement.y };
  });
  let overlapPairs = 0;
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i];
      const b = placed[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlapPairs += 1;
    }
  }
  check('整理后没有矩形重叠', overlapPairs === 0, overlapPairs);
  const group = doc().groups[0];
  const inGroup = placed.filter((node) => node.groupId === group.id);
  check(
    '组内节点不穿出组边界',
    inGroup.length === 2 &&
      inGroup.every((node) => node.x >= group.bounds.x && node.y >= group.bounds.y && node.x + node.w <= group.bounds.x + group.bounds.w && node.y + node.h <= group.bounds.y + group.bounds.h),
    inGroup.map((node) => [node.id, node.x, node.y]),
  );
  check('布局确实移动了未锁定节点', gridFirst.moved > 0 && gridFirst.placements.filter((item) => item.locked).length === 2, gridFirst.moved);
  for (const kind of ['force', 'hierarchical', 'radial', 'circle', 'grid']) {
    const result = computeLayout(doc(), { kind, lockedIds: ['zhang'], gap: 36 });
    check('布局算法可用：' + kind, result.placements.length === 6 && result.placements.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)), result.placements.length);
  }
  state().dispatch(replaceDocument(createDemoDoc()));

  const timelineDoc = JSON.parse(JSON.stringify(createDemoDoc()));
  timelineDoc.nodes.find((node) => node.id === 'zhang').time = { start: '2026-09-05' };
  timelineDoc.nodes.find((node) => node.id === 'li').time = { start: '2026-09-01', end: '2026-09-10' };
  const timeline = buildTimeline(timelineDoc);
  check('时间线只收有时间的节点（3 条）', timeline.length === 3, timeline.map((item) => item.id));
  check('时间线按起点升序', JSON.stringify(timeline.map((item) => item.id)) === JSON.stringify(['li', 'e1', 'zhang']), timeline.map((item) => item.id));
  check('区间事件标记 hasRange', timeline.find((item) => item.id === 'li').hasRange === true && timeline.find((item) => item.id === 'e1').hasRange === false);
  check('未排期节点 3 个', nodesWithoutTime(timelineDoc).length === 3, nodesWithoutTime(timelineDoc).map((node) => node.id));
  const scale = timelineScale(timelineDoc);
  check(
    '时间刻度覆盖 9 月 1 日到 9 月 10 日',
    !scale.empty && scale.min === Date.UTC(2026, 8, 1) && scale.max === Date.UTC(2026, 8, 10) && scale.span === 9 * 86400000,
    scale,
  );
  const halfCursor = cursorFromRatio(scale, 0.5);
  check('比例换算成游标（中点 = 9 月 5 日 12:00）', formatTimelineTime(halfCursor) === '2026-09-05 12:00', formatTimelineTime(halfCursor));
  check('游标换算回比例', Math.abs(ratioFromCursor(scale, halfCursor) - 0.5) < 1e-9);
  check('比例越界被夹到 0/1', cursorFromRatio(scale, -3) === scale.min && cursorFromRatio(scale, 9) === scale.max);
  const atStart = sliceTimeline(timeline, scale.min);
  check('游标在起点：进行中 1 条、未来 2 条', atStart.running.length === 1 && atStart.future.length === 2 && atStart.past.length === 0, atStart.running.map((item) => item.id));
  const atMid = sliceTimeline(timeline, halfCursor);
  check(
    '游标在 9 月 5 日：进行中李梅、已发生首次接触',
    atMid.running.some((item) => item.id === 'li') && atMid.past.some((item) => item.id === 'e1') && atMid.past.some((item) => item.id === 'zhang'),
    { past: atMid.past.map((item) => item.id), running: atMid.running.map((item) => item.id) },
  );
  const advanced = advanceCursor(scale, scale.min, 2, 86400000);
  check('播放推进按倍速计算时间', advanced === scale.min + 2 * 86400000, formatTimelineTime(advanced));
  check('播放到末尾不越界', advanceCursor(scale, scale.max - 1000, 8, 5000) === scale.max);
  check('游标夹紧到刻度范围', clampCursor(scale, scale.min - 999999) === scale.min && clampCursor(scale, scale.max + 5) === scale.max);
  const lanes = laneGroups(timeline);
  check(
    '泳道按首次出现分道（人物 2 条、事件 1 条）',
    lanes.length === 2 && lanes[0].lane === 'person' && lanes[0].items.length === 2 && lanes[1].lane === 'event',
    lanes.map((lane) => [lane.lane, lane.items.length]),
  );
  check('时间格式固定为 UTC 墙上时间', formatTimelineTime(Date.UTC(2026, 8, 3, 20, 10)) === '2026-09-03 20:10');
  check(
    '宽松解析：点事件 / 日期 / 年月 / 非法输入',
    parseTimelineTime('2026-09-03T20:10') === Date.UTC(2026, 8, 3, 20, 10) &&
      parseTimelineTime('2026-09-03 20:10') === Date.UTC(2026, 8, 3, 20, 10) &&
      parseTimelineTime('2026-09-03') === Date.UTC(2026, 8, 3) &&
      parseTimelineTime('2026') === Date.UTC(2026, 0, 1) &&
      parseTimelineTime('2026-13-01') === null &&
      parseTimelineTime('待查') === null &&
      parseTimelineTime(undefined) === null,
  );
  check('空文档时间刻度为空', timelineScale({ ...timelineDoc, nodes: [] }).empty === true);

  const {
    EMPTY_FILTER: M52_EMPTY,
    applyView: m52ApplyView,
    collectTags: m52CollectTags,
    edgeMatches: m52EdgeMatches,
    focusNodeIds: m52FocusIds,
    isEmptyFilter: m52IsEmpty,
    nodeMatches: m52NodeMatches,
  } = require(path.join(out, 'lib', 'filter.js'));

  console.log('[32] 过滤与聚焦（M5-2）');
  const m52Doc = createDemoDoc();
  check('空条件是空过滤', m52IsEmpty(M52_EMPTY) === true);
  check('选中类型后不再算空条件', m52IsEmpty({ ...M52_EMPTY, nodeTypes: ['person'] }) === false);
  const m52Full = m52ApplyView(m52Doc, M52_EMPTY, null);
  check(
    '无过滤时全部可见且全部命中',
    m52Full.hiddenNodes.size === 0 &&
      m52Full.dimNodes.size === 0 &&
      m52Full.matchedNodes.size === 6 &&
      m52Full.matchedEdges.size === 6 &&
      m52Full.visibleNodeCount === 6 &&
      m52Full.filterActive === false,
    [m52Full.hiddenNodes.size, m52Full.dimNodes.size, m52Full.matchedNodes.size],
  );

  const m52Dim = m52ApplyView(m52Doc, { ...M52_EMPTY, nodeTypes: ['person'] }, null);
  check(
    '淡化模式：只淡化未命中的 4 个实体，不隐藏',
    m52Dim.filterActive === true &&
      m52Dim.matchedNodes.size === 2 &&
      m52Dim.dimNodes.size === 4 &&
      m52Dim.hiddenNodes.size === 0,
    [m52Dim.matchedNodes.size, m52Dim.dimNodes.size, m52Dim.hiddenNodes.size],
  );
  check(
    '淡化模式：与命中实体无关的边全部淡化（4 条）',
    m52Dim.dimEdges.size === 4 && m52Dim.hiddenEdges.size === 0,
    [m52Dim.dimEdges.size, m52Dim.hiddenEdges.size],
  );

  const m52Show = m52ApplyView(m52Doc, { ...M52_EMPTY, nodeTypes: ['person'], mode: 'show' }, null);
  check(
    '只显示命中：隐藏 4 个实体，剩 2 个',
    m52Show.hiddenNodes.size === 4 && m52Show.visibleNodeCount === 2 && m52Show.dimNodes.size === 0,
    [m52Show.hiddenNodes.size, m52Show.visibleNodeCount],
  );
  check(
    '只显示命中：端点被隐藏的边一并隐藏（剩 2 条人物间关系）',
    m52Show.hiddenEdges.size === 4 && 6 - m52Show.hiddenEdges.size === 2,
    m52Show.hiddenEdges.size,
  );

  const m52Hide = m52ApplyView(m52Doc, { ...M52_EMPTY, nodeTypes: ['person'], mode: 'hide' }, null);
  check(
    '隐藏命中：把 2 个人物藏起来，其余 4 个仍在',
    m52Hide.hiddenNodes.size === 2 && m52Hide.visibleNodeCount === 4 && m52Hide.dimNodes.size === 0,
    [m52Hide.hiddenNodes.size, m52Hide.visibleNodeCount],
  );
  check(
    '隐藏命中：人物相关边全部隐藏，只剩事件-地点 1 条',
    m52Hide.hiddenEdges.size === 5 && 6 - m52Hide.hiddenEdges.size === 1,
    m52Hide.hiddenEdges.size,
  );

  const m52Status = m52ApplyView(m52Doc, { ...M52_EMPTY, statuses: ['confirmed'] }, null);
  check('按状态过滤：已证实 3 个', m52Status.matchedNodes.size === 3, Array.from(m52Status.matchedNodes));
  const m52Confidence = m52ApplyView(m52Doc, { ...M52_EMPTY, minConfidence: 75 }, null);
  check('按置信度过滤：≥75 的 3 个', m52Confidence.matchedNodes.size === 3, Array.from(m52Confidence.matchedNodes));
  const m52Tag = m52ApplyView(m52Doc, { ...M52_EMPTY, tags: ['主犯'] }, null);
  check('按标签过滤：只剩张建国', m52Tag.matchedNodes.size === 1 && m52Tag.matchedNodes.has('zhang'));
  const m52Query = m52ApplyView(m52Doc, { ...M52_EMPTY, query: '银行' }, null);
  check('文本检索命中标题与字段', m52Query.matchedNodes.size === 1 && m52Query.matchedNodes.has('ev1'), Array.from(m52Query.matchedNodes));
  const m52Time = m52ApplyView(m52Doc, { ...M52_EMPTY, timeFrom: '2026-09-03', timeTo: '2026-09-04' }, null);
  check(
    '时间窗只留 9 月 3 日的事件，且无时间实体被排除',
    m52Time.matchedNodes.size === 1 && m52Time.matchedNodes.has('e1'),
    Array.from(m52Time.matchedNodes),
  );
  const m52Rel = m52ApplyView(m52Doc, { ...M52_EMPTY, relTypes: ['call'] }, null);
  check(
    '按关系类别过滤：1 条通话，两端实体命中',
    m52Rel.matchedEdges.size === 1 &&
      m52Rel.matchedEdges.has('e-call') &&
      m52Rel.matchedNodes.has('zhang') &&
      m52Rel.matchedNodes.has('li'),
    Array.from(m52Rel.matchedEdges),
  );
  const m52Transfer = m52Doc.edges.find((edge) => edge.id === 'e-transfer');
  check(
    '边条件独立判断：类别 / 置信度 / 文本',
    m52EdgeMatches(m52Transfer, { ...M52_EMPTY, relTypes: ['call'] }) === false &&
      m52EdgeMatches(m52Transfer, { ...M52_EMPTY, minConfidence: 96 }) === false &&
      m52EdgeMatches(m52Transfer, { ...M52_EMPTY, query: '转账' }) === true &&
      m52EdgeMatches(m52Transfer, { ...M52_EMPTY, minConfidence: 95 }) === true,
  );

  const m52FocusOne = m52FocusIds(m52Doc, { seeds: ['zhang'], depth: 1 });
  check('聚焦 1 跳：张建国及直接相邻 4 个', m52FocusOne !== null && m52FocusOne.size === 4 && m52FocusOne.has('zhang') && m52FocusOne.has('li'), m52FocusOne ? Array.from(m52FocusOne) : null);
  const m52FocusTwo = m52FocusIds(m52Doc, { seeds: ['zhang'], depth: 2 });
  // 银行流水（ev1）在演示数据里是孤立点，没有任何关系可达，所以 2 跳只覆盖 5 个
  check('聚焦 2 跳：覆盖 5 个（银行流水是孤立点）', m52FocusTwo !== null && m52FocusTwo.size === 5 && !m52FocusTwo.has('ev1'), m52FocusTwo ? Array.from(m52FocusTwo) : null);
  const m52FocusAll = m52FocusIds(m52Doc, { seeds: ['zhang', 'ev1'], depth: 2 });
  check('多起点聚焦：两个起点合起来覆盖全部 6 个', m52FocusAll !== null && m52FocusAll.size === 6);
  check('空 seeds 视为未聚焦', m52FocusIds(m52Doc, { seeds: [], depth: 1 }) === null);
  const m52Focused = m52ApplyView(m52Doc, M52_EMPTY, { seeds: ['zhang'], depth: 1 });
  check(
    '聚焦只淡化外部（2 个），不隐藏任何实体',
    m52Focused.focusActive === true && m52Focused.hiddenNodes.size === 0 && m52Focused.dimNodes.size === 2,
    [m52Focused.hiddenNodes.size, m52Focused.dimNodes.size],
  );
  const m52Combo = m52ApplyView(m52Doc, { ...M52_EMPTY, nodeTypes: ['person'], mode: 'show' }, { seeds: ['zhang'], depth: 1 });
  check(
    '过滤与聚焦取交集：只显示 2 个人物，且都在聚焦集合内',
    m52Combo.hiddenNodes.size === 4 && m52Combo.dimNodes.size === 0,
    [m52Combo.hiddenNodes.size, m52Combo.dimNodes.size],
  );
  const m52LiFocus = m52ApplyView(m52Doc, M52_EMPTY, { seeds: ['li'], depth: 1 });
  check(
    '李梅 1 跳：张建国 + 恒信财务在聚焦内，3 个外部淡化',
    m52LiFocus.dimNodes.size === 3 && m52LiFocus.dimNodes.has('ktv') && m52LiFocus.dimNodes.has('e1') && m52LiFocus.dimNodes.has('ev1'),
    Array.from(m52LiFocus.dimNodes),
  );
  const m52Tags = m52CollectTags(m52Doc);
  check(
    '标签候选项按使用次数统计（7 个标签各 1 次）',
    m52Tags.length === 7 && m52Tags.every((item) => item.count === 1) && m52Tags.some((item) => item.tag === '主犯'),
    m52Tags,
  );
  check(
    '单条判定函数：置信度与时间窗边界',
    m52NodeMatches(m52Doc.nodes.find((node) => node.id === 'zhang'), { ...M52_EMPTY, minConfidence: 91 }, []) === false &&
      m52NodeMatches(m52Doc.nodes.find((node) => node.id === 'e1'), { ...M52_EMPTY, timeFrom: '2026-09-04' }, []) === false,
  );

  console.log('[33] 路径与中心度（M5-3）');
  const {
    analyzePaths,
    centralityMap: m53CentralityMap,
    centralityScores,
    formatCentralityScore,
    toPathHit,
    topCentrality,
  } = require(path.join(out, 'lib', 'analysis.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const m53Path = analyzePaths(doc(), 'zhang', 'ktv');
  check(
    '两点间最短路径：张建国 → 首次接触 → 夜色KTV',
    m53Path.found === true &&
      JSON.stringify(m53Path.shortest.nodes) === JSON.stringify(['zhang', 'e1', 'ktv']) &&
      m53Path.shortest.nodes.length - 1 === 2,
    m53Path.shortest ? m53Path.shortest.nodes : null,
  );
  check(
    '最短路径带上每一跳的原始关系 id',
    m53Path.shortest.edges.length === 2 &&
      m53Path.shortest.edges.includes('e-actor') &&
      m53Path.shortest.edges.includes('e-place') &&
      m53Path.shortest.hopEdges.length === 2 &&
      m53Path.shortest.hopEdges.every((ids) => ids.length === 1),
    m53Path.shortest.hopEdges,
  );
  check('全部路径默认只有 1 条且未截断', m53Path.paths.length === 1 && m53Path.truncated === false, m53Path.paths.length);
  check('起点即终点视为无路径', analyzePaths(doc(), 'zhang', 'zhang').found === false);
  check('不存在的端点返回空结果', analyzePaths(doc(), 'zhang', 'nobody').found === false);
  check('孤立实体之间没有路径', analyzePaths(doc(), 'zhang', 'ev1').found === false);
  const m53Limited = analyzePaths(doc(), 'zhang', 'ktv', { maxPaths: 1 });
  check('maxPaths 边界：只有 1 条时标记为截断', m53Limited.paths.length === 1 && m53Limited.truncated === true, m53Limited.truncated);
  const m53Single = toPathHit(doc(), ['zhang']);
  check('单点路径没有跳与关系', m53Single.nodes.length === 1 && m53Single.edges.length === 0 && m53Single.hopEdges.length === 0);
  const m53Parallel = toPathHit(doc(), ['zhang', 'li']);
  check(
    '并列关系：同一跳的两条关系都收进来',
    m53Parallel.hopEdges.length === 1 && m53Parallel.hopEdges[0].length === 2 && m53Parallel.edges.length === 2,
    m53Parallel.edges,
  );
  const m53Degree = centralityScores(doc(), 'degree');
  check(
    '度中心度前三：张建国 3 / 首次接触 2 / 恒信财务 2',
    m53Degree.length === 6 &&
      m53Degree[0].id === 'zhang' &&
      m53Degree[0].score === 3 &&
      m53Degree.slice(1, 3).every((entry) => entry.score === 2),
    m53Degree.slice(0, 3),
  );
  const m53Between = centralityScores(doc(), 'betweenness');
  check('中介中心度最高是张建国（0.4）', m53Between[0].id === 'zhang' && m53Between[0].score === 0.4, m53Between[0]);
  check('关闭中心度时不返回任何分数', centralityScores(doc(), 'off').length === 0);
  const m53Heat = m53CentralityMap(doc(), 'degree');
  check(
    '热力值归一到 0–1：最高 1，孤立点为 0',
    m53Heat.get('zhang') === 1 && m53Heat.get('li') === Number((2 / 3).toFixed(4)) && m53Heat.get('ev1') === 0,
    [m53Heat.get('zhang'), m53Heat.get('li'), m53Heat.get('ev1')],
  );
  check(
    '中心度文案：度取整、中介百分比',
    formatCentralityScore(3, 'degree') === '3' &&
      formatCentralityScore(0.4, 'betweenness') === '40.0%' &&
      formatCentralityScore(0, 'betweenness') === '0.0%',
  );
  check(
    '排行榜按分数取前 N，关闭时为空',
    topCentrality(doc(), 'degree', 2).length === 2 &&
      topCentrality(doc(), 'degree', 2)[0].id === 'zhang' &&
      topCentrality(doc(), 'off').length === 0,
  );

  console.log('[34] 自动布局写回与撤销（M5-4）');
  const { applyLayout } = require(path.join(out, 'commands', 'layoutCommands.js'));
  const m54Positions = () => Object.fromEntries(doc().nodes.map((node) => [node.id, [node.x, node.y]]));
  const m54Same = (a, b) => a[0] === b[0] && a[1] === b[1];
  state().dispatch(replaceDocument(createDemoDoc()));
  const m54Base = m54Positions();
  const m54BaseHistory = state().past.length;
  const m54Result = computeLayout(doc(), { kind: 'circle' });
  check('圆环布局能算出全部 6 个实体的新坐标', m54Result.placements.length === 6 && m54Result.moved === 6, m54Result.moved);
  state().dispatch(applyLayout(m54Result));
  const m54After = m54Positions();
  check(
    '写回后坐标与布局结果一致',
    m54Result.placements.every((placement) => m54Same(m54After[placement.id], [placement.x, placement.y])),
  );
  check('自动布局只压一条撤销记录', state().past.length === m54BaseHistory + 1, state().past.length - m54BaseHistory);
  state().undo();
  check(
    '撤销一次全部坐标回到原位',
    Object.keys(m54Base).every((id) => m54Same(m54Positions()[id], m54Base[id])),
  );
  state().redo();
  check(
    '重做后回到布局后的坐标',
    m54Result.placements.every((placement) => m54Same(m54Positions()[placement.id], [placement.x, placement.y])),
  );
  state().dispatch(replaceDocument(createDemoDoc()));
  const m54Locked = computeLayout(doc(), { kind: 'grid', lockedIds: ['zhang', 'li'] });
  check(
    '锁定的实体不移动',
    m54Locked.placements.filter((placement) => placement.locked).map((placement) => placement.id).sort().join(',') === 'li,zhang' &&
      m54Locked.moved === 4,
    m54Locked.moved,
  );
  state().dispatch(applyLayout(m54Locked));
  check(
    '锁定实体坐标逐位不变，其余实体被整理',
    m54Same(m54Positions().zhang, [120, 140]) && m54Same(m54Positions().li, [660, 140]),
    [m54Positions().zhang, m54Positions().li],
  );

  console.log('[35] 演示顺序与关联（M5-5）');
  const { presentationDeck, presentationOrder, relatedOf } = require(path.join(out, 'lib', 'present.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const m55Order = presentationOrder(doc());
  check(
    '演示顺序按实体类型分组：人物 → 组织 → 地点 → 事件 → 证据',
    m55Order.length === 6 &&
      m55Order.map((node) => node.type).join(',') === 'person,person,org,place,event,evidence',
    m55Order.map((node) => node.type + ':' + node.title),
  );
  check(
    '同一类型内按中文标题排序（人物：李梅在张建国之前）',
    m55Order[0].id === 'li' && m55Order[1].id === 'zhang',
    m55Order.slice(0, 2).map((node) => node.title),
  );
  const m55Zhang = relatedOf(doc(), 'zhang');
  check('张建国的关联 4 条', m55Zhang.length === 4, m55Zhang.length);
  check(
    '关联方向与对端正确：转入 / 转出都收集',
    m55Zhang.find((item) => item.edge.id === 'e-call')?.direction === 'in' &&
      m55Zhang.find((item) => item.edge.id === 'e-call')?.other.id === 'li' &&
      m55Zhang.find((item) => item.edge.id === 'e-accomplice')?.direction === 'out' &&
      m55Zhang.find((item) => item.edge.id === 'e-accomplice')?.other.id === 'gang',
  );
  check('不存在的实体没有关联', relatedOf(doc(), 'nobody').length === 0);
  const m55Ktv = relatedOf(doc(), 'ktv');
  check('地点只有一条入边（首次接触 → 夜色KTV）', m55Ktv.length === 1 && m55Ktv[0].direction === 'in' && m55Ktv[0].other.id === 'e1');
  const m55Deck = presentationDeck(doc());
  check(
    '演示台每屏是一实体 + 其关联，总数与实体一致',
    m55Deck.length === 6 && m55Deck[0].node.id === m55Order[0].id && m55Deck.every((slide) => slide.related.length === relatedOf(doc(), slide.node.id).length),
  );
  const m55Before = JSON.stringify(doc());
  presentationDeck(doc());
  check('演示数据只读：生成演示台不改动文档', JSON.stringify(doc()) === m55Before);
  check(
    '全部关联合计 = 关系的两倍（每条边两端各出现一次）',
    m55Deck.reduce((sum, slide) => sum + slide.related.length, 0) === doc().edges.length * 2,
    [m55Deck.reduce((sum, slide) => sum + slide.related.length, 0), doc().edges.length * 2],
  );

  console.log('');
  const m55Bands = timelineBands(timeline, scale);
  check(
    '区间条带只覆盖有区间的实体（李梅 09-01 → 09-10 占满整条）',
    m55Bands.length === 1 && m55Bands[0].id === 'li' && m55Bands[0].left === 0 && Math.abs(m55Bands[0].width - 1) < 1e-9,
    m55Bands,
  );
  const m55Shorter = JSON.parse(JSON.stringify(timelineDoc));
  m55Shorter.nodes.find((node) => node.id === 'li').time = { start: '2026-09-01', end: '2026-09-05' };
  m55Shorter.nodes.find((node) => node.id === 'gang').time = { start: '2026-09-10' };
  const m55ShortBands = timelineBands(buildTimeline(m55Shorter), timelineScale(m55Shorter));
  check(
    '区间条带宽度 = 区间长度 / 总跨度（4 天 / 9 天）',
    m55ShortBands.length === 1 && Math.abs(m55ShortBands[0].width - 4 / 9) < 1e-9,
    m55ShortBands[0] && m55ShortBands[0].width,
  );
  let m55Cursor = scale.min;
  let m55Frames = 0;
  while (m55Cursor < scale.max && m55Frames < 100000) {
    m55Cursor = advanceCursor(scale, m55Cursor, 1, (scale.span / 60000) * 16);
    m55Frames += 1;
  }
  check(
    '1× 播放按 60fps 在 60 秒内走到末尾并停住',
    m55Cursor === scale.max && m55Frames >= 3600 && m55Frames <= 3800,
    m55Frames,
  );
  check(
    '游标滑杆比例可往返换算（0 / 0.5 / 1）',
    cursorFromRatio(scale, 0) === scale.min &&
      cursorFromRatio(scale, 1) === scale.max &&
      Math.abs(ratioFromCursor(scale, scale.min + scale.span / 2) - 0.5) < 1e-9,
  );

  console.log('[36] 抽取建图：样本笔录与待确认队列（M6）');
  const { extractFromText, adoptionScore, aliasCandidates } = require(path.join(out, 'lib', 'extract.js'));
  const { SAMPLE_TRANSCRIPT, SAMPLE_REFERENCE } = require(path.join(out, 'data', 'sampleTranscript.js'));
  const { acceptAiDrafts } = require(path.join(out, 'commands', 'aiCommands.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const m6Before = JSON.stringify(doc());
  const m6Extract = extractFromText(SAMPLE_TRANSCRIPT);
  check('抽取不改动 Model（Gate 0-4）', JSON.stringify(doc()) === m6Before);
  check(
    '样本笔录抽出 6 个以上实体',
    m6Extract.nodes.length >= 6,
    m6Extract.nodes.map((node) => node.title),
  );
  check(
    '转账关系：李梅 → 恒信财务公司，实线 88，标签「转账 50 万」',
    (() => {
      const edge = m6Extract.edges.find((item) => item.sourceTitle === '李梅' && item.targetTitle === '恒信财务公司' && item.relType === '转账');
      return edge !== undefined && edge.style === 'solid' && edge.confidence === 88 && edge.label === '转账 50 万' && edge.weight === 500000;
    })(),
    m6Extract.edges.map((edge) => [edge.sourceTitle, edge.relType, edge.targetTitle, edge.style, edge.confidence]),
  );
  check(
    '通话关系：李梅 → 张建国，实线 88',
    (() => {
      const edge = m6Extract.edges.find((item) => item.sourceTitle === '李梅' && item.targetTitle === '张建国' && item.relType === '通话');
      return edge !== undefined && edge.style === 'solid' && edge.confidence === 88;
    })(),
  );
  check(
    '陈述性「认识」关系用点线 45，不伪造已证实',
    (() => {
      const edge = m6Extract.edges.find((item) => item.relType === '认识');
      return edge !== undefined && edge.style === 'dotted' && edge.confidence <= 50;
    })(),
    m6Extract.edges.filter((edge) => edge.style !== 'solid').map((edge) => [edge.relType, edge.style, edge.confidence]),
  );
  check(
    '手机号进入待核实清单（不当作实体）',
    m6Extract.unresolved.some((item) => item.includes('手机号')) && m6Extract.unresolved.some((item) => item.includes('13800138000')),
    m6Extract.unresolved,
  );
  const m6Score = adoptionScore(m6Extract, SAMPLE_REFERENCE);
  check(
    '采集采纳率 8/8 = 100%（门禁 ≥70%）',
    m6Score.matched === 8 && m6Score.total === 8 && m6Score.rate >= 0.7 && m6Score.missing.length === 0,
    m6Score,
  );
  check(
    '别名合并候选能发现「张建国 / 三哥」',
    (() => {
      const nodes = [
        { id: 'n1', type: 'person', title: '张建国', aliases: ['三哥'] },
        { id: 'n2', type: 'person', title: '三哥', aliases: [] },
      ];
      return aliasCandidates(nodes).some((item) => item.reason.includes('别名'));
    })(),
  );
  const m6PastBefore = state().past.length;
  const m6NodeCount = doc().nodes.length;
  state().dispatch(acceptAiDrafts({ nodes: m6Extract.nodes, edges: m6Extract.edges }));
  check(
    '采纳后整批只压一条撤销记录',
    state().past.length - m6PastBefore === 1,
    state().past.length - m6PastBefore,
  );
  check(
    '与既有节点按标题合并（李梅不产生副本）',
    doc().nodes.filter((node) => node.title === '李梅').length === 1,
    doc().nodes.filter((node) => node.title === '李梅').length,
  );
  check(
    '新实体只进「待核实」状态，不自动已证实',
    (() => {
      const org = doc().nodes.find((node) => node.title === '恒信财务公司');
      const evidence = doc().nodes.find((node) => node.title === '银行流水');
      return org !== undefined && org.status === 'todo' && org.type === 'org' && evidence !== undefined && evidence.type === 'evidence';
    })(),
    doc().nodes.filter((node) => node.title === '恒信财务公司' || node.title === '银行流水').map((node) => [node.title, node.type, node.status]),
  );
  check(
    '采纳后新增关系（转账 / 通话都落到画布）',
    doc().edges.some((edge) => edge.relType === '转账' && edge.label === '转账 50 万') &&
      doc().edges.some((edge) => edge.relType === '通话'),
    doc().edges.map((edge) => edge.relType),
  );
  check('撤销一次全部撤回', (state().undo(), JSON.stringify(doc()) === m6Before));
  state().dispatch(replaceDocument(createDemoDoc()));

  console.log('');
  console.log('[37] 矛盾检测与证据链审查（M6）');
  const { analyzeConflicts } = require(path.join(out, 'lib', 'contradictions.js'));
  const m6Base = JSON.parse(JSON.stringify(createDemoDoc()));
  const m6Template = m6Base.nodes.find((node) => node.title === '李梅');
  const m6ConflictDoc = JSON.parse(JSON.stringify(m6Base));
  m6ConflictDoc.nodes.find((node) => node.id === 'zhang').time = { start: '2026-09-05', end: '2026-09-01' };
  const m6Dup = JSON.parse(JSON.stringify(m6Template));
  m6Dup.id = 'li-dup';
  m6Dup.x = m6Template.x + 300;
  m6Dup.title = m6Template.title;
  m6ConflictDoc.nodes.push(m6Dup);
  const m6Claim = JSON.parse(JSON.stringify(m6Template));
  m6Claim.id = 'claim-1';
  m6Claim.x = m6Template.x;
  m6Claim.y = m6Template.y + 300;
  m6Claim.title = '王五';
  m6Claim.status = 'confirmed';
  m6Claim.notes = '已确认其参与分赃。';
  m6ConflictDoc.nodes.push(m6Claim);
  m6ConflictDoc.edges.push({
    id: 'e-solid-li',
    source: 'li',
    target: 'zhang',
    relType: '认识',
    label: '认识',
    path: 'bezier',
    directed: false,
    style: 'solid',
    confidence: 90,
    evidenceIds: [],
  });
  const m6Report = analyzeConflicts(m6ConflictDoc, { template: 'fraud' });
  const m6Types = new Set(m6Report.conflicts.map((item) => item.type));
  check('命中时间冲突', m6Types.has('time_conflict'), [...m6Types]);
  check('命中一物多主（同名实体）', m6Types.has('duplicate_identity'), [...m6Types]);
  check('命中无证据断言（已证实却没有证据）', m6Types.has('unsupported_claim'), [...m6Types]);
  check('命中关系矛盾（同一对实体同时有实线与虚线）', m6Types.has('contradiction'), [...m6Types]);
  check(
    '每条冲突都指到具体实体并给出问句建议',
    m6Report.conflicts.every((item) => item.involvedIds.length > 0 && item.suggestion.length > 0),
    m6Report.conflicts.map((item) => [item.type, item.involvedIds]),
  );
  check(
    '冲突按严重程度排序（高在前）',
    (() => {
      const order = { high: 0, medium: 1, low: 2 };
      const sorted = m6Report.conflicts.map((item) => order[item.severity]);
      return sorted.every((value, index) => index === 0 || sorted[index - 1] <= value);
    })(),
    m6Report.conflicts.map((item) => item.severity),
  );
  check(
    '证据链模板覆盖五个阶段并给出状态',
    m6Report.chainReview.length === 5 && m6Report.chainReview.every((item) => ['covered', 'weak', 'missing'].includes(item.status)),
    m6Report.chainReview,
  );
  check('建议不超过 5 条', m6Report.nextSteps.length > 0 && m6Report.nextSteps.length <= 5, m6Report.nextSteps.length);
  check(
    '审查只读：不修改文档',
    (() => {
      const before = JSON.stringify(m6ConflictDoc);
      analyzeConflicts(m6ConflictDoc, { template: 'fraud' });
      return JSON.stringify(m6ConflictDoc) === before;
    })(),
  );

  console.log('');
  console.log('[38] 自然语言编辑：diff 预览与二次确认（M6）');
  const { parseNlEdit, buildNlCommands } = require(path.join(out, 'lib', 'nlEdit.js'));
  const { composeCommands } = require(path.join(out, 'commands', 'compose.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const m6LinkPlan = parseNlEdit(doc(), '把李梅和张建国连起来，关系是同伙');
  check(
    '连接指令解析成一条可执行的关系预览',
    m6LinkPlan.commands.length === 1 && m6LinkPlan.preview.length === 1 && m6LinkPlan.preview[0].ready === true && m6LinkPlan.hasDelete === false,
    m6LinkPlan,
  );
  check(
    '预览文案点名两端实体与关系',
    m6LinkPlan.preview[0].text.includes('李梅') && m6LinkPlan.preview[0].text.includes('张建国') && m6LinkPlan.preview[0].text.includes('同伙'),
    m6LinkPlan.preview[0].text,
  );
  check(
    '未提供证据的指令关系不吃「已证实」（点线/虚线且置信度 ≤60）',
    (() => {
      const commands = buildNlCommands(doc(), m6LinkPlan);
      const command = m6LinkPlan.commands[0];
      return (
        commands.length === 1 &&
        command.kind === 'addEdge' &&
        command.style !== 'solid' &&
        command.confidence <= 60
      );
    })(),
    m6LinkPlan.commands,
  );
  const m6DeletePlan = parseNlEdit(doc(), '删除李梅');
  check(
    '删除指令标记 hasDelete，必须二次确认',
    m6DeletePlan.hasDelete === true && m6DeletePlan.needsConfirmation === true && m6DeletePlan.commands.length === 1,
    m6DeletePlan,
  );
  const m6Unclear = parseNlEdit(doc(), '处理一下这个案子');
  check(
    '无法解析的指令不生成命令，只提澄清问题',
    m6Unclear.commands.length === 0 && m6Unclear.questions.length > 0 && m6Unclear.preview.every((item) => item.ready === false),
    m6Unclear,
  );
  const m6BeforeNl = JSON.stringify(doc());
  check('预览阶段不改动 Model', JSON.stringify(doc()) === m6BeforeNl);
  const m6PastNl = state().past.length;
  state().dispatch(composeCommands('AI 指令：测试', buildNlCommands(doc(), m6LinkPlan)));
  check(
    '执行后新增关系且只压一条撤销记录',
    doc().edges.some((edge) => edge.relType === '同伙') && state().past.length - m6PastNl === 1,
    [doc().edges.length, state().past.length - m6PastNl],
  );
  state().undo();
  check('一次撤销撤回整批指令', JSON.stringify(doc()) === m6BeforeNl);
  state().dispatch(replaceDocument(createDemoDoc()));

  console.log('');
  console.log('[39] 报告引用与 Word 导出（M6）');
  const { buildReport, reportPlainLines } = require(path.join(out, 'lib', 'report.js'));
  const { buildReportDocx } = require(path.join(out, 'serializers', 'reportDocx.js'));
  const { unzipSync, strFromU8 } = require('fflate');
  const m6ReportDoc = createDemoDoc(true);
  const m6Text = buildReport(m6ReportDoc, { generatedAt: '2026-10-19T12:00:00.000Z', unresolved: ['手机号 13800138000 的实名机主待核实'] });
  check('报告固定七节', m6Text.sections === 7 && (m6Text.markdown.match(/^## /gm) || []).length === 7, (m6Text.markdown.match(/^## /gm) || []).length);
  check('报告有引用（[节点:] / [证据:]）', m6Text.citations > 0, m6Text.citations);
  const m6FactSections = m6Text.markdown
    .split(/^## /m)
    .filter((section) => /^[二三四五]、/.test(section));
  check(
    '每条事实句都带引用（第二至五节的项目符号）',
    m6FactSections.length === 4 &&
      m6FactSections.every((section) =>
        section
          .split('\n')
          .filter((line) => line.startsWith('- '))
          .every((line) => line.includes('[节点:') || line.includes('[证据:')),
      ),
    m6FactSections
      .flatMap((section) => section.split('\n'))
      .filter((line) => line.startsWith('- ') && !line.includes('[节点:') && !line.includes('[证据:')),
  );
  check(
    '推测关系标注「（待核实）」',
    m6Text.markdown.includes('（待核实）'),
    m6Text.markdown.split('\n').filter((line) => line.includes('（待核实）')).slice(0, 2),
  );
  check(
    '报告可复现（同输入同输出）',
    buildReport(m6ReportDoc, { generatedAt: '2026-10-19T12:00:00.000Z', unresolved: ['手机号 13800138000 的实名机主待核实'] }).markdown === m6Text.markdown,
  );
  const m6Docx = buildReportDocx(m6Text.markdown, m6Text.title);
  check('Word 文件是 zip 容器（PK 头）', m6Docx[0] === 0x50 && m6Docx[1] === 0x4b && m6Docx.length > 1024, m6Docx.length);
  const m6Zip = unzipSync(m6Docx);
  check(
    'docx 含 [Content_Types].xml 与 word/document.xml',
    m6Zip['[Content_Types].xml'] !== undefined && m6Zip['word/document.xml'] !== undefined,
    Object.keys(m6Zip),
  );
  const m6Xml = strFromU8(m6Zip['word/document.xml']);
  check(
    'Word 正文包含案件实体与证据名称',
    m6Xml.includes('李梅') && m6Xml.includes('银行流水') && m6Xml.includes('（待核实）'),
    m6Xml.length,
  );
  check(
    'Word 正文保留引用标记与报告小节',
    m6Xml.includes('[节点:') && m6Xml.includes('[证据:') && m6Xml.includes('情况分析报告'),
  );
  const m6Plain = reportPlainLines(m6Text.markdown);
  check(
    '纯文本行拆分类别正确（标题/小节/项目符号）',
    m6Plain[0].kind === 'title' && m6Plain.some((row) => row.kind === 'heading') && m6Plain.some((row) => row.kind === 'bullet'),
    m6Plain.slice(0, 3),
  );

  console.log('');
  console.log('[40] AI 通道设置与数据边界（M6）');
  const {
    DEFAULT_AI_SETTINGS,
    PROVIDER_LABEL,
    isLocalProvider,
    normalizeAiSettings,
    providerPrivacyText,
    requireRemotePermission,
  } = require(path.join(out, 'services', 'ai', 'settings.js'));
  const { parseExtractReply, P4_EXTRACT_PROMPT } = require(path.join(out, 'services', 'ai', 'prompts.js'));
  check(
    '默认通道是内置规则（离线）',
    DEFAULT_AI_SETTINGS.provider === 'builtin' && DEFAULT_AI_SETTINGS.allowRemote === false,
    DEFAULT_AI_SETTINGS,
  );
  check(
    '三种通道都有中文名与隐私说明',
    Object.keys(PROVIDER_LABEL).length === 3 &&
      providerPrivacyText({ ...DEFAULT_AI_SETTINGS, provider: 'builtin' }).includes('离线') &&
      providerPrivacyText({ ...DEFAULT_AI_SETTINGS, provider: 'openai', allowRemote: true }).includes('远程'),
  );
  check(
    'Ollama 只允许回环地址，远程地址不算本机',
    isLocalProvider({ ...DEFAULT_AI_SETTINGS, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434' }) === true &&
      isLocalProvider({ ...DEFAULT_AI_SETTINGS, provider: 'ollama', baseUrl: 'http://10.0.0.8:11434' }) === false,
  );
  check(
    '未允许远程时调用远程通道直接拒绝',
    (() => {
      try {
        requireRemotePermission({ ...DEFAULT_AI_SETTINGS, provider: 'openai', allowRemote: false });
        return false;
      } catch (error) {
        return String(error.message).includes('纯本地模式');
      }
    })(),
  );
  check('内置通道无需远程许可', (() => {
    try {
      requireRemotePermission(DEFAULT_AI_SETTINGS);
      return true;
    } catch {
      return false;
    }
  })());
  const m6BadSettings = normalizeAiSettings({ provider: 'chatgpt', model: '', baseUrl: '', allowRemote: 'yes' });
  check(
    '非法设置被夹回默认值',
    m6BadSettings.provider === 'builtin' && m6BadSettings.model === DEFAULT_AI_SETTINGS.model && m6BadSettings.allowRemote === false,
    m6BadSettings,
  );
  const m6Reply = '好的：\n' + String.fromCharCode(96, 96, 96) + 'json\n' + JSON.stringify(m6Extract) + '\n' + String.fromCharCode(96, 96, 96);
  const m6Parsed = parseExtractReply(m6Reply);
  check(
    '模型回复可解析（剥掉代码围栏）',
    m6Parsed.nodes.length === m6Extract.nodes.length && m6Parsed.edges.length === m6Extract.edges.length,
    [m6Parsed.nodes.length, m6Parsed.edges.length],
  );
  check(
    '非法模型回复抛中文错误',
    (() => {
      try {
        parseExtractReply('我不知道');
        return false;
      } catch (error) {
        return String(error.message).includes('JSON');
      }
    })(),
  );
  check(
    'P4 提示词内置线型语义与禁止虚构红线',
    P4_EXTRACT_PROMPT.includes('solid') && P4_EXTRACT_PROMPT.includes('dotted') && P4_EXTRACT_PROMPT.includes('unresolved'),
    P4_EXTRACT_PROMPT.length,
  );

  console.log('[41] 纯本地模式零外呼（M6 验收 5）');
  const m6OfflineOriginalFetch = globalThis.fetch;
  let m6OfflineCalls = 0;
  globalThis.fetch = (...args) => {
    m6OfflineCalls += 1;
    throw new Error('纯本地模式不应发起网络请求：' + String(args[0]));
  };
  let m6OfflineExtract = null;
  let m6OfflineReport = null;
  let m6OfflineDocx = null;
  let m6OfflineError = null;
  try {
    m6OfflineExtract = extractFromText(SAMPLE_TRANSCRIPT);
    const offlineDoc = createDemoDoc(true);
    const offlineConflicts = analyzeConflicts(offlineDoc, { template: 'fraud' });
    m6OfflineReport = buildReport(offlineDoc, { unresolved: ['手机号待核实'], conflicts: offlineConflicts });
    m6OfflineDocx = buildReportDocx(m6OfflineReport.markdown, m6OfflineReport.title);
  } catch (error) {
    m6OfflineError = error;
  } finally {
    globalThis.fetch = m6OfflineOriginalFetch;
  }
  check(
    '断网也能完成抽取、审查、报告与 Word 导出',
    m6OfflineError === null && m6OfflineExtract !== null && m6OfflineExtract.nodes.length >= 6 && m6OfflineReport !== null && m6OfflineReport.sections === 7 && m6OfflineDocx[0] === 0x50 && m6OfflineDocx[1] === 0x4b,
    m6OfflineError ? String(m6OfflineError.message) : '',
  );
  check('全程没有发起任何网络请求', m6OfflineCalls === 0, m6OfflineCalls);
  check('离线报告仍带引用', m6OfflineReport.citations > 0, m6OfflineReport.citations);
  check(
    '离线模式仍拒绝未授权的远程通道',
    (() => {
      try {
        requireRemotePermission({ ...DEFAULT_AI_SETTINGS, provider: 'openai', allowRemote: false });
        return false;
      } catch (error) {
        return String(error.message).includes('纯本地模式');
      }
    })(),
  );


  console.log('[42] 多假设与证据链（M7-1 / M7-2）');
  const {
    addHypothesis,
    updateHypothesis,
    deleteHypothesis,
    setStance,
    clearStance,
  } = require(path.join(out, 'commands', 'hypothesisCommands.js'));
  const { hypothesisScore, rankHypotheses, compareHypotheses } = require(path.join(out, 'lib', 'hypothesis.js'));
  const { CHAIN6_STAGES, buildEvidenceChain } = require(path.join(out, 'lib', 'evidenceChain.js'));
  const { annotationsForNode, countAnchorsForNode } = require(path.join(out, 'lib', 'annotation.js'));
  state().dispatch(replaceDocument(createDemoDoc()));
  const m7Doc = doc();
  check('演示数据带两个平行假设', m7Doc.hypotheses.length === 2 && m7Doc.hypotheses.every((item) => item.stances.length >= 3), m7Doc.hypotheses.map((item) => item.stances.length));
  const m7Zhang = m7Doc.hypotheses.find((item) => item.id === 'hyp-zhang');
  const m7ScoreA = hypothesisScore(m7Doc, m7Zhang);
  const m7ScoreB = hypothesisScore(JSON.parse(JSON.stringify(m7Doc)), m7Zhang);
  check(
    '支持度计分可复现（同一文档两次同分）',
    m7ScoreA.score === m7ScoreB.score && m7ScoreA.supportCount === 3 && m7ScoreA.refuteCount === 1,
    [m7ScoreA.score, m7ScoreB.score],
  );
  const m7Rank = rankHypotheses(m7Doc);
  check(
    '假设按支持度降序排名，张建国主导假设领先',
    m7Rank.length === 2 && m7Rank[0].hypothesis.id === 'hyp-zhang' && m7Rank[0].score.score >= m7Rank[1].score.score,
    m7Rank.map((item) => [item.hypothesis.id, item.score.score]),
  );
  const m7Compare = compareHypotheses(m7Doc);
  check(
    '并排对比标出立场冲突的证据（张建国、疑似同伙）',
    m7Compare.divergent.length >= 2 && m7Compare.divergent.some((row) => row.targetId === 'zhang') && m7Compare.divergent.some((row) => row.targetId === 'e-accomplice'),
    m7Compare.divergent.map((row) => row.targetId),
  );
  const m7BeforeAdd = doc().hypotheses.length;
  state().dispatch(addHypothesis({ title: '第三种解释', summary: '测试假设' }));
  check('新增假设命令入栈', doc().hypotheses.length === m7BeforeAdd + 1 && doc().hypotheses[doc().hypotheses.length - 1].title === '第三种解释');
  state().undo();
  check('撤销新增假设后回到两条', doc().hypotheses.length === m7BeforeAdd);
  state().dispatch(updateHypothesis('hyp-li', { title: '李梅独立走账' }));
  check('修改假设标题生效', doc().hypotheses.find((item) => item.id === 'hyp-li').title === '李梅独立走账');
  state().undo();
  check('撤销修改后标题回原样', doc().hypotheses.find((item) => item.id === 'hyp-li').title === '李梅明知并参与走账');
  const m7ScoreBefore = hypothesisScore(doc(), doc().hypotheses.find((item) => item.id === 'hyp-zhang')).refuteCount;
  state().dispatch(setStance({ hypothesisId: 'hyp-zhang', targetId: 'li', targetKind: 'node', stance: 'refute' }));
  const m7AfterStance = hypothesisScore(doc(), doc().hypotheses.find((item) => item.id === 'hyp-zhang'));
  check(
    '同一证据可以在假设里改标反驳，支持度立即变化',
    m7AfterStance.refuteCount === m7ScoreBefore + 1 && m7AfterStance.score < m7ScoreA.score,
    [m7ScoreA.score, m7AfterStance.score],
  );
  state().undo();
  check('撤销立场后计分复原', hypothesisScore(doc(), doc().hypotheses.find((item) => item.id === 'hyp-zhang')).score === m7ScoreA.score);
  state().dispatch(clearStance('hyp-zhang', 'zhang', 'node'));
  check('清除立场后该证据不再参与计分', hypothesisScore(doc(), doc().hypotheses.find((item) => item.id === 'hyp-zhang')).supportCount === 2);
  state().undo();
  check('撤销清除立场后证据回到支持列表', hypothesisScore(doc(), doc().hypotheses.find((item) => item.id === 'hyp-zhang')).supportCount === 3);
  state().dispatch(setStance({ hypothesisId: 'hyp-zhang', targetId: 'nobody', targetKind: 'node', stance: 'support' }));
  check('不存在的目标不会写进立场表', doc().hypotheses.find((item) => item.id === 'hyp-zhang').stances.every((item) => item.targetId !== 'nobody'));
  state().dispatch(deleteHypothesis('hyp-li'));
  check('删除假设后只剩一条', doc().hypotheses.length === 1);
  state().undo();
  check('撤销删除假设后两条都在', doc().hypotheses.length === 2);
  const m7Chain = buildEvidenceChain(doc());
  check(
    '证据链按「动机→预谋→准备→实施→逃离→销赃」固定六阶段排列',
    m7Chain.stages.length === 6 && m7Chain.stages.map((stage) => stage.label).join('') === '动机预谋准备实施逃离销赃',
    m7Chain.stages.map((stage) => stage.label),
  );
  const m7ChainDoc = JSON.parse(JSON.stringify(createDemoDoc()));
  const m7Template = m7ChainDoc.nodes[0];
  const m7StageNodes = [
    ['m7-motive', '欠债动机', '因欠下大量债务而图财'],
    ['m7-plan', '预谋商量', '与同伙事先商量并踩点'],
    ['m7-prepare', '准备工具', '事先购买工具并准备银行卡'],
    ['m7-act', '实施转账', '持刀威胁后实施转账'],
    ['m7-launder', '销赃变现', '通过空壳公司洗钱套现'],
  ];
  m7StageNodes.forEach(([id, title, note], index) => {
    const node = JSON.parse(JSON.stringify(m7Template));
    node.id = id;
    node.title = title;
    node.type = 'event';
    node.notes = note;
    node.attachments = index === 3 ? ['ev1'] : [];
    m7ChainDoc.nodes.push(node);
  });
  const m7FilledChain = buildEvidenceChain(m7ChainDoc);
  check(
    '阶段归类命中动机/预谋/准备/实施/销赃五段，逃离留空',
    m7FilledChain.stages.filter((stage) => stage.items.length > 0).length === 5 && m7FilledChain.gaps.length === 1 && m7FilledChain.gaps[0] === 'escape',
    m7FilledChain.gaps,
  );
  check(
    '条目的证据支撑来自附件，缺证据的条目标为 weak',
    m7FilledChain.stages.find((stage) => stage.id === 'act').items[0].weak === false && m7FilledChain.stages.find((stage) => stage.id === 'motive').items[0].weak === true,
  );
  check('演示数据的证据链存在断点，覆盖率低于 100%', m7Chain.gaps.length >= 1 && m7Chain.coverage < 100, [m7Chain.gaps, m7Chain.coverage]);
  const m7AnchorDoc = createDemoDoc(true);
  const m7Anchors = annotationsForNode(m7AnchorDoc, 'zhang');
  check(
    '区域锚点按节点查到素材与框，含素材编号',
    m7Anchors.length === 1 && m7Anchors[0].assetId === 'a-demo-photo' && m7Anchors[0].shape === 'anchor' && Boolean(m7Anchors[0].assetNo),
    m7Anchors,
  );
  check('没有绑定区域的节点返回空列表', annotationsForNode(m7AnchorDoc, 'li').length === 0 && countAnchorsForNode(m7AnchorDoc, 'zhang') === 1);
  const m7Legacy = JSON.parse(JSON.stringify(createDemoDoc()));
  delete m7Legacy.hypotheses;
  check('旧存档没有 hypotheses 字段时迁移为空数组', normalizeDoc(m7Legacy).hypotheses.length === 0);
  const m7Round = fromJson(toJson(createDemoDoc()));
  check('JSON 往返保留假设与立场', m7Round.hypotheses.length === 2 && m7Round.hypotheses[0].stances.length === m7Doc.hypotheses[0].stances.length);


  console.log('[43] OCR 结构化与 AI 生图红线（M7-3 / M7-4）');
  const {
    normalizeOcrText,
    parseOcrText,
    parseOcrAmount,
    parseOcrTime,
    parseOcrAccount,
    maskAccount,
    receiptToNodeFields,
    ocrSummary,
  } = require(path.join(out, 'lib', 'ocr.js'));
  const {
    AI_PRESETS,
    AI_WATERMARK_TEXT,
    buildAiMeta,
    buildAiPrompt,
    buildComfyWorkflow,
    defaultAiSeed,
    inspectAiAsset,
    inspectAiPrompt,
    proceduralSketch,
    watermarkPlan,
    blocksConfirmed,
  } = require(path.join(out, 'lib', 'aiImage.js'));
  const m7OcrText = '转账成功\n金额：￥５００，０００.００\n收款方：恒信财务公司\n账号：6222 0202 0000 1234\n时间：2026年9月4日 9时12分';
  const m7Ocr = parseOcrText(m7OcrText);
  check(
    'OCR 归一化全角数字与标点',
    normalizeOcrText('金额：１２３．４５，元') === '金额:123.45,元' && normalizeOcrText('２０２６年９月４日') === '2026年9月4日',
  );
  check(
    '转账截图抽出金额 500000',
    m7Ocr.fields.amount === '500000',
    m7Ocr.fields.amount,
  );
  check('抽出交易时间并按 ISO 墙上时间归一', m7Ocr.fields.time === '2026-09-04T09:12:00', m7Ocr.fields.time);
  check('抽出账号并去掉空格', m7Ocr.fields.account === '6222020200001234', m7Ocr.fields.account);
  check('抽出对方户名', m7Ocr.fields.counterparty === '恒信财务公司', m7Ocr.fields.counterparty);
  check('四项齐全时没有缺失项且置信度 ≥90', m7Ocr.missing.length === 0 && m7Ocr.confidence >= 90, m7Ocr);
  check('空文本四项全缺、置信度回落到 40', parseOcrText('').missing.length === 4 && parseOcrText('').confidence === 40);
  check('万元按万换算：3.5 万元 → 35000', parseOcrAmount('转账金额：3.5万元') === '35000', parseOcrAmount('转账金额：3.5万元'));
  check('无标签的 ¥ 金额也能抽', parseOcrAmount('实付 ¥1,280.00') === '1280', parseOcrAmount('实付 ¥1,280.00'));
  check('非法日期不被当成时间', parseOcrTime('2026年13月40日') === null && parseOcrTime('2026-09-04') === '2026-09-04T00:00:00');
  check('16 位以下数字不算账号', parseOcrAccount('订单号 1234567890') === null && parseOcrAccount('卡号 6222 0202 0000 1234') === '6222020200001234');
  check('账号脱敏只露前四后四', maskAccount('6222020200001234') === '6222 **** **** 1234', maskAccount('6222020200001234'));
  const m7OcrFields = receiptToNodeFields(m7Ocr);
  check(
    '字段映射到节点属性（金额带单位、时间原样）',
    m7OcrFields['金额'] === '500000 元' && m7OcrFields['交易时间'] === '2026-09-04T09:12:00' && m7OcrFields['对方户名'] === '恒信财务公司',
    m7OcrFields,
  );
  check('OCR 摘要一行点出关键字段', ocrSummary(m7Ocr).includes('金额 500000 元') && ocrSummary(m7Ocr).includes('账号 6222 **** **** 1234'), ocrSummary(m7Ocr));
  const m7GuardFace = inspectAiPrompt('把李梅的照片换脸到张建国身上');
  check('换脸类提示词被拒并说明原因', m7GuardFace.ok === false && m7GuardFace.message.includes('换脸') && m7GuardFace.reasons.length >= 1, m7GuardFace);
  check('用真实照片合成/生成特定真人照片也被拒', inspectAiPrompt('用张三的证件照合成一个嫌疑人正面照').ok === false && inspectAiPrompt('生成王五的肖像').ok === false);
  check('正常示意图描述通过红线检查', inspectAiPrompt('五十岁左右男性，圆脸，短发，穿深色夹克').ok === true);
  const m7Spec = { preset: 'sketch', subject: '五十岁左右男性，圆脸短发', seed: 20261019 };
  const m7Pack = buildAiPrompt(m7Spec);
  check(
    '提示词包含预设风格、主体、水印要求与模拟声明',
    m7Pack.prompt.includes('模拟画像') && m7Pack.prompt.includes('圆脸短发') && m7Pack.prompt.includes(AI_WATERMARK_TEXT) && m7Pack.prompt.includes('不是真实照片'),
  );
  check('负向提示词包含真实照片与换脸', m7Pack.negativePrompt.includes('真实照片') && m7Pack.negativePrompt.includes('换脸'));
  check('四个预设齐全且都有中文名与尺寸', ['sketch', 'scene', 'item', 'enhance'].every((key) => Boolean(AI_PRESETS[key].label) && AI_PRESETS[key].width > 0));
  const m7Meta = buildAiMeta({ spec: m7Spec, provider: 'builtin', model: 'builtin-procedural', seed: 20261019, createdAt: '2026-10-19T00:00:00.000Z' });
  check(
    'aiMeta 完整：预设/正负提示词/模型/种子/水印/模拟声明',
    m7Meta.preset === 'sketch' && m7Meta.seed === 20261019 && m7Meta.params.watermark === AI_WATERMARK_TEXT && m7Meta.params.simulated === true && m7Meta.params.provider === 'builtin' && m7Meta.createdAt === '2026-10-19T00:00:00.000Z',
    m7Meta,
  );
  check(
    'AI 素材四项硬校验：分区 / aiGenerated / aiMeta / 水印记录',
    inspectAiAsset({ zone: 'ai', aiGenerated: true, aiMeta: m7Meta }).ok === true &&
      inspectAiAsset({ zone: 'evidence', aiGenerated: true, aiMeta: m7Meta }).ok === false &&
      inspectAiAsset({ zone: 'ai', aiGenerated: true }).ok === false,
  );
  check('AI 素材永远不能算已证实', blocksConfirmed({ zone: 'ai', aiGenerated: true }) === true && blocksConfirmed({ zone: 'evidence', aiGenerated: false }) === false);
  check(
    '同一描述与日期得到同一种子，不同描述不同种子',
    defaultAiSeed('圆脸短发') === defaultAiSeed('圆脸短发') && defaultAiSeed('圆脸短发') !== defaultAiSeed('长发女性'),
  );
  const m7OpsA = proceduralSketch('sketch', 20261019, 640, 480);
  const m7OpsB = proceduralSketch('sketch', 20261019, 640, 480);
  const m7OpsC = proceduralSketch('sketch', 20261020, 640, 480);
  check(
    '内置生成器同种子同笔触、换种子不同（断网可复现）',
    JSON.stringify(m7OpsA) === JSON.stringify(m7OpsB) && JSON.stringify(m7OpsA) !== JSON.stringify(m7OpsC) && m7OpsA.length >= 20,
    m7OpsA.length,
  );
  check('四种预设都能规划笔触', ['sketch', 'scene', 'item', 'enhance'].every((preset) => proceduralSketch(preset, 7, 640, 480).length >= 4));
  const m7Plan = watermarkPlan(768, 960);
  check(
    '水印几何在右下角内缩，字号随图缩放',
    m7Plan.text === AI_WATERMARK_TEXT && m7Plan.x < 768 && m7Plan.y < 960 && m7Plan.fontSize >= 12 && watermarkPlan(320, 240).fontSize === 12,
    m7Plan,
  );
  const m7Workflow = buildComfyWorkflow(m7Pack, { checkpoint: 'sd_xl_base_1.0.safetensors', width: 768, height: 960, seed: -5 });
  check(
    'ComfyUI 工作流含标准文生图七节点且种子夹成正数',
    Object.keys(m7Workflow).length === 7 && m7Workflow['1'].class_type === 'CheckpointLoaderSimple' && m7Workflow['7'].class_type === 'SaveImage' && m7Workflow['5'].inputs.seed === 5,
  );
  // 命令层兜底：挂了 AI 素材的实体被强制拦截「已证实」
  state().dispatch(replaceDocument(createDemoDoc()));
  const m7AiAsset = { id: 'a-ai-test', path: '/tmp/a.png', kind: 'image', hash: 'h', thumbnails: [], zone: 'ai', aiGenerated: true, aiMeta: m7Meta, annotations: [] };
  const { addAsset, updateNode } = require(path.join(out, 'commands', 'index.js'));
  state().dispatch(addAsset(m7AiAsset));
  state().dispatch(updateNode('zhang', { status: 'checking' }));
  state().dispatch(updateNode('zhang', { attachments: ['a-ai-test'] }));
  state().dispatch(updateNode('zhang', { status: 'confirmed' }));
  check('挂了 AI 模拟图的实体无法改成已证实（命令层拦截）', doc().nodes.find((node) => node.id === 'zhang').status === 'checking', doc().nodes.find((node) => node.id === 'zhang').status);
  state().dispatch(updateNode('zhang', { attachments: [] }));
  state().dispatch(updateNode('zhang', { status: 'confirmed' }));
  check('摘掉 AI 素材后可以正常改成已证实', doc().nodes.find((node) => node.id === 'zhang').status === 'confirmed');


  console.log('[44] 地图视图坐标解析（M7）');
  {
    const { parseGeo, geoPoints, projectGeo } = require(path.join(out, 'lib', 'map.js'));
    check('解析右栏经纬度字段', (() => {
      const p = parseGeo({ 经纬度: '31.2304,121.4737' });
      return !!p && Math.abs(p.lat - 31.2304) < 1e-9 && Math.abs(p.lng - 121.4737) < 1e-9;
    })());
    check('支持全角逗号与空格', (() => {
      const p = parseGeo({ 经纬度: ' 31.2304 ， 121.4737 ' });
      return !!p && Math.abs(p.lat - 31.2304) < 1e-9 && Math.abs(p.lng - 121.4737) < 1e-9;
    })());
    check('越界或缺失坐标被拒绝', parseGeo({ 经纬度: '91,200' }) === null && parseGeo({ 经纬度: 'abc' }) === null && parseGeo({}) === null);
    check('只把带坐标的实体放上地图', (() => {
      const pts = geoPoints(createDemoDoc().nodes);
      return pts.length === 2 && pts.every((p) => typeof p.lat === 'number' && !!p.node.id);
    })());
    check('没有经纬度字段时不产点', geoPoints([{ ...createDemoDoc().nodes[0], fields: {} }]).length === 0);
    check('投影到示意图坐标系且北在上', (() => {
      const pts = geoPoints(createDemoDoc().nodes);
      const pos = projectGeo(pts);
      const a = pos.get(pts[0].node.id);
      const b = pos.get(pts[1].node.id);
      if (!a || !b) return false;
      const north = pts[0].lat >= pts[1].lat ? a : b;
      const south = pts[0].lat >= pts[1].lat ? b : a;
      return north.y < south.y && [a.x, a.y, b.x, b.y].every((v) => v >= 0 && v <= 1000);
    })());
    check('单点也能落在画布内', (() => {
      const pos = projectGeo([{ node: createDemoDoc().nodes[0], lat: 31.2, lng: 121.4 }]);
      const p = pos.get(createDemoDoc().nodes[0].id);
      return !!p && p.x > 0 && p.x < 1000 && p.y > 0 && p.y < 620;
    })());
  }

  console.log('[45] 全局搜索与命令面板内核（M8 验收 6）');
  {
    const { searchDoc, KIND_LABEL, searchKindLabel } = require(path.join(out, 'lib', 'search.js'));
    const demo = createDemoDoc();
    const byTitle = searchDoc(demo, '张建国');
    check('按标题命中实体并排在第一', byTitle.length > 0 && byTitle[0].kind === 'node' && byTitle[0].id === 'zhang', byTitle.slice(0, 3).map((hit) => hit.kind + ':' + hit.id));
    check('别名也能搜到（三哥 / 小李）', (() => {
      const hit = searchDoc(demo, '三哥').find((item) => item.id === 'zhang');
      const hit2 = searchDoc(demo, '小李').find((item) => item.id === 'li');
      return !!hit && !!hit2 && hit.field === '别名';
    })());
    check('备注与字段参与检索', (() => {
      const notesHit = searchDoc(demo, '高回报投资');
      const fieldHit = searchDoc(demo, '常州');
      return notesHit.some((item) => item.id === 'zhang') && fieldHit.some((item) => item.id === 'zhang' && item.field === '字段 籍贯');
    })());
    check('关系按两端标题与关系名命中', (() => {
      const hits = searchDoc(demo, '转账');
      return hits.some((item) => item.kind === 'edge' && item.id === 'e-transfer');
    })());
    check('分组标题可检索', searchDoc(demo, '诈骗团伙').some((item) => item.kind === 'group' && item.id === 'g-suspect'));
    check('多词是 AND 语义（全部命中才算）', (() => {
      const both = searchDoc(demo, '张建国 常州');
      const miss = searchDoc(demo, '张建国 不存在的词');
      return both.length > 0 && miss.length === 0;
    })());
    check('素材 OCR 文本可检索并给出挂载的图片节点', (() => {
      state().dispatch(replaceDocument(createDemoDoc(true)));
      const { addAsset, addImageNode } = require(path.join(out, 'commands', 'index.js'));
      state().dispatch(addAsset({ id: 'a-search', path: '/tmp/a.png', kind: 'image', hash: 'h', thumbnails: [], name: '银行流水截图', no: 'IMG-0009', ocrText: '收款账号 6222 0202 0000 1234 金额 500000', annotations: [] }));
      state().dispatch(addImageNode({ assetId: 'a-search', x: 40, y: 40, w: 320, h: 200, assetWidth: 320, assetHeight: 200 }));
      const imageNodeId = doc().imageNodes.find((node) => node.assetId === 'a-search').id;
      const hits = searchDoc(doc(), '6222 0202');
      const hit = hits.find((item) => item.kind === 'asset' && item.id === 'a-search');
      return !!hit && hit.field === 'OCR 文本' && hit.focusId === imageNodeId;
    })());
    check('kind 文案与空查询', KIND_LABEL.node === '实体' && searchKindLabel('edge') === '关系' && searchKindLabel('asset') === '素材' && searchDoc(demo, '   ').length === 0);
    check('limit 生效且按分数降序', (() => {
      const all = searchDoc(demo, '李', 100);
      const two = searchDoc(demo, '李', 2);
      const sorted = all.every((item, index) => index === 0 || all[index - 1].score >= item.score);
      return all.length > 2 && two.length === 2 && sorted;
    })());
  }

  console.log('[46] 文本脱敏与导出复核（M8 脱敏全链路）');
  {
    const { maskIdCard, maskPhone, maskBankCard, maskText } = require(path.join(out, 'lib', 'maskText.js'));
    const { buildManifestCsv } = require(path.join(out, 'serializers', 'manifest.js'));
    check('身份证号保留前六后四', maskIdCard('证件号 110101199003071234 已核验') === '证件号 110101********1234 已核验', maskIdCard('证件号 110101199003071234 已核验'));
    check('身份证末位 X 也能脱敏', maskIdCard('11010119900307123X').endsWith('123X') && maskIdCard('11010119900307123X').includes('********'));
    check('手机号保留前三后四', maskPhone('联系 13800138000 核实') === '联系 138****8000 核实', maskPhone('联系 13800138000 核实'));
    check('银行卡号分段打码', maskBankCard('6222020200001234').replace(/\s/g, ' ') === '6222 **** **** 1234', maskBankCard('6222020200001234'));
    check('19 位卡号也能打码且保留前四后四', (() => {
      const masked = maskBankCard('6222020200001234567');
      return masked.startsWith('6222 ') && masked.endsWith(' 4567') && masked.includes('****');
    })(), maskBankCard('6222020200001234567'));
    check('短数字与金额不被误伤', maskText('金额 500000 元，账号 6222 0202 0000 1234') === '金额 500000 元，账号 6222 0202 0000 1234', maskText('金额 500000 元，账号 6222 0202 0000 1234'));
    check('混合文本一次抹掉三类号码', (() => {
      const masked = maskText('李梅 13800138000 身份证 110101199003071234 卡号 6222020200001234');
      return masked.includes('138****8000') && masked.includes('110101********1234') && masked.includes('6222 **** **** 1234') && !masked.includes('13800138000');
    })());
    check('图片包 manifest 的 OCR 文本已脱敏', (() => {
      state().dispatch(replaceDocument(createDemoDoc(true)));
      const { addAsset } = require(path.join(out, 'commands', 'index.js'));
      state().dispatch(addAsset({ id: 'a-mask', path: '/tmp/x.png', kind: 'image', hash: 'hm', thumbnails: [], name: '转账截图', no: 'IMG-0010', ocrText: '收款账号 6222020200001234 手机 13800138000 身份证 110101199003071234', annotations: [] }));
      const csv = buildManifestCsv(doc(), new Map([['a-mask', 'images/IMG-0010.png']]));
      return csv.includes('6222 **** **** 1234') && csv.includes('138****8000') && csv.includes('110101********1234') && !csv.includes('6222020200001234');
    })());
  }
  console.log('[47] AI 生成图合规审计（M8 验收 3）');
  {
    const { AI_WATERMARK_TEXT } = require(path.join(out, 'lib', 'aiImage.js'));
    const { auditAiAssets, PRESET_LABEL } = require(path.join(out, 'lib', 'aiAudit.js'));
    const aiMeta = { prompt: '生成一张刑侦案情推演用的模拟画像（中年男子，短发）', model: 'builtin-procedural', seed: 20261019, createdAt: '2026-10-19T10:00:00.000Z', preset: 'sketch', params: { provider: 'builtin', width: 768, height: 960, watermark: AI_WATERMARK_TEXT, simulated: true, subject: '中年男子' } };
    state().dispatch(replaceDocument(createDemoDoc()));
    const { addAsset } = require(path.join(out, 'commands', 'index.js'));
    check('没有 AI 图时审计为 0 张且不算违规', (() => {
      const audit = auditAiAssets(createDemoDoc(), { generatedAt: '2026-10-19T12:00:00.000Z' });
      return audit.count === 0 && audit.compliant === 0 && audit.problems.length === 0 && audit.markdown.includes('本案件尚未插入 AI 生成图');
    })());
    state().dispatch(addAsset({ id: 'a-audit-ok', path: '/tmp/ai.png', kind: 'image', hash: 'h', thumbnails: [], name: '嫌疑人模拟画像', no: 'AI-0001', zone: 'ai', aiGenerated: true, aiMeta, annotations: [] }));
    state().dispatch(addAsset({ id: 'a-audit-bad', path: '/tmp/ai2.png', kind: 'image', hash: 'h2', thumbnails: [], name: '无角标注图', zone: 'ai', aiGenerated: true, annotations: [] }));
    const audit = auditAiAssets(doc(), { generatedAt: '2026-10-19T12:00:00.000Z' });
    check('合规与违规分别计数', audit.count === 2 && audit.compliant === 1 && audit.problems.length > 0, { count: audit.count, compliant: audit.compliant, problems: audit.problems });
    check('缺 aiMeta 被判违规并写进明细', (() => {
      const row = audit.rows.find((item) => item.assetId === 'a-audit-bad');
      return !!row && row.problems.some((problem) => problem.includes('aiMeta'));
    })());
    check('合规图记录预设、模型、种子与角标', (() => {
      const row = audit.rows.find((item) => item.assetId === 'a-audit-ok');
      return !!row && row.preset === PRESET_LABEL.sketch && row.model === 'builtin-procedural' && row.seed === '20261019' && row.watermark === AI_WATERMARK_TEXT && row.problems.length === 0;
    })());
    check('审计报告三段结构齐全', ['# AI 生成图合规审计', '## 一、逐张明细', '## 二、提示词审计', '## 三、合规结论'].every((title) => audit.markdown.includes(title)));
    check('提示词进入审计（截断到 160 字）', audit.markdown.includes('生成一张刑侦案情推演用的模拟画像'));
    check('违规明细写明编号与问题', audit.markdown.includes('AI-0002') || audit.markdown.includes('无角标注图'));
    check('审计结论声明不得作为证据', audit.markdown.includes('不得作为证据') && audit.markdown.includes('已证实'));
  }
  console.log('[48] 界面主题（M8 深浅色 / 高对比）');
  {
    const { THEME_ORDER, THEME_META, THEME_STORAGE_KEY, BOARD_GRID, normalizeThemeMode, nextThemeMode } = require(path.join(out, 'lib', 'themeMode.js'));
    check('三档主题顺序为 默认 → 深色 → 高对比', JSON.stringify(THEME_ORDER) === JSON.stringify(['board', 'dark', 'contrast']));
    check('非法主题值回落到默认', normalizeThemeMode('weird') === 'board' && normalizeThemeMode(undefined) === 'board' && normalizeThemeMode(null) === 'board' && normalizeThemeMode('dark') === 'dark' && normalizeThemeMode('contrast') === 'contrast');
    check('循环切换走完三档再回到默认', nextThemeMode('board') === 'dark' && nextThemeMode('dark') === 'contrast' && nextThemeMode('contrast') === 'board' && nextThemeMode('unknown') === 'dark');
    check('每档都有中文标签与使用说明', THEME_ORDER.every((id) => typeof THEME_META[id].label === 'string' && THEME_META[id].label.length > 0 && typeof THEME_META[id].hint === 'string' && THEME_META[id].hint.length > 0), THEME_ORDER.map((id) => THEME_META[id].label).join(' / '));
    check('主题记忆键固定为 caseboard-theme（不进案件数据）', THEME_STORAGE_KEY === 'caseboard-theme');
    check('画布圆点 / 网格 / 小地图遮罩按主题取值', THEME_ORDER.every((id) => {
      const grid = BOARD_GRID[id];
      return /^#[0-9A-Fa-f]{6}$/.test(grid.dot) && /^#[0-9A-Fa-f]{6}$/.test(grid.line) && grid.mask.indexOf('rgba(') === 0;
    }));
    const fsx = require('fs');
    const cssText = fsx.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
    check('默认主题仍有暖白表面变量（Gate 0-6 主色不变）', cssText.includes('--cb-surface: #ffffff;') && cssText.includes('--cb-accent: #c0392b;'));
    check('深色主题只重映射变量且压暗表面', cssText.includes(":root[data-theme='dark']") && cssText.includes('--cb-bg: #151412;') && cssText.includes('--cb-surface: #232120;') && cssText.includes('color-scheme: dark;'));
    check('高对比主题用纯黑边框并关闭阴影', cssText.includes(":root[data-theme='contrast']") && cssText.includes('--cb-border: #000000;') && cssText.includes('--cb-text: #000000;') && /:root\[data-theme='contrast'\] \{[^}]*--cb-shadow: none;/s.test(cssText));
    check('打印强制浅色变量（深色主题也出白纸黑字）', /@media print[\s\S]*--cb-bg: #ffffff;[\s\S]*--cb-text: #1b1b1a;/.test(cssText));
    check('组件层不再写死白色背景（只走主题变量）', !/background:\s*#fff\b/i.test(cssText) && !/background:\s*#FBFAF7\b/i.test(cssText), (cssText.match(/background:\s*#fff\b/gi) || []).length + ' 处残留');
    check('样式表引用的主题变量都有定义（三档都不会出现空值）', (() => {
      const used = new Set([...cssText.matchAll(/var\((--cb-[a-z0-9-]+)/g)].map((m) => m[1]));
      const defined = new Set([...cssText.matchAll(/(--cb-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
      const missing = [...used].filter((name) => !defined.has(name));
      globalThis.smokeMissingVars = missing;
      return missing.length === 0;
    })(), (globalThis.smokeMissingVars || []).join(', '));
  }
  console.log('');
  if (failures > 0) {
    console.log('结果：' + failures + ' 项失败');
    process.exit(1);
  }
  console.log('结果：全部通过');
}