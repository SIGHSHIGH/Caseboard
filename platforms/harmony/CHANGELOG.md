## H4 · 手指命中与导出能力（2026-10-21）

- 连线透明命中带 18px → **34px**（触屏）；分组折叠/节点数 26 → 32px；图例按钮 36 → 40px。
- 连接点确认是 `isConnectable={false}` 装饰点（`pointer-events:none`），不做放大，避免把连线端点顶出卡片边缘。
- `saveBytes` 不再硬编码 `application/octet-stream`：按扩展名推断 MIME，导出 PNG 现在以 `image/png` 落盘，系统面板显示「PNG 图片」。
- 新增 `scripts/accept-h4.ps1`（7 条：命中体检 4 条 + 导出面板 + 导出落盘 + CSS 断言），**7/7 全 PASS**；`docs/H4-TOUCH-EXPORT.md` 记录结论、坑与 OCR 模拟器限制。
- OCR：链路全通但 `canIUse` 返 false、`recognizeText` 报 `1001400001`/`200` → **x86 模拟器跑不了 HMS AI 引擎，只能真机验收**。
# 鍙樻洿璁板綍 路 楦胯挋绉绘

## H3 路 瑙︽帶鎵嬪娍灞傦紙2026-10-21锛?
缁撹锛氶暱鎸夎彍鍗曘€佸弻鎸囩缉鏀俱€佸崟鎸囧钩绉?*鏈潵灏遍€?*锛圓rkWeb 鎶婇暱鎸夋槧灏勬垚 `contextmenu`锛宒3-zoom 鎺ヤ綇鍙屾寚锛夛紝
鐪熸瑕佸啓鐨勫彧鏈夈€屾澗鎵嬪悗缁х画婊戜竴娈点€嶇殑鎵嬫劅銆傛墍浠ヨ繖涓€杞彧鍔犱簡涓€涓姛鑳姐€佷笁鏉￠獙鏀躲€?
### 楦胯挋渚?
- **`web/src/components/flow/Board.tsx`**锛氭柊澧炴嫋鎷芥儻鎬с€傛寕鍦?`<ReactFlow>` 鐨?  `onMoveStart` / `onMove` / `onMoveEnd` 涓婏紝鍙湪 `data-input='touch'` 鏃跺惎鐢紙榧犳爣淇濇寔鍘熸牱锛夈€?  閫熷害鍙栨渶杩?120ms 鏍锋湰锛屼笂闄?3.2 px/ms銆佷笅闄?0.12 px/ms锛岃“鍑忕敤鎸囨暟绉垎
  `浣嶇Щ = v路蟿路(1鈭抏^(鈭捨攖/蟿))`锛埾?190ms锛夛紝甯х巼楂樹綆涓嶅奖鍝嶆粦琛岃窛绂汇€?  鐢?`appliedRef` 鍖哄垎銆岀敤鎴峰垝鐨勩€嶅拰銆宻etViewport 鑷繁鎺ㄧ殑銆嶏紝鍚﹀垯绗竴甯у氨鎶婃儻鎬у仠鎺夈€?- **`entry/src/main/ets/pages/Index.ets`**锛氭帰閽堟柊澧炰笁涓?phase 涓庝袱缁勬墦鐐光€斺€?  `phase=5` 鍚堟垚鍙屾寚 `TouchEvent` 娴嬬缉鏀俱€乣phase=6` 鍚堟垚鍗曟寚蹇垝娴嬫儻鎬с€乣phase=8` 渚涚湡瀹為暱鎸夌敤锛?  甯搁┗ `MutationObserver` 鎵?`[ctx] open/close`锛屽彟鍔?`[rect]` 鎶婅妭鐐瑰睆骞曠煩褰㈡姤缁欒剼鏈紙闀挎寜鍧愭爣涓嶈兘鍐欐锛夈€?  椤舵爮銆屸嫰銆嶉偅娈电殑鐪熺偣鍑绘敹绐勫埌 `phase=1/3`锛屽惁鍒欏脊鍑虹殑銆孉I 鐢熷浘銆嶅璇濇浼氭尅浣忛暱鎸夈€?- **`scripts/accept-h1.ps1`**锛氭柊澧?H1-19 鍙屾寚缂╂斁 / H1-20 鎷栨嫿鎯€?/ H1-21 闀挎寜鑿滃崟锛?  `Get-CbLog` 鏀寔 `-MidAction`锛堝惎鍔ㄥ悗鐢辫剼鏈湡鍘婚暱鎸夛級銆傛€绘鏌ユ暟 18 鈫?**21 鏉?*锛?  瀹炴祴 **21/21 鍏?PASS**锛孒AP `3,909,562B`锛宍consoleError=0 webError=0`銆?- 鏂板 `docs/H3-GESTURES.md`锛氬疄鐜拌鐐广€佷笁鏉￠獙鏀躲€佽俯杩囩殑涓変釜鍧戯紙uitest 鏃?pinch / 鍧愭爣涓嶈兘鍐欐 / 瀵硅瘽妗嗘尅闀挎寜锛夈€?
### 涓変釜鍧戯紙鐣欐。锛?
1. `uitest uiInput` 娌℃湁澶氭寚鎵嬪娍锛屽弻鎸囧彧鑳介潬 `runJavaScript` 鍚堟垚 `TouchEvent`銆?2. 瑙嗗浘骞崇Щ浼氳鎸佷箙鍖栵紝闀挎寜鍧愭爣蹇呴』鎸夋帰閽堟姤鐨勫疄鏃剁煩褰㈢畻锛涚涓€涓妭鐐瑰父鏄垎缁勭煩褰紝闀挎寜涓嶅脊鑺傜偣鑿滃崟銆?3. 鍙屾寚钀界偣蹇呴』鎸?pane 鑷韩鐭╁舰绠椻€斺€旂獎妗ｄ笅鍙虫爮鏄诞灞傦紝钀藉湪娴眰涓婄殑閭ｄ竴鎸?d3-zoom 涓嶈銆?
## H2.1 路 渚ф爮寮€鍏虫敼鍦嗗舰鎸夐挳 + 妗岄潰鐗堝洖濉紙2026-10-21锛?
### 楦胯挋渚?
- **`web/src/styles/responsive.css`**锛歚.cb-collapse` 浠庛€屼袱鏍忎箣闂?16px 绔栧悜鎶樺彔鏉★紙瑙︽帶 36px锛夈€?  鏀规垚娴湪绐楀彛宸﹀彸涓嬭鐨?**44脳44 鍦嗗舰鎸夐挳**锛坄position: fixed; bottom: 12px`锛屽乏 `left: 12px` / 鍙?`right: 12px`锛?  `z-index: 40` 鍘嬪湪鎶藉眽涓庨伄缃╀箣涓婏級銆傝劚娴佷箣鍚庣敾甯冨搴?**888 鈫?920**锛?440 鈭?208 宸︽爮 鈭?312 鍙虫爮锛夛紝
  鎸夐挳鏈韩涔熻揪鍒?44脳44 鐨勮Е鎺ф渶灏忓懡涓昂瀵搞€?- **`web/src/index.css`**锛歚.cb-btn` 琛?`flex-shrink: 0`锛堜笌妗岄潰鐗堝悓姝ワ紝瑙佷笅锛夈€?- **`entry/src/main/ets/pages/Index.ets`**锛氭帰閽堟柊澧?`[toggle]` 鎵撶偣锛坄left`/`right` 鍧愭爣銆乣size`銆乣fixed`銆乣inner`銆乣canvas`锛夈€?- **`scripts/accept-h1.ps1`**锛氭柊澧?H1-18銆屼晶鏍忓紑鍏充负宸﹀彸涓嬭鍦嗗舰鎸夐挳锛?4px銆佽劚娴併€佽繕鍥炵敾甯冨搴︼級銆嶏紝
  鎬绘鏌ユ暟 17 鈫?**18 鏉?*銆備笂鏈哄疄娴嬶細`fixed=True size=44x44 leftX=12 rightGap=12 canvas=920`锛?*18/18 鍏?PASS**銆?- `docs/H1-TABLET.md` 鏂板 搂涔濊褰曡繖娆℃敼鍔ㄤ笌銆屼负浠€涔堜笉鏄?16px 闀挎潯銆嶇殑鐞嗙敱銆?
### 妗岄潰渚э紙鍥炲～鍒?`main`锛屽啀 cherry-pick 鍥?`harmony`锛?
鍚屼竴杞鎶楀鏌ュ湪妗岄潰鐗堝彂鐜颁袱澶勫悓婧愮己闄凤紝宸插湪 `main` 涓婁慨澶嶅苟鎺ㄩ€侊紙鎻愪氦 `774fa62`锛夛細

1. `src/components/panels/TopBar.tsx`锛氶绠楁墸闄ゅ父椹诲厓绱狅紙銆屸嫰銆嶆寜閽?+ 淇濆瓨鐘舵€佹枃瀛楋級瀹炴祴瀹藉害锛?   婧㈠嚭鍒ゅ畾琛ャ€岄涓瓙鍏冪礌宸﹁竟鐣屾槸鍚﹁秺鐣屻€嶁€斺€擿.cb-topbar__io` 鏄?`justify-content: flex-end`锛?   婧㈠嚭鏃跺唴瀹瑰線宸﹁窇锛宍scrollWidth` 鍙粺璁″彸渚э紝鏃у垽瀹氬瀹冩案杩滆繑鍥炪€屾病瓒呫€嶃€?2. `src/index.css`锛歚.cb-btn` 琛?`flex-shrink: 0`锛岄《鏍忔尋涓嶄笅鏃舵妸鎸夐挳鏀惰繘銆屸嫰銆嶈彍鍗曡€屼笉鏄帇鎵佽瀛椼€?
妗岄潰楠屾敹锛歚typecheck` 0 error銆乣smoke` 871 PASS銆乣ui-smoke` 430 PASS / 0 FAIL銆乣build` 鎴愬姛銆?
## 浠撳簱杩佺Щ 路 骞跺叆妗岄潰浠撳簱 `harmony` 鍒嗘敮锛?026-10-21锛?
楦胯挋宸ョ▼浠庣嫭绔嬩粨搴?`masaike board hamonyos/` 杩佸埌涓讳粨搴?`platforms/harmony/`锛?鍒嗘敮 `harmony`锛孒0鈥揌2 鐨?4 涓彁浜ゅ巻鍙插畬鏁翠繚鐣欙紙`git read-tree --prefix` 瀚佹帴锛屾湭鏀瑰啓浠讳綍鎻愪氦锛夈€?
杩佺Щ鍚庡仛銆屽共鍑€ clone 澶嶅師楠岃瘉銆嶏紝鏆撮湶骞朵慨鎺?4 涓彧鍦ㄦ崲璺緞/鎹㈡満鍣ㄦ椂鎵嶄細鍑虹幇鐨勯棶棰橈細

