/**
 * 报告导出 Word（.docx）—— 手写最小 OOXML，不新增依赖。
 *
 * 为什么不用 docx 库：M6 只需要「带标题/正文/项目符号的中文报告」，
 * 一个 document.xml 就够；新增 1MB 依赖换排版能力不划算（决策 D41）。
 */
import { strToU8, zipSync } from 'fflate';
import { reportPlainLines } from '../lib/report';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text: string, options: { size: number; bold?: boolean; indent?: number; spaceAfter?: number }): string {
  const runProps =
    '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>' +
    (options.bold ? '<w:b/>' : '') +
    '<w:sz w:val="' + options.size + '"/><w:szCs w:val="' + options.size + '"/></w:rPr>';
  const pPr =
    '<w:pPr><w:spacing w:after="' + (options.spaceAfter ?? 100) + '" w:line="320" w:lineRule="auto"/>' +
    (options.indent ? '<w:ind w:left="' + options.indent + '"/>' : '') +
    '</w:pPr>';
  return '<w:p>' + pPr + '<w:r>' + runProps + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r></w:p>';
}

export function buildReportDocx(markdown: string, title: string): Uint8Array {
  const body: string[] = [];
  for (const row of reportPlainLines(markdown)) {
    if (row.kind === 'title') body.push(paragraph(row.text, { size: 36, bold: true, spaceAfter: 220 }));
    else if (row.kind === 'heading') body.push(paragraph(row.text, { size: 28, bold: true, spaceAfter: 140 }));
    else if (row.kind === 'bullet') body.push(paragraph('• ' + row.text, { size: 22, indent: 240 }));
    else body.push(paragraph(row.text, { size: 22 }));
  }

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + body.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>' + escapeXml(title) + '</dc:title>' +
    '<dc:creator>案情板 CaseBoard</dc:creator>' +
    '<cp:lastModifiedBy>案情板 CaseBoard</cp:lastModifiedBy>' +
    '</cp:coreProperties>';

  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      'docProps/core.xml': strToU8(core),
      'word/document.xml': strToU8(documentXml),
    },
    { level: 6 },
  );
}
