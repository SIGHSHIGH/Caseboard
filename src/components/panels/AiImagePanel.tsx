/**
 * AI 生图面板（M7-4）：
 * - 四预设：模拟画像 / 现场示意 / 物品示意 / 图像增强；
 * - 预览后才写入画布，写入是「素材 + 图片节点」同一条可撤销命令；
 * - 角标由 src/services/aiImage.ts 写进像素，面板里没有关闭开关（Gate 0-5）。
 */
import { useMemo, useState } from 'react';
import { AI_PRESETS, defaultAiSeed, inspectAiPrompt, type AiImagePreset } from '../../lib/aiImage';
import {
  AI_IMAGE_PRIVACY,
  AI_IMAGE_PROVIDER_LABEL,
  commitAiImage,
  generateAiImage,
  loadAiImageSettings,
  normalizeAiImageSettings,
  saveAiImageSettings,
  type AiImageDraft,
  type AiImageProvider,
  type AiImageSettings,
} from '../../services/aiImage';
import { useDocStore } from '../../store/docStore';

interface AiImagePanelProps {
  onClose: () => void;
}

const PRESETS: AiImagePreset[] = ['sketch', 'scene', 'item', 'enhance'];
const PROVIDERS: AiImageProvider[] = ['builtin', 'comfyui', 'openai'];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function AiImagePanel({ onClose }: AiImagePanelProps) {
  const doc = useDocStore((s) => s.doc);
  const dispatch = useDocStore((s) => s.dispatch);
  const [settings, setSettings] = useState<AiImageSettings>(() => loadAiImageSettings());
  const [preset, setPreset] = useState<AiImagePreset>('sketch');
  const [subject, setSubject] = useState('身材偏瘦的中年男子，短发，穿深色夹克，面部特征从简');
  const [extra, setExtra] = useState('');
  const [seedText, setSeedText] = useState('');
  const [draft, setDraft] = useState<AiImageDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const guard = useMemo(() => inspectAiPrompt(subject + ' ' + extra), [subject, extra]);
  const meta = AI_PRESETS[preset];

  const update = (patch: Partial<AiImageSettings>) => {
    const next = normalizeAiImageSettings({ ...settings, ...patch });
    setSettings(next);
    saveAiImageSettings(next);
  };

  const handleGenerate = async () => {
    setError('');
    setNotice('');
    if (!guard.ok) {
      setError(guard.message);
      return;
    }
    setBusy(true);
    try {
      const parsedSeed = Number(seedText.trim());
      const seed = seedText.trim() && Number.isFinite(parsedSeed) ? Math.max(1, Math.round(parsedSeed)) : defaultAiSeed(subject);
      const result = await generateAiImage(
        { preset, subject: subject.trim(), extra: extra.trim() || undefined, seed },
        settings,
        { confirmCloud: settings.provider === 'openai' },
      );
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      setDraft(result);
      setNotice('预览已生成：角标已写进像素。确认无误后再插入画布。');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInsert = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const result = await commitAiImage(doc, draft);
      dispatch(result.command);
      setNotice('已插入画布：素材编号 ' + result.asset.no + '，位于 AI 生成图分区。撤销一次即可整体退回。');
      URL.revokeObjectURL(draft.previewUrl);
      setDraft(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    if (draft) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
    setNotice('已丢弃预览，没有写入任何数据。');
  };

  return (
    <div className="cb-modal cb-aiimg" role="dialog" aria-label="AI 生图">
      <div className="cb-aiimg__head">
        <div>
          <h2>AI 生图 · 仅示意</h2>
          <p className="cb-aiimg__sub">
            生成的图会写入像素级角标「AI 生成 · 模拟图」，素材进入 AI 分区，永不标记为已证实；禁止真实人脸换脸与冒充真人。
          </p>
        </div>
        <button type="button" className="cb-btn" onClick={onClose} disabled={busy}>关闭</button>
      </div>

      <div className="cb-aiimg__body">
        <section className="cb-aiimg__form">
          <div className="cb-aiimg__presets">
            {PRESETS.map((id) => (
              <button
                key={id}
                type="button"
                className={'cb-btn' + (preset === id ? ' is-active' : '')}
                onClick={() => setPreset(id)}
              >
                {AI_PRESETS[id].label}
              </button>
            ))}
          </div>
          <p className="cb-aiimg__desc">{meta.description}</p>
          <label className="cb-aiimg__field">
            <span>画面描述</span>
            <textarea
              className="cb-aiimg__input"
              rows={4}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="描述要画的对象与场景；不要写真实姓名、身份证号或要求换脸"
            />
          </label>
          <label className="cb-aiimg__field">
            <span>补充风格 / 构图（可留空）</span>
            <input value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="例如：俯视角，标注出入口与车辆位置" />
          </label>
          <label className="cb-aiimg__field cb-aiimg__seed">
            <span>随机种子（可复现）</span>
            <input
              value={seedText}
              inputMode="numeric"
              onChange={(event) => setSeedText(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder={String(defaultAiSeed(subject))}
            />
          </label>
          {!guard.ok ? <p className="cb-aiimg__blocked">{guard.message}</p> : null}
          <div className="cb-aiimg__ops">
            <button type="button" className="cb-btn cb-btn--primary" onClick={handleGenerate} disabled={busy}>
              {busy ? '生成中…' : '生成预览'}
            </button>
            {draft ? (
              <>
                <button type="button" className="cb-btn cb-btn--primary" onClick={handleInsert} disabled={busy}>
                  插入画布
                </button>
                <button type="button" className="cb-btn" onClick={handleDiscard} disabled={busy}>
                  丢弃预览
                </button>
              </>
            ) : null}
          </div>
          {error ? <p className="cb-aiimg__error">{error}</p> : null}
          {notice ? <p className="cb-aiimg__notice">{notice}</p> : null}

          <div className="cb-aiimg__settings">
            <h3>生成通道</h3>
            {PROVIDERS.map((id) => (
              <label key={id} className="cb-aiimg__provider">
                <input
                  type="radio"
                  name="ai-image-provider"
                  checked={settings.provider === id}
                  onChange={() => update({ provider: id })}
                />
                <span>
                  <strong>{AI_IMAGE_PROVIDER_LABEL[id]}</strong>
                  <em>{AI_IMAGE_PRIVACY[id]}</em>
                </span>
              </label>
            ))}
            {settings.provider === 'builtin' ? null : (
              <div className="cb-aiimg__grid">
                <label>
                  <span>{settings.provider === 'comfyui' ? 'ComfyUI 地址' : '接口地址'}</span>
                  <input value={settings.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} />
                </label>
                {settings.provider === 'comfyui' ? (
                  <label>
                    <span>模型文件</span>
                    <input value={settings.checkpoint} onChange={(event) => update({ checkpoint: event.target.value })} />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>模型</span>
                      <input value={settings.model} onChange={(event) => update({ model: event.target.value })} />
                    </label>
                    <label>
                      <span>API Key</span>
                      <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(event) => update({ apiKey: event.target.value })}
                      />
                    </label>
                  </>
                )}
              </div>
            )}
            {settings.provider === 'openai' ? (
              <label className="cb-aiimg__allow">
                <input
                  type="checkbox"
                  checked={settings.allowCloud}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    if (checked && !window.confirm('允许把画面描述发送到云端生图接口？描述里不要包含真实姓名与个人隐私。')) {
                      return;
                    }
                    update({ allowCloud: checked });
                  }}
                />
                <span>允许云端生图（每次生成仍需我确认）</span>
              </label>
            ) : null}
          </div>
        </section>

        <section className="cb-aiimg__preview">
          <h3>预览</h3>
          {draft ? (
            <>
              <img className="cb-aiimg__image" src={draft.previewUrl} alt="AI 模拟图预览" />
              <ul className="cb-aiimg__meta">
                <li>预设：{meta.label}</li>
                <li>通道：{AI_IMAGE_PROVIDER_LABEL[draft.provider]}</li>
                <li>尺寸：{draft.width} × {draft.height}</li>
                <li>种子：{draft.meta.seed}</li>
                <li>角标：{draft.meta.params?.watermark ? '已写入像素（不可关闭）' : '缺失'}</li>
              </ul>
              <details className="cb-aiimg__prompt">
                <summary>查看最终提示词（审计用）</summary>
                <p>{draft.meta.prompt}</p>
                <p className="cb-aiimg__negative">负向：{draft.meta.negativePrompt}</p>
              </details>
            </>
          ) : (
            <p className="cb-aiimg__empty">还没有预览。生成后这里会显示带角标的模拟图。</p>
          )}
        </section>
      </div>
    </div>
  );
}
