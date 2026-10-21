import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { parser } from './generated/caseboard.parser';

/** 实体的类型词（person/org/…）在语法里是普通 Ident，语义由 parse.ts 按文本判定。 */
const ENTITY_WORDS = new Set(['person', 'org', 'place', 'item', 'event', 'evidence', 'time', 'note', 'group', 'view']);

export const KEYWORD_CLASS = 'cb-tok-keyword';

/**
 * 把声明开头的类型词（person/group/view …）与 case 头关键字染成证据红系关键字色。
 * styleTags 只能按节点名匹配，而这些词是 Ident，只能按语法树的「第一个 Ident」做装饰。
 */
function buildKeywords(text: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges: Array<{ from: number; to: number }> = [];
  const tree = parser.parse(text);
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Declaration') {
        const ident = node.node.getChild('Ident');
        if (ident && ENTITY_WORDS.has(text.slice(ident.from, ident.to))) {
          ranges.push({ from: ident.from, to: ident.to });
        }
        return false;
      }
      if (node.name === 'CaseHead') {
        let child = node.node.firstChild;
        while (child) {
          if (child.name === '"case"' || child.name === '"caseNo"') ranges.push({ from: child.from, to: child.to });
          child = child.nextSibling;
        }
        return false;
      }
      return undefined;
    },
  });
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const range of ranges) builder.add(range.from, range.to, Decoration.mark({ class: KEYWORD_CLASS }));
  return builder.finish();
}

export const keywordHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildKeywords(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
      if (update.docChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = buildKeywords(update.state.doc.toString());
      }
    }
  },
  { decorations: (value) => value.decorations },
);