1. **鑴氭湰鍐欐鏈満璺緞**锛坄D:\DevEco Studio`銆佹煇涓?`pnpm.cjs` 缁濆璺緞锛夆啋 鎶藉嚭 `scripts/_env.ps1`锛?   浼樺厛绾э細鏄惧紡鍙傛暟 > 鐜鍙橀噺锛坄DEVECO_HOME` / `NODE_HOME` / `HDC` / `PNPM_CLI` / `PNPM_STORE_DIR`锛?   > 甯歌瀹夎浣嶇疆 > `PATH`銆傛崲鏈哄櫒鍙渶璁句竴涓?`DEVECO_HOME`銆?2. **`$home` 鏄?Windows PowerShell 鍙鑷姩鍙橀噺**銆俙_env.ps1` 绗竴鐗?`$home = ...` 浼氭姏
   `Cannot overwrite variable HOME`锛岃€?dot-source 鐨勯敊璇?*涓嶄腑鏂剼鏈?*锛屽彧璁╁悗缁矾寰勫叏鍙?`$null`锛?   鐥囩姸鏄竴杩炰覆 `BadExpression: The expression after '&' ... was not valid`锛堢湅鐫€鍍忚娉曢敊锛屽叾瀹炴槸鍙橀噺娌¤祴涓婏級銆?   鏀瑰悕 `$devEcoRoot`銆傛暀璁細鏀瑰畬 .ps1 蹇呴』鐪熻窇涓€閬嶉獙鏀讹紝璇硶閫氳繃涓嶇畻鏁般€?3. **鍏ㄦ柊 clone 鏃?`web/.tmp` 涓嶅瓨鍦?*锛宲npm 鍐呴儴鐨?tempy 瑕佹眰 TMP 鐩綍宸插瓨鍦紝鍚﹀垯
   `ENOENT lstat '...\web\.tmp'` 鐩存帴鎵撴柇鏋勫缓 鈫?`build-web.ps1` 鍏堝缓鐩綍鍐嶈 `TMP`銆?4. **`postbuild-rawfile.mjs` 鍐欐姤鍛婂墠娌″缓鐩綍**锛宍.tmp-esbuild/` 琚?`.gitignore` 蹇界暐锛?   鍏ㄦ柊 clone 閲屼笉瀛樺湪 鈫?`mkdirSync(recursive)` 鍚庡啀鍐欍€?
