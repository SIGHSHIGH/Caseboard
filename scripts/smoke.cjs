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

console.log('');
if (failures > 0) {
  console.log('结果：' + failures + ' 项失败');
  process.exit(1);
}
console.log('结果：全部通过');