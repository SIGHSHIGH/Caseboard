# -*- coding: utf-8 -*-
"""用用户给的新图（harmony-icon/01-source.png，144×144）重做鸿蒙图标。

产出（直接写进鸿蒙工程）：
- entry/src/main/resources/base/media/background.png  纯色底（取自新图底色）
- entry/src/main/resources/base/media/foreground.png  只留「白环 + 红线」的透明前景（安全区 64%）
- entry/src/main/resources/base/media/startIcon.png   启动图 144×144（新图原样）
- AppScope/resources/base/media/app_icon.png          应用图标 216×216（新图放大到 216）

新图是「成品单片图」：深色方底 + 两个白环 + 红色曲线（右环有红心）。
所以前景层只做「去掉底色」的抠图，位置与比例跟原图保持一致，不再二次缩放红线。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "harmony-icon" / "01-source.png"
if not SOURCE.is_file():
    SOURCE = Path(__file__).resolve().parent / "icon-source.png"
MEDIA = ROOT / "platforms" / "harmony" / "entry" / "src" / "main" / "resources" / "base" / "media"
APPSCOPE = ROOT / "platforms" / "harmony" / "AppScope" / "resources" / "base" / "media"

# 前景（白环 + 红线）在 288 画布里的占比：鸿蒙分层图标安全区约 64%，略留一点余量
FG_RATIO = 0.66
# 背景层与 app_icon 的圆角半径（按 288 基准算，和系统默认圆角接近；app_icon 由系统再蒙版）
BG_RADIUS = 0


def is_ink(px: tuple[int, int, int]) -> bool:
    """白环（亮度高）或红线（红色占优）算前景；深色底与抗锯齿边缘不算。"""
    r, g, b = px[:3]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum > 110:
        return True
    return r > 90 and r > g + 35 and r > b + 35


def main() -> None:
    src = Image.open(SOURCE).convert("RGBA")
    w, h = src.size

    # 底色：四角里最暗且不透明的那个（避开可能的圆角透明区）
    bg = src.getpixel((w // 2, 2))[:3]
    for spot in ((2, 2), (w - 3, 2), (2, h - 3), (w // 2, h // 2)):
        px = src.getpixel(spot)
        if px[3] > 200:
            bg = px[:3]
            break

    # 前景 = 「与底色差得够远」的像素，按差值给软 alpha，边缘才不会有锯齿
    fg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fg_px = fg.load()
    src_px = src.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src_px[x, y]
            if a <= 8:
                continue
            dist = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
            if dist <= 18:
                continue
            alpha = 255 if dist >= 60 else int(255 * (dist - 18) / 42)
            fg_px[x, y] = (r, g, b, max(0, min(255, alpha)))

    bbox = fg.getbbox()
    if bbox is None:
        raise SystemExit("前景提取失败：新图里没找到白环/红线")
    art = fg.crop(bbox)

    MEDIA.mkdir(parents=True, exist_ok=True)
    APPSCOPE.mkdir(parents=True, exist_ok=True)

    # 背景层：纯色
    background = Image.new("RGBA", (288, 288), (bg[0], bg[1], bg[2], 255))
    background.save(MEDIA / "background.png")

    # 前景层：等比放大/缩小到安全区（64%），居中
    inner = int(round(288 * FG_RATIO))
    scale = min(inner / art.width, inner / art.height)
    piece = art.resize(
        (max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS
    )
    foreground = Image.new("RGBA", (288, 288), (0, 0, 0, 0))
    foreground.alpha_composite(piece, ((288 - piece.width) // 2, (288 - piece.height) // 2))
    foreground.save(MEDIA / "foreground.png")

    # 应用图标：单片图（系统套圆角蒙版）—— 模块里也放一份，module.json5 直接引用它
    app_icon = src.resize((216, 216), Image.LANCZOS)
    app_icon.save(APPSCOPE / "app_icon.png")
    app_icon.save(MEDIA / "app_icon.png")

    # 启动图：新图原样（144）
    src.resize((144, 144), Image.LANCZOS).save(MEDIA / "startIcon.png")

    print(
        f"icon replaced: bg=#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X} "
        f"ink_bbox={bbox} art={art.size} fg={piece.size}"
    )


if __name__ == "__main__":
    main()