楠岃瘉缁撴灉锛氭妸 `harmony` 鍒嗘敮 clone 鍒板伐浣滃尯澶栵紝`build-web.ps1` 浠庨浂瑁呬緷璧?鈫?浜х墿 14 鏂囦欢 3.49MB銆?`problems` 涓虹┖锛沗accept-h1.ps1 -SkipWeb` 鈫?**15/15 鍏?PASS**锛圚1-1/2/3 鍥犺烦杩囧墠绔瀯寤鸿€屼笉璁★級銆?涓诲伐浣滃尯 `platforms/harmony` 涓嬪彟璺戝畬鏁?`accept-h1.ps1` 鈫?**17/17 鍏?PASS**銆?
鏂板 `platforms/harmony/README.md`锛堟灦鏋勩€佷笁涓繀椤荤煡閬撶殑纭粨璁恒€佹瀯寤洪獙鏀躲€佸凡鐭ラ檺鍒躲€佷笌妗岄潰鐗堝叧绯伙級銆?
## H2 路 椤舵爮鏀跺锛?026-10-21锛?
**鐩爣**锛氫慨鎺?H1 閬楃暀鐨勩€屼富棰樎烽粯璁ゃ€嶅湪 1440 琚乏杈圭紭瑁佸垏锛岃椤舵爮鏀跺瀵?*鎵€鏈?*鍔ㄤ綔缁熶竴鐢熸晥銆?楠屾敹鑴氭湰鎵╁埌 17 鏉★紝鍏?PASS銆?
### 淇敼

- **`web/src/components/panels/TopBar.tsx`**锛?  - 鏂板 `staticWidth` 鐘舵€侊細鐢?`saveRef`锛堜繚瀛樼姸鎬佹枃瀛楋級涓?`moreRef`锛堛€屸嫰銆嶆寜閽級瀹炴祴甯搁┗鍏冪礌瀹藉害锛?    婧㈠嚭棰勭畻浠?`ioWidth` 鏀规垚 `ioWidth 鈭?staticWidth`銆傚師鏉ヨ繖涓や釜鍏冪礌鍚冨搴﹀嵈涓嶅湪
    `planTopbarOverflow` 鐨勮处鏈噷锛岄绠楄櫄楂樼害 190px銆?  - 婧㈠嚭鍒ゅ畾澧炲姞銆岄涓瓙鍏冪礌宸﹁竟鐣?< 瀹瑰櫒宸﹁竟鐣屻€嶏細`.cb-topbar__io` 鏄?`justify-content: flex-end`锛?    婧㈠嚭寰€宸﹁窇锛宍scrollWidth` 鍙粺璁″彸渚ф孩鍑猴紝鏃у垽瀹氬杩欑鎯呭喌姘歌繙杩斿洖銆屾病瓒呫€嶃€?- **`web/src/styles/responsive.css`**锛歚鈮?560px` 闅愯棌 `.cb-topbar__save`锛堛€孲QLite 路 宸蹭繚瀛?hh:mm銆嶏級銆?  瀹冩槸鐘舵€佹彁绀轰笉鏄搷浣滐紝鍙虫爮銆屾浠舵瑙?路 鏈€鍚庝繚瀛樸€嶆湁瀹屾暣鏃堕棿锛屼繚瀛樻垚鍔熶篃寮圭‘璁ゆ锛?  鐪佷笅鐨?~150px 璁┿€孉I 鍔╂墜銆嶅洖鍒伴《鏍忋€?- **`entry/src/main/ets/pages/Index.ets`**锛氭帰閽堟柊澧?`[clip]`锛坥nPageEnd 棣栧抚锛夈€乣[clip2]`锛?000ms 绋虫€侊級銆?  `[more]`锛堢偣寮€銆屸嫰銆嶆暟鏉＄洰锛夈€乣[moreclick]`/`[moreclick2]`锛堣彍鍗曢噷鐐广€岀敓鍥俱€嶉獙璇佺湡鐢熸晥锛夈€?- **`scripts/accept-h1.ps1`**锛氭帰閽堥噰闆嗘敼涓恒€岀瓑澶?26s 涓€娆℃姄榻愩€嶏紙鏃х増鎶撳埌浜嗗氨杩斿洖锛屼細婕忔帀鍚庨潰鐨勫欢鏃舵墦鐐癸級锛?  鏂板 H1-14鈥1-17銆?
### 鍏抽敭缁撹锛堝鎶楀鏌ユ帹缈讳簡鑷繁鐨勫亣璁撅級

1. **鏍瑰洜涓嶆槸銆屼簲涓墜宸ユ帶浠剁粫寮€绠楁硶銆?*銆俙.cb-topbar__tools` 閲屽彧鏈夋挙閿€/閲嶅仛涓や釜鍥炬爣鎸夐挳锛?   涓婚/鑳屾櫙/鎼滅储鏈潵灏卞湪 `actions` 鍒楄〃閲屻€傜湡姝ｅ師鍥犺涓婇潰涓ゆ潯锛歚flex-end` 閫犳垚鐨勫乏渚ф孩鍑轰笉鍙娴?   锛嬪父椹诲厓绱犲悆鎺夌殑瀹藉害娌¤繘棰勭畻銆?2. **鏀跺鏄笎杩涙敹鏁涚殑**锛堟瘡杞敹涓€涓級锛宱nPageEnd 棣栧抚蹇呯劧杩樿兘閲忓埌 5 涓瑁佺殑鎸夐挳銆?   楠屾敹蹇呴』鏂█ `[clip2]`锛?s锛夎€屼笉鏄?`[clip]`鈥斺€斿惁鍒欎細鎶婃甯告敹鏁涜鍒ゆ垚鍥炲綊銆?3. 绋虫€佸疄娴嬶細1440 `inline=9 / clipped=0`銆併€屸嫰銆? 椤癸紱1000 `inline=5 / clipped=0`銆併€屸嫰銆?0 椤广€?
## H1.1 路 鍙仛妯睆 + 绔栧睆/灏忕獥鎻愮ず灞傦紙2026-10-21锛?
**鍐崇瓥**锛氭湰浜у搧**鍙敮鎸佹í灞?*锛屽彇娑堢珫灞忛€傞厤銆傛鎯呮澘鏄í鍚戜俊鎭瘑搴﹀伐鍏凤紝绔栧睆涓嬬敾甯?鏃堕棿绾?宸﹀彸鏍忛兘鎽婁笉寮€锛?鍋氱珫灞忕瓑浜庢妸銆屽媺寮鸿兘鐢ㄣ€嶄吉瑁呮垚銆岄€傞厤瀹屾垚銆嶃€俙scripts/accept-h1.ps1` 13 鏉℃鏌ュ叏 PASS銆?
### 鏂板

