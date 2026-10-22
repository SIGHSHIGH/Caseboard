# -*- coding: utf-8 -*-
"""把 Windows 版图标同步成鸿蒙的分层图标（H5.7）。

来源：src-tauri/icons/icon.png（512×512，深色圆角方块 + 点阵网格 + 两个白色圆环 + 红色曲线）。
产出：
- entry/src/main/resources/base/media/background.png  纯色底（取自图标方块的底色）
- entry/src/main/resources/base/media/foreground.png  只留「圆环 + 红线」的透明前景（安全区 64%）
- entry/src/main/resources/base/media/startIcon.png   启动图标（合成后 144×144）
- AppScope/resources/base/media/app_icon.png          应用图标（合成后 216×216）

判据：前景 = 亮度够高（白环）或红色占优（红线/红点），点阵网格的暗灰点被丢掉。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "src-tauri" / "icons" / "icon.png"
MEDIA = ROOT / "platforms" / "harmony" / "entry" / "src" / "main" / "resources" / "base" / "media"
APPSCOPE = ROOT / "platforms" / "harmony" / "AppScope" / "resources" / "base" / "media"


def is_ink(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel[:3]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum > 100:
        return True
    return r > 80 and r > g + 30 and r > b + 30


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    w, h = src.size

    # 底色：取图标方块内部（避开圆角与网格点）的一点
    bg = src.getpixel((w // 2, int(h * 0.06)))[:3]

    fg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fg_px = fg.load()
    src_px = src.load()
    for y in range(h):
        for x in range(w):
            px = src_px[x, y]
            if px[3] == 0:
                continue
            if is_ink(px):
                fg_px[x, y] = (px[0], px[1], px[2], px[3])

    bbox = fg.getbbox()
    if bbox is None:
        raise SystemExit("前景提取失败：没有找到白色圆环或红线")
    fg = fg.crop(bbox)

    def compose(size: int, ratio: float) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), (bg[0], bg[1], bg[2], 255))
        inner = int(round(size * ratio))
        art = fg.copy()
        art.thumbnail((inner, inner), Image.LANCZOS)
        canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
        return canvas

    MEDIA.mkdir(parents=True, exist_ok=True)
    APPSCOPE.mkdir(parents=True, exist_ok=True)

    # 分层图标：背景纯色 + 前景（安全区 64%）
    background = Image.new("RGBA", (288, 288), (bg[0], bg[1], bg[2], 255))
    background.save(MEDIA / "background.png")
    foreground = Image.new("RGBA", (288, 288), (0, 0, 0, 0))
    art = fg.copy()
    art.thumbnail((int(288 * 0.64), int(288 * 0.64)), Image.LANCZOS)
    foreground.alpha_composite(art, ((288 - art.width) // 2, (288 - art.height) // 2))
    foreground.save(MEDIA / "foreground.png")

    compose(144, 0.64).save(MEDIA / "startIcon.png")
    compose(216, 0.72).save(APPSCOPE / "app_icon.png")

    print(f"icon synced: bg=#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X} ink_bbox={bbox} fg={fg.size}")


if __name__ == "__main__":
    main()
