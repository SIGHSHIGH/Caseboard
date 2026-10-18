@echo off
rem 案情板 CaseBoard 包管理器入口。
rem 本机没有 npm；pnpm 的全局命令在沙箱内会 spawn EPERM，
rem 因此这里用 node 直接加载 app.asar.unpacked 中的 pnpm.cjs。
rem 用法：scripts\pnpm.cmd install | dev | build | add <pkg>
setlocal
set "PNPM_JS=E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs"
set "NODE_BIN=node"
where node >nul 2>nul || set "NODE_BIN=%APPDATA%\dsh-desktop\harness\.desktop-bin\node.cmd"
"%NODE_BIN%" "%PNPM_JS%" %*