- **`web/src/lib/viewport.ts`**锛歚USABLE_MIN_WIDTH = 900` 涓?`shouldGateLayout(width, height)`
  鈥斺€?`height > width`锛堢珫灞忥級鎴?`width < 900`锛堝皬绐?鍒嗗睆/鍗婃姌锛夋椂杩斿洖 true锛岀函鍑芥暟鍙柇瑷€銆?- **`web/src/components/OrientationGate.tsx`**锛歚_(:蟹銆嶁垹)_` + 銆岃妯睆浣跨敤銆嶆彁绀哄眰锛?  涓嶉€忔槑閬尅锛坄z-index: 9000`锛夛紝**搴曚笅鐣岄潰涓嶅嵏杞?*浠ヤ繚浣?React Flow 瑙嗗彛鐘舵€侊紝杞洖妯睆绔嬪埢鎭㈠銆?- **`web/src/styles/responsive.css`**锛歚.cb-gate` 涓?`card/face/title/text/meta/hint` 鍏ㄥ锛?  棰滄枃瀛楀彇璇佹嵁绾?`#C0392B`锛屼笉寮曞叆鏂拌壊鏉裤€?- **`entry/src/main/module.json5`**锛歚abilities[0].orientation: "landscape"` 寮哄埗妯睆銆?- **`Index.ets`**锛氶獙鏀舵帰閽堟寜 phase 閫犵湡瀹炶鍙ｏ紙1/2 鍏ㄥ銆? 绐勬。 1000vp銆? 绔栧睆 700vp锛夛紝
  鏂板 `[gate]`锛?400ms锛変笌 `[gate2]`锛?600ms锛夊欢鏃舵墦鐐广€?- **`scripts/accept-h1.ps1`**锛氭柊澧?H1-11锛堟í灞忎笉寮瑰眰锛夈€丠1-12锛?00脳893 寮瑰眰锛夈€丠1-13锛堟枃妗堝凡鎵撳寘锛夈€?
### 鍏抽敭缁撹

1. **鎻愮ず灞備笉鑳藉湪 `onPageEnd` 绔嬪埢鏂█**锛氶甯ф祴閲忚繕鏄?1440 鐨勮繃娓″€硷紝鍒嗘。瑕佽繛缁袱涓悓鏍锋湰鎵嶇敓鏁堬紝
   瀹炴祴绾?1s 鍚庢墠绋冲畾鈥斺€旀帰閽堝繀椤诲欢鏃舵墦鐐广€?2. **妯℃嫙鍣ㄤ細琚悗鍙颁换鍔¤繛甯︽潃鎺?*锛氬繀椤?`Start-Process -ArgumentList '<鍗曚釜瀛楃涓?'` 鑴辩寮忓惎鍔?   锛堜紶鏁扮粍浼氭寜绌烘牸鎷嗗弬锛夛紱璁稿彲鍗忚杩樹細鍛ㄦ湡鎬ч噸缃紝闇€鍏?`Emulator.exe -license accept`銆?3. `700脳893` 鍚屾椂鍛戒腑銆岀珫灞忋€嶄笌銆屽搴︿笉瓒炽€嶄袱鏉¤鍒欙紝璇ヨ澶囦笂鏃犳硶鍗曠嫭鏋勯€犲崟涓€瑙勫垯鐢ㄤ緥銆?
## H1 路 骞虫澘褰㈡€侀€傞厤楠屾敹閫氳繃锛?026-10-21锛?
**鐩爣**锛氬悓涓€濂楀墠绔湪 MatePad Pro 13锛?440脳893 CSS px / dpr=2锛変笂鎵嬫寚鍙敤锛屾闈㈠姛鑳戒笉鍑忥紝
鍏潯纭害鏉熶笉鍔ㄣ€俙scripts/accept-h1.ps1` 10 鏉℃鏌ュ叏 PASS銆?
### 鏂板

