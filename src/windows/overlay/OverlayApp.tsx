import { useState, useEffect } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    animationName: "",
    progressText: "",
  });

  useEffect(() => {
    console.log("[OverlayApp] mounting, registering plugin-message listener");

    const unlisten = listen<PluginMessage>("plugin-message", ({ payload }) => {
      console.log("[OverlayApp] received plugin-message:", JSON.stringify(payload));
      const window = getCurrentWindow();

      switch (payload.type) {
        case "show":
          console.log("[OverlayApp] → show: setting visible=true, calling window.show()");
          setState((s) => ({ ...s, visible: true }));
          window.show();
          break;
        case "hide":
          console.log("[OverlayApp] → hide: setting visible=false, calling window.hide()");
          setState((s) => ({ ...s, visible: false, progressText: "" }));
          window.hide();
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
