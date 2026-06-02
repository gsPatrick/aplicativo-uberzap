#!/usr/bin/env python3
"""Gera ícones e splash com padding para evitar corte no Android/iOS."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images"

# Android adaptive icon: logo deve ficar na zona segura (~66% central)
ADAPTIVE_SCALE = 0.78
# Ícone iOS / fallback
ICON_SCALE = 0.82
# Splash: logo ocupa ~72% da largura (logos horizontais)
SPLASH_WIDTH_RATIO = 0.72
SPLASH_SIZE = (1284, 2778)
# In-app login/register
APP_LOGO_MAX_WIDTH = 960


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def trim_content(img: Image.Image, threshold: int = 24) -> Image.Image:
    """Remove faixas pretas/vazias — deixa logo horizontal menos 'quadrada'."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    min_x, min_y, max_x, max_y = w, h, 0, 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 10 and (r > threshold or g > threshold or b > threshold):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x <= min_x or max_y <= min_y:
        return rgba

    pad = max(2, int(min(w, h) * 0.012))
    min_x = max(0, min_x - pad)
    min_y = max(0, min_y - pad)
    max_x = min(w - 1, max_x + pad)
    max_y = min(h - 1, max_y + pad)
    return rgba.crop((min_x, min_y, max_x + 1, max_y + 1))


def fit_by_width(img: Image.Image, max_width: int) -> Image.Image:
    if img.width <= max_width:
        return img.copy()
    ratio = max_width / img.width
    new_size = (max_width, max(1, int(img.height * ratio)))
    return img.resize(new_size, Image.Resampling.LANCZOS)


def fit_in_box(img: Image.Image, max_side: int) -> Image.Image:
    copy = img.copy()
    copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return copy


def paste_center(canvas: Image.Image, img: Image.Image) -> None:
    x = (canvas.width - img.width) // 2
    y = (canvas.height - img.height) // 2
    canvas.paste(img, (x, y), img)


def make_square_icon(source: Path, out: Path, size: int, scale: float, bg_rgba) -> None:
    logo = trim_content(load_rgba(source))
    fitted = fit_by_width(logo, int(size * scale))
    canvas = Image.new("RGBA", (size, size), bg_rgba)
    paste_center(canvas, fitted)
    canvas.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}")


def make_adaptive_foreground(source: Path, out: Path, size: int = 1024) -> None:
    logo = trim_content(load_rgba(source))
    fitted = fit_by_width(logo, int(size * ADAPTIVE_SCALE))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    paste_center(canvas, fitted)
    canvas.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}")


def make_splash(source: Path, out: Path, bg_rgba, splash_size=SPLASH_SIZE) -> None:
    logo = trim_content(load_rgba(source))
    target_w = int(splash_size[0] * SPLASH_WIDTH_RATIO)
    fitted = fit_by_width(logo, target_w)
    canvas = Image.new("RGBA", splash_size, bg_rgba)
    paste_center(canvas, fitted)
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}")


def make_app_logo(source: Path, out: Path, max_width: int = APP_LOGO_MAX_WIDTH) -> None:
    logo = trim_content(load_rgba(source))
    fitted = fit_by_width(logo, max_width)
    if out.suffix.lower() in {".jpg", ".jpeg"}:
        fitted.convert("RGB").save(out, "JPEG", quality=92, optimize=True)
    else:
        fitted.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    passenger_src = ROOT / "assets" / "images" / "icon-passenger.png"
    driver_src = ROOT / "assets" / "images" / "icon-driver.png"

    print("Logo in-app motorista (recortada, horizontal):")
    make_app_logo(driver_src, OUT / "logomotorista.jpeg")

    print("Ícones iOS / store (1024px, padding):")
    make_square_icon(
        passenger_src,
        OUT / "icon-passenger-store.png",
        1024,
        ICON_SCALE,
        (255, 255, 255, 255),
    )
    make_square_icon(
        driver_src,
        OUT / "icon-driver-store.png",
        1024,
        ICON_SCALE,
        (31, 33, 32, 255),
    )

    print("Foreground adaptive Android (zona segura):")
    make_adaptive_foreground(passenger_src, OUT / "adaptive-icon-passenger.png")
    make_adaptive_foreground(driver_src, OUT / "adaptive-icon-driver.png")

    print("Splash portrait (1284x2778):")
    make_splash(passenger_src, OUT / "splash-passenger.png", (255, 255, 255, 255))
    make_splash(driver_src, OUT / "splash-driver.png", (31, 33, 32, 255))

    # Raiz assets (Expo Go / fallback)
    print("Fallback assets/ raiz:")
    make_square_icon(
        passenger_src,
        ROOT / "assets" / "icon.png",
        1024,
        ICON_SCALE,
        (255, 255, 255, 255),
    )
    make_adaptive_foreground(passenger_src, ROOT / "assets" / "adaptive-icon.png")
    make_splash(passenger_src, ROOT / "assets" / "splash.png", (255, 255, 255, 255))

    print("Concluído.")


if __name__ == "__main__":
    main()
