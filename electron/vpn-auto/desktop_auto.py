"""
Auto VPN dialog helper.

Waits for a Windows VPN connection pop-up and triggers the default
Connect action. It can run once for JARVIS or keep watching manually.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import sys
import time

try:
    import pyautogui
    import pygetwindow as gw
except ImportError as error:
    print(
        "[auto-vpn] Missing Python dependency. Run: "
        "py -3 -m pip install -r electron/vpn-auto/requirements.txt",
        file=sys.stderr,
    )
    print(f"[auto-vpn] Import error: {error}", file=sys.stderr)
    sys.exit(3)


@dataclass(frozen=True)
class Config:
    titles: tuple[str, ...]
    timeout: float
    search_interval: float
    post_enter_wait: float
    post_click_wait: float
    button_connect_x: int
    button_connect_y_from_bottom: int
    image_dir: Path
    image_confidence: float
    image_enabled: bool
    watch: bool


pyautogui.PAUSE = 0.15
pyautogui.FAILSAFE = True


def log(message: str) -> None:
    print(f"[auto-vpn] {message}", flush=True)


def find_window(titles: tuple[str, ...]):
    lookups = tuple(title.lower() for title in titles if title.strip())

    for window in gw.getAllWindows():
        window_title = (window.title or "").lower()

        if any(lookup in window_title for lookup in lookups):
            return window

    return None


def activate_window(window) -> bool:
    if window.isMinimized:
        window.restore()
        time.sleep(0.2)

    try:
        window.activate()
        time.sleep(0.3)
        return True
    except Exception as error:
        log(f"Could not activate window: {error}")
        return False


def window_is_open(config: Config) -> bool:
    return find_window(config.titles) is not None


def get_image_candidates(config: Config, prefix: str) -> list[Path]:
    if not config.image_enabled or not config.image_dir.exists():
        return []

    extensions = ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp")
    images: list[Path] = []

    for extension in extensions:
        images.extend(config.image_dir.glob(f"{prefix}*{extension[1:]}"))

    return sorted(images)


def locate_image(config: Config, prefix: str, region=None):
    for image_path in get_image_candidates(config, prefix):
        try:
            center = pyautogui.locateCenterOnScreen(
                str(image_path),
                confidence=config.image_confidence,
                region=region,
            )
        except Exception as error:
            log(
                f'Could not locate image "{image_path.name}" '
                f"with confidence: {error}"
            )

            try:
                center = pyautogui.locateCenterOnScreen(
                    str(image_path),
                    region=region,
                )
            except Exception as fallback_error:
                log(
                    f'Could not locate image "{image_path.name}" '
                    f"without confidence: {fallback_error}"
                )
                continue

        if center:
            return image_path, center

    return None


def click_image(config: Config, region=None) -> bool:
    located = locate_image(config, "connect_button", region)

    if not located:
        return False

    image_path, center = located

    pyautogui.moveTo(center.x, center.y, duration=0.1)
    pyautogui.click()
    log(
        f'Image click sent using "{image_path.name}" '
        f"at x={center.x} y={center.y}."
    )
    return True


def connect_window_image_is_visible(config: Config) -> bool:
    located = locate_image(config, "connect_window")

    if not located:
        return False

    image_path, center = located
    log(
        f'Window image "{image_path.name}" found '
        f"at x={center.x} y={center.y}."
    )
    return True


def get_window_region(window) -> tuple[int, int, int, int] | None:
    try:
        return (
            int(window.left),
            int(window.top),
            int(window.width),
            int(window.height),
        )
    except Exception:
        return None


def click_by_coordinate(window, config: Config) -> None:
    x = int(window.left + config.button_connect_x)
    y = int(window.top + window.height - config.button_connect_y_from_bottom)

    pyautogui.moveTo(x, y, duration=0.1)
    pyautogui.click()
    log(f"Coordinate click sent to Connect at x={x} y={y}.")


def click_connect(window, config: Config) -> str:
    log(f'Pop-up found: "{window.title}"')

    if activate_window(window):
        if click_image(config, get_window_region(window)):
            time.sleep(config.post_click_wait)
            return "image"

        pyautogui.press("enter")
        time.sleep(config.post_enter_wait)

        if not window_is_open(config):
            log("Connect triggered with Enter.")
            return "enter"

    click_by_coordinate(window, config)
    time.sleep(config.post_click_wait)
    return "coordinate"


def run_once(config: Config) -> bool:
    deadline = time.monotonic() + config.timeout
    log(
        f"Waiting for {', '.join(repr(title) for title in config.titles)} "
        f"for {config.timeout:.0f}s."
    )

    while time.monotonic() <= deadline:
        window = find_window(config.titles)

        if window:
            method = click_connect(window, config)
            log(f"Automation finished with method={method}.")
            return True

        if connect_window_image_is_visible(config) and click_image(config):
            log("Automation finished with method=image.")
            return True

        time.sleep(config.search_interval)

    log("Timed out waiting for VPN pop-up.")
    return False


def watch(config: Config) -> None:
    log(
        f"Watching {', '.join(repr(title) for title in config.titles)}. "
        "Press Ctrl+C to stop."
    )

    while True:
        window = find_window(config.titles)

        if window:
            click_connect(window, config)
            time.sleep(config.post_click_wait)
        elif connect_window_image_is_visible(config) and click_image(config):
            time.sleep(config.post_click_wait)
        else:
            time.sleep(config.search_interval)


def parse_args() -> Config:
    parser = argparse.ArgumentParser(
        description="Click the Windows VPN Connect dialog."
    )
    parser.add_argument("--vpn-name", default="")
    parser.add_argument("--title", default="")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--search-interval", type=float, default=0.5)
    parser.add_argument("--post-enter-wait", type=float, default=0.8)
    parser.add_argument("--post-click-wait", type=float, default=2.0)
    parser.add_argument("--button-x", type=int, default=64)
    parser.add_argument("--button-bottom-offset", type=int, default=20)
    parser.add_argument(
        "--image-dir",
        default=str(Path(__file__).with_name("images")),
    )
    parser.add_argument("--image-confidence", type=float, default=0.85)
    parser.add_argument("--no-image", action="store_true")
    parser.add_argument("--watch", action="store_true")

    args = parser.parse_args()
    title = args.title.strip()
    vpn_name = args.vpn_name.strip()

    if title:
        titles = (title,)
    elif vpn_name:
        vpn_name_without_prefix = (
            vpn_name[4:].strip()
            if vpn_name.lower().startswith("vpn ")
            else vpn_name
        )

        titles = tuple(
            dict.fromkeys(
                title_candidate
                for title_candidate in (
                    f"Conectar {vpn_name}",
                    f"Conectar VPN {vpn_name_without_prefix}",
                    f"Conectar {vpn_name_without_prefix}",
                )
                if title_candidate.strip()
            )
        )
    else:
        titles = (
            "Conectar VPN EQX",
            "Conectar EQX",
        )

    image_confidence = min(max(args.image_confidence, 0.1), 1.0)

    return Config(
        titles=titles,
        timeout=max(1.0, args.timeout),
        search_interval=max(0.1, args.search_interval),
        post_enter_wait=max(0.1, args.post_enter_wait),
        post_click_wait=max(0.1, args.post_click_wait),
        button_connect_x=args.button_x,
        button_connect_y_from_bottom=args.button_bottom_offset,
        image_dir=Path(args.image_dir),
        image_confidence=image_confidence,
        image_enabled=not args.no_image,
        watch=args.watch,
    )


def main() -> int:
    config = parse_args()

    try:
        if config.watch:
            watch(config)
            return 0

        return 0 if run_once(config) else 2
    except KeyboardInterrupt:
        log("Automation stopped.")
        return 130
    except pyautogui.FailSafeException:
        log("PyAutoGUI fail-safe triggered.")
        return 4
    except Exception as error:
        print(f"[auto-vpn] Unexpected error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
