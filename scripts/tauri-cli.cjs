// Tauri CLI 启动器：本机 node 是 Electron shim，process.argv[0] 指向 DSH Desktop.exe，
// 会让 @tauri-apps/cli 把 exe 路径当成子命令。这里先把 argv[0] 规范成 node 再转交。
process.argv[0] = 'node';
delete process.env.npm_execpath;
require('../node_modules/@tauri-apps/cli/tauri.js');
