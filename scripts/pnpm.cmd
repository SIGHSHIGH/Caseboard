@echo off
rem CaseBoard package manager entry point.
rem This host has no npm on PATH, and the global pnpm shim fails with spawn EPERM
rem inside the sandbox, so load pnpm.cjs directly with node.
rem Usage: scripts\pnpm.cmd install | dev | build | add <pkg>
setlocal
set "PNPM_JS=E:\DSH\DSH Desktop\resources\app.asar.unpacked\node_modules\pnpm\bin\pnpm.cjs"
set "NODE_BIN=node"
where node >nul 2>nul || set "NODE_BIN=%APPDATA%\dsh-desktop\harness\.desktop-bin\node.cmd"
"%NODE_BIN%" "%PNPM_JS%" %*
