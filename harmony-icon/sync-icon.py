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

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "src-tauri" / "icons" / "icon.png"
# 中间那条红线整体缩到原尺寸的 88%（用户要求「红线部分缩小一点」）
RED_SCALE = 0.94
# 端点圆头半径（像素，源图 512 基准）
RED_CAP = 7
MEDIA = ROOT / "platforms" / "harmony" / "entry" / "src" / "main" / "resources" / "base" / "media"
APPSCOPE = ROOT / "platforms" / "harmony" / "AppScope" / "resources" / "base" / "media"


def is_ink(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel[:3]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum > 100:
        return True
    return r > 80 and r > g + 30 and r > b + 30


def is_red(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel[:3]
    return r > 80 and r > g + 30 and r > b + 30


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    w, h = src.size

    # 底色：取图标方块内部（避开圆角与网格点）的一点
    bg = src.getpixel((w // 2, int(h * 0.06)))[:3]

    fg = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fg_px = fg.load()
    src_px = src.load()
    red = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    red_px = red.load()
    for y in range(h):
        for x in range(w):
            px = src_px[x, y]
            if px[3] == 0:
                continue
            if is_ink(px):
                fg_px[x, y] = (px[0], px[1], px[2], px[3])
                if is_red(px):
                    red_px[x, y] = (px[0], px[1], px[2], px[3])

    # 用户要求：中间那条红线整体缩小一点，白环与环心红点保持原样。
    # 红色像素里既有「曲线」也有「两个圆环的红色圆心」，所以先按连通域分开，
    # 只把最大那块（曲线）按自身包围盒中心等比缩 RED_SCALE，再把圆心原样贴回。
    import numpy as np

    arr = np.array(red)
    mask = arr[:, :, 3] > 40
    seen = np.zeros_like(mask, dtype=bool)
    comps: list[list[tuple[int, int]]] = []
    ys, xs = np.nonzero(mask)
    for x0, y0 in zip(xs.tolist(), ys.tolist()):
        if seen[y0, x0]:
            continue
        stack = [(x0, y0)]
        seen[y0, x0] = True
        comp: list[tuple[int, int]] = []
        while stack:
            cx0, cy0 = stack.pop()
            comp.append((cx0, cy0))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx0 + dx, cy0 + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((nx, ny))
        comps.append(comp)

    if comps:
        curve = max(comps, key=len)
        keep = np.zeros((h, w), dtype=bool)
        for comp in comps:
            if comp is curve:
                continue
            for cx0, cy0 in comp:
                keep[cy0, cx0] = True

        curve_mask = np.zeros((h, w), dtype=bool)
        for cx0, cy0 in curve:
            curve_mask[cy0, cx0] = True

        curve_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        curve_layer.paste(Image.fromarray(np.where(curve_mask[:, :, None], arr, 0).astype("uint8"), "RGBA"), (0, 0))
        box = curve_layer.getbbox()
        if box is not None:
            piece = curve_layer.crop(box)
            shrunk = piece.resize(
                (max(1, int(piece.width * RED_SCALE)), max(1, int(piece.height * RED_SCALE))),
                Image.LANCZOS,
            )
            cx = (box[0] + box[2]) // 2
            cy = (box[1] + box[3]) // 2
            rebuilt = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            rebuilt.alpha_composite(shrunk, (cx - shrunk.width // 2, cy - shrunk.height // 2))
            # 环心红点原样贴回
            keep_layer = Image.fromarray(np.where(keep[:, :, None], arr, 0).astype("uint8"), "RGBA")
            rebuilt = Image.alpha_composite(rebuilt, keep_layer)
            red = rebuilt

    fg = Image.alpha_composite(fg, red)

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

    compose(144, 0.58).save(MEDIA / "startIcon.png")
    compose(216, 0.66).save(APPSCOPE / "app_icon.png")

    print(f"icon synced: bg=#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X} ink_bbox={bbox} fg={fg.size}")


if __name__ == "__main__":
    main()