- **`web/src/lib/viewport.ts`**锛氱函閫昏緫鍒嗘。锛坄classifyViewport` / `defaultPanelState` /
  `panelIsDrawer` / `shouldResetPanels`锛夛紝闃堝€?`wide 鈮?1180`銆乣medium 鈮?900`銆?- **`web/src/styles/responsive.css`**锛氬湪 `index.css` 涔嬪悗鍔犺浇鐨勫閲忚鐩栧眰锛堜笉鍔?5367 琛屽ぇ鏂囦欢锛夈€?  瑙︽帶浠ょ墝 `--cb-control-h` 28鈫?0px銆乣--cb-control-h-sm` 22鈫?6px銆乣--cb-control-pad` 8鈫?2px锛?  鎶樺彔鏉?16鈫?6px銆佽鍥鹃〉绛?36px銆佺敾甯冪缉鏀?26鈫?0px锛涚獎妗ｅ彸鏍忓彉璐磋竟鎶藉眽 + `.cb-scrim` 閬僵銆?- **`web/src/main.tsx`**锛氭寜 `matchMedia('(pointer: coarse)') || maxTouchPoints > 0` 鎵?  `<html data-input="touch">`銆?- **`web/src/App.tsx`**锛歚tier` 鐘舵€?+ `data-tier` 灞炴€э紱鎶藉眽妯″紡涓庨伄缃╂覆鏌擄紱鍚姩绔炴€佷慨澶?  锛堜袱娆″悓妗ｇ‘璁?+ 150/600ms 琛ユ祴 + `window.resize`锛夈€?- **`scripts/accept-h1.ps1`**锛圚1-1鈥1-10锛岃緭鍑?`.tmp-esbuild/accept-h1.json`锛夈€?- **`docs/H1-TABLET.md`**锛堝垎妗ｆā鍨嬨€佷护鐗岃〃銆佷笂鏈烘墜娉曘€侀仐鐣欙級銆?*`docs/REPO-STRATEGY.md`**
  锛堟闈㈢増涓庨缚钂欑増鐨勪粨搴撶鐞嗗缓璁級銆?
### 淇敼

- **`web/src/components/panels/TopBar.tsx`**锛歚鈮?560px` 鏀剁揣 gap 涓庢浠跺悕瀹藉害锛宍鈮?280px` 闅愯棌妗堜欢缂栧彿銆?
### 鍏抽敭缁撹

1. **骞虫澘 ArkWeb 鎶?`maxTouchPoints === 0` 浣?`(pointer: coarse) === true`** 鈥斺€?鍙垽鏂墠鑰呬細璁?   鏁村瑙︽帶鏍峰紡闈欓粯澶辨晥锛堥鐗堝疄娴?`small=16`锛夛紝蹇呴』鐢ㄣ€屾垨銆嶃€?2. **鍚姩绔炴€佹槸鐪熷疄鍥炲綊**锛氱敤 `.cb-app` 鐨?`clientWidth` 鍒嗘。浼氳鍒伴甯т腑闂村€兼妸鍙虫爮璇敹璧凤紝
   涓斾箣鍚庝笉浼氳嚜鍔ㄥ脊鍥炪€傛敼鐢?`documentElement.clientWidth` + 涓ゆ鍚屾。纭銆?3. **妯℃嫙鍣ㄦ棤娉曟敼鏈濆悜**锛岀獎妗ｆ敼鐢?ArkUI 渚?`.width('1000vp')` 寰楀埌鐪熷疄瑙嗗彛鍙樺寲鏉ユ祴銆?4. 鍛戒腑鍖烘敹鏁?16 鈫?12 鈫?5 鈫?0锛涚敾甯冨唴琚?React Flow 缂╂斁鐨勬帶浠跺崟鍒?`canvasMarks`锛屼笉璁″叆銆?
### 宸茬煡閬楃暀

- 瑙︽帶鏀惧ぇ鍚庛€屼富棰樎烽粯璁ゃ€嶆寜閽湪 1440 琚乏杈圭紭瑁佹帀锛歚.cb-topbar__io` 鐢?`justify-content: flex-end`锛?  鍐呭鍚戝乏婧㈠嚭鑰?`scrollWidth` 涓嶇粺璁″乏渚ф孩鍑猴紝鏃㈡湁婧㈠嚭绠楁硶鍥犳涓嶆妸鎸夐挳鏀惰繘銆屸嫰銆嶃€?  淇硶锛濇妸 鎾ら攢/閲嶅仛/涓婚/鑳屾櫙/鎼滅储 骞跺叆 `actions` 鍒楄〃锛屾帓 H2/H3銆?- 瑙?`docs/H1-TABLET.md` 搂6 涓?`docs/H0-ACCEPTANCE.md` 搂7銆?
## H0 路 鐜涓庨鏋堕獙鏀堕€氳繃锛?026-10-21锛?
**鐩爣**锛氬湪杩欏彴鏈哄櫒涓婃妸妗岄潰銆屾鎯呮澘 CaseBoard銆嶇殑鍓嶇璺戣繘楦胯挋 ArkWeb锛屽苟璇佹槑
SQLite / 鏂囦欢 / 妗ヤ笁鏉￠€氳矾鍙敤銆傚叓鏉￠獙鏀舵爣鍑嗗叏閮?PASS锛屼竴鏉″懡浠ゅ彲澶嶇幇銆?
### 鏂板

