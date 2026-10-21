import {
  HighlightStyle,
  LRLanguage,
  LanguageSupport,
  foldInside,
  foldNodeProp,
  indentNodeProp,
  syntaxHighlighting,
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { parser } from './generated/caseboard.parser';

/**
 * M3-4：把生成的 Lezer 解析器包装成 CodeMirror 语言（高亮 / 折叠 / 缩进 / 注释）。
 *
 * 为什么不用 StreamLanguage：折叠要按 Block 节点折，高亮要复用同一棵树；
 * 生成的 parser 与 parse.ts 用的是同一份语法，代码视图与模型解析永远不会出现两套语法（Gate 0-1）。
 */
const dslParser = parser.configure({
  props: [
    styleTags({
      QuotedString: t.string,
      'CaseHead/QuotedString': t.heading,
      Scalar: t.number,
      Arrow: t.operator,
      'Attr/Ident': t.propertyName,
      'FieldStatement/Ident': t.propertyName,
      'ObjectKey/Ident': t.propertyName,
      Ident: t.variableName,
      LineComment: t.lineComment,
      BlockComment: t.blockComment,
    }),
    foldNodeProp.add({ Block: foldInside }),
    indentNodeProp.add({ Block: (context) => context.baseIndent + 2 }),
  ],
});

export const caseboardLanguage = LRLanguage.define({
  name: 'caseboard',
  parser: dslParser,
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['{', '[', '('] },
    indentOnInput: /^\s*\}$/,
  },
});

/** 与画布同一套色板：中性深灰 + 证据红，不用任何 UI 库默认主题（Gate 0-6）。 */
export const caseboardHighlightStyle = HighlightStyle.define([
  { tag: t.heading, color: '#2B2B2B', fontWeight: '600' },
  { tag: [t.variableName, t.propertyName], color: '#2B2B2B' },
  { tag: t.string, color: '#2E7D64' },
  { tag: t.number, color: '#B5651D' },
  { tag: t.operator, color: '#C0392B', fontWeight: '600' },
  { tag: t.lineComment, color: '#8C8578', fontStyle: 'italic' },
  { tag: t.blockComment, color: '#8C8578', fontStyle: 'italic' },
  { tag: t.punctuation, color: '#6E6862' },
]);

export const caseboardLanguageSupport = new LanguageSupport(caseboardLanguage, [
  syntaxHighlighting(caseboardHighlightStyle),
]);
