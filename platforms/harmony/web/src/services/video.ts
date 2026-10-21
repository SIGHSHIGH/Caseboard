/**
 * 视频抽帧（M2-5）：用 <video> + canvas 抽帧，无需 ffmpeg.wasm（D18）。
 * M4 若需要精确帧/编码信息，再换 ffmpeg-sidecar（D3），接口保持不变。
 */
import { extractedName } from '../lib/mediaPlan';

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export interface GrabbedFrame {
  time: number;
  width: number;
  height: number;
  blob: Blob;
  previewUrl: string;
}

export const VIDEO_ACCEPT = 'video/*';

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取该视频，可能是编码不受当前环境支持'));
    };
    video.onerror = fail;
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        fail();
        return;
      }
      resolve({ video, url });
    };
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.onseeked = null;
      reject(new Error(`跳到 ${time.toFixed(2)}s 超时`));
    }, 8000);
    video.onseeked = () => {
      window.clearTimeout(timer);
      video.onseeked = null;
      resolve();
    };
    video.currentTime = time;
  });
}

export async function probeVideo(file: File): Promise<VideoInfo> {
  const { video, url } = await loadVideo(file);
  try {
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 抽某一时刻的一帧；失败抛中文错误，由调用方汇总 */
export async function grabFrame(
  file: File,
  time: number,
  maxEdge = 1600,
): Promise<{ frame: GrabbedFrame; fileName: string }> {
  const { video, url } = await loadVideo(file);
  try {
    await seek(video, Math.min(time, Math.max(0, video.duration - 0.05)));
    const width = video.videoWidth;
    const height = video.videoHeight;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前环境无法创建画布，抽帧失败');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((item) => {
        if (item) resolve(item);
        else reject(new Error('抽帧编码失败'));
      }, 'image/png');
    });
    const seconds = Math.round(time * 100) / 100;
    return {
      frame: { time: seconds, width: canvas.width, height: canvas.height, blob, previewUrl: canvas.toDataURL('image/png') },
      fileName: extractedName(file.name, `${seconds.toFixed(2).replace('.', 's')}`),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 抽帧结果转成 File，直接交给既有导入流水线（哈希/缩略图/去重/向导全部复用） */
export async function grabFramesAsFiles(file: File, times: readonly number[], maxEdge = 1600): Promise<File[]> {
  const files: File[] = [];
  for (const time of times) {
    const { frame, fileName } = await grabFrame(file, time, maxEdge);
    files.push(new File([frame.blob], fileName, { type: 'image/png' }));
  }
  return files;
}
