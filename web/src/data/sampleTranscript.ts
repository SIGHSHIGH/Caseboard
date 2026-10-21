/**
 * M6 验收用样本笔录（虚构，不是真实案件）。
 *
 * 覆盖点：人名（被询问人 / 外号 / 年龄 / 认识句式）、机构、地点、绝对时间、
 * 转账（陈述 + 书证两种线型）、通话、证据行、手机号、银行账号、相对时间与代词。
 * 采纳率验收的参考答案见 SAMPLE_REFERENCE（6 实体 + 2 关系 = 8 项）。
 */
export const SAMPLE_TRANSCRIPT = `询问笔录（节选）

时间：2026年9月3日20时10分
地点：夜色KTV 三楼包间
询问人：王警官
被询问人：李梅（女，34岁，无业）

问：你认识张建国吗？
答：2026年8月，我在夜色KTV认识张建国（外号“三哥”），他自称做工程。
问：9月3日晚上发生了什么？
答：2026年9月3日20时10分，张建国在夜色KTV三楼包间给我一张银行卡，说里面有50万元，让我把钱转给恒信财务公司。
问：你转了吗？
答：9月4日上午，我按他的要求把卡里的钱转给恒信财务公司（50万元）。
答：他给我留了手机号13800138000，9月4日我们通过一次电话。
经查：李梅于2026年9月4日上午在建设银行柜台把50万元转到恒信财务公司账户。
证据：银行流水（户名李梅，2026年9月4日，转账500000元至恒信财务公司）
证据：通话记录（李梅 与 13800138000，2026年9月4日，通话1次）

补充：对方收款账号 6222 0202 0000 1234，开户行待查。
`;

export interface SampleReference {
  nodes: Array<{ type: 'person' | 'org' | 'place' | 'item' | 'event' | 'evidence' | 'time' | 'note'; title: string }>;
  edges: Array<{ sourceTitle: string; targetTitle: string; relType: string }>;
}

/** 人工答案：样本里必须被抽到的实体与关系（用于计算采纳率，≥70% 才算通过）。 */
export const SAMPLE_REFERENCE: SampleReference = {
  nodes: [
    { type: 'person', title: '李梅' },
    { type: 'person', title: '张建国' },
    { type: 'org', title: '恒信财务公司' },
    { type: 'place', title: '夜色KTV' },
    { type: 'evidence', title: '银行流水' },
    { type: 'evidence', title: '通话记录' },
  ],
  edges: [
    { sourceTitle: '李梅', targetTitle: '恒信财务公司', relType: '转账' },
    { sourceTitle: '李梅', targetTitle: '张建国', relType: '通话' },
  ],
};