- **楦胯挋宸ョ▼楠ㄦ灦**锛圫tage 妯″瀷锛孉PI 26锛夛細`AppScope/`銆乣entry/`銆乣build-profile.json5`銆?  `hvigorfile.ts`銆乣oh-package.json5`銆俠undleName `com.caseboard.harmony`锛?  deviceTypes `tablet / 2in1 / phone`锛?*鏈敵璇?`ohos.permission.INTERNET`**锛堟湰鍦颁紭鍏堬級銆?- **鑷畾涔?scheme 鍔犺浇鍣?* `entry/src/main/ets/bridge/RawfileScheme.ets`锛?  `caseboard://rawfile/*` 鈫?`$rawfile`锛屽搷搴斿ご鑷甫 `Access-Control-Allow-Origin: *`銆?  鏇夸唬涓嶅彲鐢ㄧ殑 `resource://`锛坥paque origin 浼氭墦姝?ESM 涓?Worker锛夈€?- **鍘熺敓妗?* `entry/src/main/ets/bridge/CaseBoardBridge.ets`锛?5 涓柟娉曪紝鍏ㄩ儴娉ㄥ唽杩?  `asyncMethodList`锛?*缁熶竴銆屽弬鏁版湯浣嶆敹 JS 鍥炶皟 + `{"ok",鈥` 淇″皝銆嶅绾?*銆?- **鍏釜鍘熺敓 service**锛歚Platform / Db / File / Clipboard / Ocr / Image`銆?  - `DbService` 鍐呯疆妗岄潰鐗?`V1_SQL`锛? 琛?+ 4 绱㈠紩锛変笌 `FTS5_SQL`锛?*FTS5 瀹炴祴鍙敤**銆?  - `OcrService` 璧?`@hms.ai.ocr.textRecognition`锛圕ore Vision Kit锛夛紝`canIUse` 瀹堝崼锛?    褰诲簳鏀惧純 Tesseract锛堢渷 16MB锛宍public/ocr/` 涓嶈繘鍖咃級銆?- **鍓嶇闀滃儚宸ョ▼** `web/`锛氭闈?`src/` 鐨勫壇鏈?+ 涓夌紳鏀归€狅紱妗岄潰浠撳簱闆舵敼鍔ㄣ€?  - `vite.config.ts`锛歚base:'./'`銆乣outDir` 鐩存寚 `rawfile`銆?  - `scripts/postbuild-rawfile.mjs`锛氭柇瑷€鐩稿璺緞銆?*鍓ユ帀 `crossorigin`**銆佽緭鍑?JSON 鎶ュ憡銆?  - `src/services/harmony.ts`锛氬敮涓€鐨勬ˉ瀹㈡埛绔紝鎶婂洖璋冨紡鍘熺敓璋冪敤鍖呭洖 Promise銆?  - `src/services/db/harmony.ts`銆佷互鍙?`platform.ts` / `file.ts` / `ocr.ts` 鐨勪笁璺垎鍙戞敼閫犮€?- **楠屾敹鑴氭湰**锛歚scripts/build-web.ps1`銆乣scripts/accept-h0.ps1`锛圓1鈥揂4 / B1鈥揃4 鈫?JSON锛夈€?- **鏂囨。** `docs/H0-ACCEPTANCE.md`锛氱幆澧冪煩闃点€佹ˉ濂戠害銆佽俯鍧戞竻鍗曘€侀仐鐣欓」銆?
### 鎷嗛櫎

