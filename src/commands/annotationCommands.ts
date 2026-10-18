/**
 * 标注命令（M2-5，Gate 0-2 唯一写入口）。
 * 标注挂在 Asset.annotations 上，随素材持久化；一条标注一次命令，可整体撤销。
 */
import type { Draft } from 'immer';
import type { Annotation, AnnotationGeom, CaseDoc } from '../types';
import { normalizeGeom } from '../lib/annotation';
import type { Command } from './types';

export interface AnnotationPatch {
  geom?: AnnotationGeom;
  text?: string | null;
  color?: string;
  linkedNodeId?: string | null;
}

function assetOf(draft: Draft<CaseDoc>, assetId: string): Draft<Annotation>[] | null {
  const asset = draft.assets.find((item) => item.id === assetId);
  return asset ? asset.annotations : null;
}

function findAnnotation(list: Draft<Annotation>[], annotationId: string): Draft<Annotation> | null {
  return list.find((item) => item.id === annotationId) ?? null;
}

export function addAnnotation(assetId: string, annotation: Annotation): Command {
  return {
    label: '新增标注',
    apply(draft) {
      const list = assetOf(draft, assetId);
      if (!list) return;
      if (list.some((item) => item.id === annotation.id)) return;
      list.push({
        id: annotation.id,
        shape: annotation.shape,
        geom: normalizeGeom(annotation.geom),
        color: annotation.color,
        ...(annotation.text ? { text: annotation.text } : {}),
        ...(annotation.linkedNodeId ? { linkedNodeId: annotation.linkedNodeId } : {}),
      });
    },
  };
}

export function updateAnnotation(assetId: string, annotationId: string, patch: AnnotationPatch): Command {
  return {
    label: '修改标注',
    apply(draft) {
      const list = assetOf(draft, assetId);
      const annotation = list ? findAnnotation(list, annotationId) : null;
      if (!annotation) return;
      if (patch.geom) annotation.geom = normalizeGeom(patch.geom);
      if (patch.text !== undefined) {
        const text = (patch.text ?? '').trim();
        if (text) annotation.text = text;
        else delete annotation.text;
      }
      if (patch.color !== undefined) annotation.color = patch.color;
      if (patch.linkedNodeId !== undefined) {
        if (patch.linkedNodeId) annotation.linkedNodeId = patch.linkedNodeId;
        else delete annotation.linkedNodeId;
      }
    },
  };
}

export function deleteAnnotation(assetId: string, annotationId: string): Command {
  return {
    label: '删除标注',
    apply(draft) {
      const list = assetOf(draft, assetId);
      if (!list) return;
      const index = list.findIndex((item) => item.id === annotationId);
      if (index >= 0) list.splice(index, 1);
    },
  };
}

/** 区域锚点关联节点；传 null 表示取消关联 */
export function linkAnnotation(assetId: string, annotationId: string, nodeId: string | null): Command {
  return updateAnnotation(assetId, annotationId, { linkedNodeId: nodeId });
}

export function clearAnnotations(assetId: string): Command {
  return {
    label: '清空标注',
    apply(draft) {
      const list = assetOf(draft, assetId);
      if (list) list.splice(0, list.length);
    },
  };
}
