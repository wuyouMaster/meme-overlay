import { useState, useEffect, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Overlay } from "./Overlay";
import "../../styles/overlay.css";

type PluginMessage =
  | { type: "show"; hook_id?: string; stop_movement?: boolean }
  | { type: "hide" }
  | { type: "animation"; name: string }
  | { type: "progress"; text: string };

type OverlayState = {
  visible: boolean;
  animationName: string;
  progressText: string;
};

type MovementState = {
  direction: "horizontal" | "vertical" | "none";
  speed: number;
  initialX: number;
  initialY: number;
  currentX: number;
  currentY: number;
  moving: boolean;
};

const WIN_W = 320;
const WIN_H = 180;
const MARGIN = 20;
const DEFAULT_SPEED = 2; // pixels per frame

async function moveToRandomPosition() {
  const monitor = await currentMonitor();
  if (!monitor) return { x: 0, y: 0 };

  const { width, height } = monitor.size;
  const scale = monitor.scaleFactor;
  const winWPx = WIN_W * scale;
  const winHPx = WIN_H * scale;

  const maxX = Math.max(0, width - winWPx - MARGIN * scale);
  const maxY = Math.max(0, height - winHPx - MARGIN * scale);
  const x = monitor.position.x + Math.floor(Math.random() * maxX);
  const y = monitor.position.y + Math.floor(Math.random() * maxY);

  await getCurrentWindow().setPosition(new PhysicalPosition(x, y));
  return { x, y };
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
  // When true, startMovement will refuse to run even if !moving.
  // Set synchronously by stopMovement(); cleared synchronously when an active
  // (non-stop) show is received — before any awaits, so concurrent handlers
  // that were already suspended see the correct value when they resume.
  const movementFrozenRef = useRef(false);
  const movementStateRef = useRef<MovementState>({
    direction: "none",
    speed: DEFAULT_SPEED,
    initialX: 0,
    initialY: 0,
    currentX: 0,
    currentY: 0,
    moving: false,
  });
  const animationFrameRef = useRef<number | null>(null);

  // Load movement direction from hook config
  const loadMovementDirection = async (hookId?: string) => {
    try {
      if (!hookId) {
        movementStateRef.current.direction = "none";
        console.log("[OverlayApp] no hook_id, using direction: none");
        return;
      }

      // Get hook config for both clients (opencode and cc)
      const [opencodeConfig, ccConfig] = await Promise.all([
        invoke<Record<string, { movement_direction?: string }>>("get_hook_config", { client: "opencode" }),
        invoke<Record<string, { movement_direction?: string }>>("get_hook_config", { client: "cc" }),
      ]);

      // Find the hook assignment
      const hookAssignment = opencodeConfig[hookId] || ccConfig[hookId];
      const configured = hookAssignment?.movement_direction;

      // Only update direction when the hook explicitly has one configured.
      // If unconfigured (null/undefined), keep the current direction so that
      // movement set by a previous hook (e.g. session.created) is not interrupted
      // by a hook that simply hasn't been configured (e.g. session.idle).
      if (configured != null) {
        movementStateRef.current.direction = configured as "horizontal" | "vertical" | "none";
        console.log("[OverlayApp] direction updated for hook", hookId, "→", configured);
      } else {
        console.log("[OverlayApp] no direction for hook", hookId, ", keeping:", movementStateRef.current.direction);
      }
    } catch (e) {
      console.error("[OverlayApp] failed to load movement direction:", e);
      movementStateRef.current.direction = "none";
    }
  };

  // Start movement animation
  const startMovement = async () => {
    // Guard against concurrent calls and frozen state.
    // Both checks must happen synchronously before any await.
    if (movementStateRef.current.moving) {
      console.log("[startMovement] already moving, skipping duplicate start");
      return;
    }
    if (movementFrozenRef.current) {
      console.log("[startMovement] frozen by stop_movement, skipping");
      return;
    }
    movementStateRef.current.moving = true;
    console.log("[startMovement] starting new movement loop");

    const monitor = await currentMonitor();
    if (!monitor) {
      movementStateRef.current.moving = false;
      return;
    }

    const { width, height } = monitor.size;
    const scale = monitor.scaleFactor;
    const winWPx = WIN_W * scale;
    const winHPx = WIN_H * scale;

    const maxX = Math.max(0, width - winWPx - MARGIN * scale);
    const maxY = Math.max(0, height - winHPx - MARGIN * scale);

    const movement = movementStateRef.current;

    const win = getCurrentWindow();
    const animate = () => {
      if (!movement.moving) return;

      let newX = movement.currentX;
      let newY = movement.currentY;

      if (movement.direction === "horizontal") {
        newX += movement.speed;
        if (newX >= monitor.position.x + maxX) {
          newX = movement.initialX;
        }
      } else if (movement.direction === "vertical") {
        newY += movement.speed;
        if (newY >= monitor.position.y + maxY) {
          newY = movement.initialY;
        }
      }

      if (newX !== movement.currentX || newY !== movement.currentY) {
        movement.currentX = newX;
        movement.currentY = newY;
        win.setPosition(new PhysicalPosition(newX, newY));
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Stop movement animation
  const stopMovement = () => {
    movementFrozenRef.current = true;
    movementStateRef.current.moving = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  useEffect(() => {
    console.log("[OverlayApp] mounting, registering plugin-message listener");

    const unlisten = listen<PluginMessage>("plugin-message", async ({ payload }) => {
      console.log("[OverlayApp] received plugin-message:", JSON.stringify(payload));
      const win = getCurrentWindow();

      switch (payload.type) {
        case "show":
          console.log(`[OverlayApp] → show hook_id=${payload.hook_id} stop_movement=${payload.stop_movement} moving=${movementStateRef.current.moving} t=${Date.now()}`);
          setState((s) => ({ ...s, visible: true }));

          if (payload.stop_movement) {
            stopMovement();
            win.show();
            break;
          }

          // Unfreeze synchronously (before any await) so that if stopMovement()
          // was called by a concurrent handler while we are suspended below,
          // startMovement will correctly see the frozen flag when we resume.
          movementFrozenRef.current = false;

          // Load movement direction for this hook
          await loadMovementDirection(payload.hook_id);
          
          if (!hasPositionedRef.current) {
            hasPositionedRef.current = true;
            console.log("[OverlayApp] → first show, randomising position");
            const pos = await moveToRandomPosition();
            movementStateRef.current.initialX = pos.x;
            movementStateRef.current.initialY = pos.y;
            movementStateRef.current.currentX = pos.x;
            movementStateRef.current.currentY = pos.y;
            win.show();
            
            // Start movement if direction is not "none"
            if (movementStateRef.current.direction !== "none") {
              startMovement();
            }
          } else {
            console.log("[OverlayApp] → subsequent show, keeping current position");
            win.show();
            
            // Resume movement if direction is not "none"
            if (movementStateRef.current.direction !== "none" && !movementStateRef.current.moving) {
              startMovement();
            }
          }
          break;
        case "hide":
          console.log("[OverlayApp] → hide: setting visible=false, calling window.hide()");
          setState((s) => ({ ...s, visible: false, progressText: "" }));
          stopMovement();
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
      stopMovement();
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