- `web/src/services/ocrBuiltin.ts`锛堝敮涓€渚濊禆 `tesseract.js` 鐨勬枃浠讹級銆?- `web/` 鐨?`tesseract.js` 涓?`@tesseract.js-data/*` 渚濊禆銆?
### 鍏抽敭缁撹

1. **ArkWeb `asyncMethodList` 涓嶈繑鍥?ArkTS 鐨勮繑鍥炲€?*锛氶〉闈㈣皟鐢ㄥ緱鍒?`0`锛堝彈鐞嗙爜锛夛紝
   缁撴灉鍙兘閫氳繃**椤甸潰浼犲叆鐨勫洖璋?*鍥炰紶銆傝繖鏉℃帹缈讳簡"鐢?`Promise<string>` 鐩存帴鍥炰紶"鐨勬渶鍒濊璁°€?2. **`resource://` 瑁呬笉涓?Vite 浜х墿**锛歰paque origin 涓?ESM/CORS 鐩存帴琚嫆锛屽繀椤昏嚜瀹氫箟 scheme銆?3. **鏈鍚?HAP 鍙洿鎺ュ畨瑁?*鍒版ā鎷熷櫒锛岀鍚嶄笉鍐嶆槸闃诲椤广€?4. **`relationalStore` 鏀寔 FTS5**锛屾闈㈢増鍏ㄦ枃妫€绱㈤摼鏃犻渶闄嶇骇銆?
### 宸茬煡閬楃暀

瑙?`docs/H0-ACCEPTANCE.md` 搂7锛氬钩鏉垮舰鎬侀€傞厤銆乣2in1` metaViewport銆佸壀璐存澘璇绘潈闄愩€?`targetSdkVersion` 鍛婅銆乣web/` 涓庢闈?`src/` 鐨勫悓姝ョ瓥鐣ャ€?