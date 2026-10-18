/* 基准与压测共用的大文档生成器（纯数据，不依赖浏览器）。 */
function buildDoc(count) {
  const types = ['person', 'org', 'place', 'item', 'event', 'evidence', 'time', 'note'];
  const doc = {
    meta: { id: 'case_bench', title: '基准案件', caseNo: 'B-1000', createdAt: '', updatedAt: '' },
    nodes: [],
    edges: [],
    groups: [],
    assets: [],
    imageNodes: [],
    views: [],
    settings: { theme: 'light', lineLegend: [] },
  };
  for (let i = 0; i < count; i += 1) {
    doc.nodes.push({
      id: 'n' + i,
      type: types[i % types.length],
      title: '实体' + i,
      x: (i % 40) * 220,
      y: Math.floor(i / 40) * 140,
      w: 208,
      h: 96,
      fields: { age: 20 + (i % 50), tag: 'T' + (i % 7) },
      tags: ['t' + (i % 5)],
      status: i % 3 === 0 ? 'confirmed' : i % 3 === 1 ? 'checking' : 'todo',
      confidence: 40 + (i % 55),
      attachments: [],
    });
  }
  for (let i = 0; i < count - 1; i += 1) {
    doc.edges.push({
      id: 'e' + i,
      source: 'n' + i,
      target: 'n' + (i + 1),
      path: 'bezier',
      relType: i % 2 ? 'call' : 'transfer',
      label: '关系' + i,
      directed: true,
      style: i % 3 === 0 ? 'solid' : i % 3 === 1 ? 'dashed' : 'dotted',
      weight: 100 + i,
      confidence: 50,
      evidenceIds: [],
    });
  }
  for (let i = 0; i < 20; i += 1) {
    doc.groups.push({ id: 'g' + i, title: '组' + i, bounds: { x: i * 100, y: i * 80, w: 360, h: 260 }, color: '#C0392B', collapsed: false });
  }
  return doc;
}

module.exports = { buildDoc };
