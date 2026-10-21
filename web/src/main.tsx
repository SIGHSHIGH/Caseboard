import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './index.css';
import App from './App';
import { debugLog, getAppInfo } from './services/platform';
import { bootstrapDoc } from './store/docStore';
import { bootTheme } from './store/themeStore';

const container = document.getElementById('root');
if (!container) throw new Error('缺少 #root 挂载点');

const root = ReactDOM.createRoot(container);

// 首屏渲染前就把主题落到 <html data-theme>，避免闪一下默认浅色
bootTheme();

/**
 * 启动顺序：立即挂载界面（先用演示数据 / 本机缓存），再异步水合 SQLite；
 * 加载期间由 App 的 .cb-boot 遮罩挡住画布。
 * 桌面端带 --selftest 时，水合完成后直接跑 M4 自检并把报告写盘，由 Rust 侧退出进程。
 */
async function boot(): Promise<void> {
  await debugLog('boot: 脚本已执行');
  const app = await getAppInfo().catch((error: unknown) => {
    void debugLog('boot: app_info 失败 ' + String(error));
    return null;
  });
  await debugLog('boot: app_info=' + (app ? 'v' + app.version + ' selftest=' + app.selftest : 'null'));
  // M9（H3）：本机数据就是普通 SQLite，直接水合，没有解锁这一步
  try {
    await bootstrapDoc();
    await debugLog('boot: 水合完成');
  } catch (error) {
    console.error('[caseboard] 启动水合失败，改用演示文档', error);
    await debugLog('boot: 水合失败 ' + String(error));
  }
  if (!app?.selftest) return;
  try {
    await debugLog('boot: 开始自检');
    // 自检带着 pdf-lib / 导出链，按需加载：正常启动不为它付体积
    const { runSelftest } = await import('./services/selftest');
    await runSelftest();
  } catch (error) {
    console.error('[caseboard] 自检异常', error);
    await debugLog('boot: 自检异常 ' + String(error));
  }
}

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void boot();
