import type { NodeType } from '../types';

/**
 * 8 类节点的字段模板（M2-1）。
 * 作用：属性面板按类型渲染「该类型该填什么」，而不是一个万能 textarea；
 * 字段值统一存进 CaseNode.fields，模板本身不参与数据模型（换模板不迁移数据）。
 */

export type FieldKind = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface NodeFieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  placeholder?: string;
  /** 占满整行的宽字段（textarea / 长文本） */
  wide?: boolean;
}

export interface NodeTemplate {
  type: NodeType;
  label: string;
  /** 一句话说明这类实体在案情里的用途，作为左栏按钮提示与属性面板说明 */
  hint: string;
  fields: NodeFieldDef[];
}

export const NODE_TEMPLATES: Record<NodeType, NodeTemplate> = {
  person: {
    type: 'person',
    label: '人物',
    hint: '嫌疑人、受害人、证人、关系人',
    fields: [
      { key: '性别', label: '性别', kind: 'select', options: ['男', '女', '未知'] },
      { key: '年龄', label: '年龄', kind: 'number' },
      { key: '证件号', label: '证件号', kind: 'text', placeholder: '身份证 / 护照号' },
      { key: '籍贯', label: '籍贯', kind: 'text' },
      { key: '职业', label: '职业', kind: 'text' },
      { key: '联系方式', label: '联系方式', kind: 'text', placeholder: '手机 / 微信' },
      { key: '现住址', label: '现住址', kind: 'text', wide: true },
      { key: '前科记录', label: '前科记录', kind: 'textarea', wide: true },
    ],
  },
  org: {
    type: 'org',
    label: '组织',
    hint: '公司、团伙、机构等非自然人主体',
    fields: [
      { key: '性质', label: '性质', kind: 'select', options: ['公司', '空壳公司', '社团', '机构', '团伙', '其他'] },
      { key: '法定代表人', label: '法定代表人', kind: 'text' },
      { key: '注册地', label: '注册地', kind: 'text' },
      { key: '成立时间', label: '成立时间', kind: 'date' },
      { key: '统一社会信用代码', label: '统一社会信用代码', kind: 'text', wide: true },
      { key: '经营范围', label: '经营范围', kind: 'textarea', wide: true },
      { key: '是否涉案', label: '是否涉案', kind: 'select', options: ['是', '否', '待查'] },
    ],
  },
  place: {
    type: 'place',
    label: '地点',
    hint: '案发地、落脚点、交易场所',
    fields: [
      { key: '地点类型', label: '地点类型', kind: 'select', options: ['住宅', '商业', '公共场所', '交通枢纽', '野外', '其他'] },
      { key: '地址', label: '地址', kind: 'text', wide: true },
      { key: '经度', label: '经度', kind: 'number', placeholder: '经度保留 6 位小数' },
      { key: '纬度', label: '纬度', kind: 'number' },
      { key: '管辖单位', label: '管辖单位', kind: 'text' },
      { key: '是否现场', label: '是否现场', kind: 'select', options: ['是', '否', '待勘'] },
    ],
  },
  item: {
    type: 'item',
    label: '物品',
    hint: '涉案财物、工具、载体',
    fields: [
      { key: '类别', label: '类别', kind: 'select', options: ['物证', '书证', '电子数据', '现金', '车辆', '其他'] },
      { key: '数量', label: '数量', kind: 'number' },
      { key: '持有人', label: '持有人', kind: 'text' },
      { key: '存放位置', label: '存放位置', kind: 'text', wide: true },
      { key: '是否扣押', label: '是否扣押', kind: 'select', options: ['已扣押', '未扣押', '待定'] },
    ],
  },
  event: {
    type: 'event',
    label: '事件',
    hint: '有明确时间点或时间段的关键行为',
    fields: [
      { key: '发生时刻', label: '发生时刻', kind: 'text', placeholder: '如 2026-09-03 20:10' },
      { key: '地点', label: '地点', kind: 'text' },
      { key: '经手人', label: '经手人', kind: 'text' },
      { key: '经过', label: '经过', kind: 'textarea', wide: true },
      { key: '结果', label: '结果', kind: 'text', wide: true },
      { key: '是否关键节点', label: '是否关键节点', kind: 'select', options: ['是', '否'] },
    ],
  },
  evidence: {
    type: 'evidence',
    label: '证据',
    hint: '物证、书证、证言、电子数据等证据材料',
    fields: [
      {
        key: '证据种类',
        label: '证据种类',
        kind: 'select',
        options: ['物证', '书证', '证人证言', '电子数据', '视听资料', '鉴定意见', '勘验笔录'],
      },
      { key: '来源', label: '来源', kind: 'text', placeholder: '如 工行常州分行调取' },
      { key: '物质号', label: '物质号', kind: 'text' },
      { key: '提取时间', label: '提取时间', kind: 'date' },
      { key: '提取人', label: '提取人', kind: 'text' },
      { key: '保管状态', label: '保管状态', kind: 'select', options: ['在库', '送检', '已返还', '待入库'] },
    ],
  },
  time: {
    type: 'time',
    label: '时间',
    hint: '时间点、时间段或时间约束',
    fields: [
      { key: '时间点', label: '时间点', kind: 'text', placeholder: '如 2026-09-05 14:30' },
      { key: '起始时间', label: '起始时间', kind: 'date' },
      { key: '结束时间', label: '结束时间', kind: 'date' },
      { key: '时区', label: '时区', kind: 'text', placeholder: '默认本机时区' },
      { key: '精确度', label: '精确度', kind: 'select', options: ['精确', '大致', '推测'] },
    ],
  },
  note: {
    type: 'note',
    label: '便签',
    hint: '待整理的线索、疑点、待办',
    fields: [
      { key: '内容', label: '内容', kind: 'textarea', wide: true },
      { key: '记录人', label: '记录人', kind: 'text' },
      { key: '来源', label: '来源', kind: 'text', placeholder: '如 走访、举报、内部研判' },
    ],
  },
};

export const NODE_TYPE_ORDER: NodeType[] = [
  'person',
  'org',
  'place',
  'item',
  'event',
  'evidence',
  'time',
  'note',
];

export function templateOf(type: NodeType): NodeTemplate {
  return NODE_TEMPLATES[type];
}

/** 按模板把字段值整理成展示数组（跳过空值），供节点卡片与属性面板复用。 */
export function fieldEntriesOf(
  type: NodeType,
  fields: Record<string, string | number | boolean>,
): Array<{ key: string; label: string; value: string }> {
  const template = NODE_TEMPLATES[type];
  const known = new Set(template.fields.map((field) => field.key));
  const fromTemplate = template.fields
    .map((field) => ({ key: field.key, label: field.label, value: fields[field.key] }))
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim().length > 0)
    .map((item) => ({ key: item.key, label: item.label, value: String(item.value) }));
  // 模板外的自定义字段照样展示，排在模板字段之后（规格要求「允许自定义字段」）
  const extras = Object.keys(fields)
    .filter((key) => !known.has(key))
    .filter((key) => {
      const value = fields[key];
      return value !== undefined && value !== null && String(value).trim().length > 0;
    })
    .map((key) => ({ key, label: key, value: String(fields[key]) }));
  return [...fromTemplate, ...extras];
}
