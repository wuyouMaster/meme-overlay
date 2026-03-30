import { useState, useEffect, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { Overlay } from "./Overlay";
import "../../styles/overlay.css";

type PluginMessage =
  | { type: "show" }
  | { type: "hide" }
  | { type: "animation"; name: string }
  | { type: "progress"; text: string };

type OverlayState = {
  visible: boolean;
  animationName: string;
  progressText: string;
};

const WIN_W = 320;
const WIN_H = 180;
const MARGIN = 20;

async function moveToRandomPosition() {
  const monitor = await currentMonitor();
  if (!monitor) return;

  const { width, height } = monitor.size;
  const scale = monitor.scaleFactor;
  const winWPx = WIN_W * scale;
  const winHPx = WIN_H * scale;

  const maxX = Math.max(0, width - winWPx - MARGIN * scale);
  const maxY = Math.max(0, height - winHPx - MARGIN * scale);
  const x = monitor.position.x + Math.floor(Math.random() * maxX);
  const y = monitor.position.y + Math.floor(Math.random() * maxY);

  await getCurrentWindow().setPosition(new PhysicalPosition(x, y));
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    animationName: "",
    progressText: "",
  });
  // Track whether the window has been given an initial random position.
  // After the first show, subsequent shows (from different hooks) reuse the
  // current position so the window doesn't jump around. If the user drags the
  // window, its OS position is updated automatically and will be preserved too.
  const hasPositionedRef = useRef(false);

  useEffect(() => {
    console.log("[OverlayApp] mounting, registering plugin-message listener");

    const unlisten = listen<PluginMessage>("plugin-message", ({ payload }) => {
      console.log("[OverlayApp] received plugin-message:", JSON.stringify(payload));
      const win = getCurrentWindow();

      switch (payload.type) {
        case "show":
          console.log("[OverlayApp] → show: setting visible=true, calling window.show()");
          setState((s) => ({ ...s, visible: true }));
          if (!hasPositionedRef.current) {
            hasPositionedRef.current = true;
            console.log("[OverlayApp] → first show, randomising position");
            moveToRandomPosition().then(() => win.show());
          } else {
            console.log("[OverlayApp] → subsequent show, keeping current position");
            win.show();
          }
          break;
        case "hide":
          console.log("[OverlayApp] → hide: setting visible=false, calling window.hide()");
          setState((s) => ({ ...s, visible: false, progressText: "" }));
          win.hide();
          break;
        case "animation":
          console.log("[OverlayApp] → animation name:", payload.name);
          setState((s) => ({ ...s, animationName: payload.name }));
          break;
        case "progress":
          console.log("[OverlayApp] → progress text:", payload.text);
          setState((s) => ({ ...s, progressText: payload.text }));
          break;
      }
    });

    // Notify the backend that listeners are registered and ready to receive events
    console.log("[OverlayApp] emitting overlay-ready");
    emit("overlay-ready", {});

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  console.log("[OverlayApp] render, state:", JSON.stringify(state));

  if (!state.visible) {
    console.log("[OverlayApp] not visible, returning null");
    return null;
  }

  return (
    <Overlay
      animationName={state.animationName}
      progressText={state.progressText}
    />
  );
}
