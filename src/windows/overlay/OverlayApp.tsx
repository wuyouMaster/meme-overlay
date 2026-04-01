import { useState, useEffect, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Overlay } from "./Overlay";
import { detectClosedPath } from "../../utils/pathOptimizer";
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
  direction: "horizontal" | "vertical" | "none" | "custom";
  speed: number;
  initialX: number;
  initialY: number;
  currentX: number;
  currentY: number;
  moving: boolean;
  customPath?: [number, number][];
  pathIndex?: number;
  pathDirection?: number;
  isClosed?: boolean;
};

const WIN_W = 320;
const WIN_H = 180;
const MARGIN = 20;
const DEFAULT_SPEED = 4; // pixels per frame

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
  const logDebug = (message: string) => {
    void invoke("append_debug_log", {
      source: "overlay",
      message,
    }).catch(() => {});
  };
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
    customPath: undefined,
    pathIndex: 0,
    pathDirection: 1,
    isClosed: false,
  });
  const animationFrameRef = useRef<number | null>(null);
  const customPathSampleLogRef = useRef(0);

  // Load movement direction from hook config
  const loadMovementConfig = async (hookId?: string) => {
    try {
      if (!hookId) {
        logDebug("loadMovementConfig: no hook_id, reset movement to none");
        movementStateRef.current.direction = "none";
        movementStateRef.current.speed = DEFAULT_SPEED;
        movementStateRef.current.customPath = undefined;
        return;
      }

      logDebug(`loadMovementConfig: start hook=${hookId}`);

      const [opencodeConfig, ccConfig] = await Promise.all([
        invoke<Record<string, { movement_direction?: string; movement_speed?: number; custom_path_file?: string }>>("get_hook_config", { client: "opencode" }),
        invoke<Record<string, { movement_direction?: string; movement_speed?: number; custom_path_file?: string }>>("get_hook_config", { client: "cc" }),
      ]);

      const hookAssignment = opencodeConfig[hookId] || ccConfig[hookId];
      logDebug(`loadMovementConfig: hook=${hookId} assignment=${JSON.stringify(hookAssignment ?? null)}`);
      
      if (hookAssignment?.movement_direction != null) {
        movementStateRef.current.direction = hookAssignment.movement_direction as "horizontal" | "vertical" | "none" | "custom";
        
        if (hookAssignment.movement_direction === "custom" && hookAssignment.custom_path_file) {
          try {
            const path = await invoke<[number, number][]>("load_custom_path", {
              fileName: hookAssignment.custom_path_file,
            });
            movementStateRef.current.customPath = path;
            movementStateRef.current.pathIndex = 0;
            movementStateRef.current.pathDirection = 1;
            movementStateRef.current.isClosed = detectClosedPath(path);
            logDebug(
              `loadMovementConfig: loaded custom path hook=${hookId} points=${path.length} closed=${movementStateRef.current.isClosed ? "true" : "false"}`
            );
          } catch (e) {
            movementStateRef.current.customPath = undefined;
            movementStateRef.current.direction = "none";
            logDebug(`loadMovementConfig: custom path load failed hook=${hookId} error=${String(e)}`);
          }
        } else {
          movementStateRef.current.customPath = undefined;
          logDebug(`loadMovementConfig: hook=${hookId} direction=${hookAssignment.movement_direction} no custom path`);
        }

        if (hookAssignment.movement_speed != null && 
            hookAssignment.movement_speed >= 1 && 
            hookAssignment.movement_speed <= 8) {
          movementStateRef.current.speed = hookAssignment.movement_speed;
        } else {
          movementStateRef.current.speed = DEFAULT_SPEED;
        }
        logDebug(
          `loadMovementConfig: applied hook=${hookId} direction=${movementStateRef.current.direction} speed=${movementStateRef.current.speed}`
        );
      }
      // If this hook has no movement config at all, preserve the current
      // movement state (direction, path, speed) so any ongoing animation
      // (e.g. custom path from session.created) continues uninterrupted.
      if (hookAssignment?.movement_direction == null) {
        logDebug(`loadMovementConfig: hook=${hookId} has no movement config`);
      }
    } catch (e) {
      movementStateRef.current.direction = "none";
      movementStateRef.current.speed = DEFAULT_SPEED;
      movementStateRef.current.customPath = undefined;
      logDebug(`loadMovementConfig: failed hook=${hookId ?? "none"} error=${String(e)}`);
    }
  };

  // Start movement animation
  const startMovement = async () => {
    // Guard against concurrent calls and frozen state.
    // Both checks must happen synchronously before any await.
    if (movementStateRef.current.moving) return;
    if (movementFrozenRef.current) return;
    movementStateRef.current.moving = true;
    customPathSampleLogRef.current = 0;
    logDebug(`startMovement: begin direction=${movementStateRef.current.direction} speed=${movementStateRef.current.speed}`);

    const monitor = await currentMonitor();
    if (!monitor) {
      movementStateRef.current.moving = false;
      logDebug("startMovement: currentMonitor returned null");
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

    // Custom path movement
    if (movement.direction === "custom" && movement.customPath && movement.customPath.length >= 2) {
      let lastFrameTime = 0;
      // Speed 1-8: control how fast we traverse the path
      // Lower speed = slower movement (more ms per point)
      const msPerPoint = 200 / movement.speed; // Speed 4 = 50ms per point (20 points/sec)
      logDebug(
        `startMovement: entering custom path branch points=${movement.customPath.length} msPerPoint=${msPerPoint}`
      );

      const animateCustomPath = (timestamp: number) => {
        if (!movement.moving || !movement.customPath || movement.pathIndex === undefined) {
          return;
        }

        // Control speed by frame interval
        if (timestamp - lastFrameTime < msPerPoint) {
          animationFrameRef.current = requestAnimationFrame(animateCustomPath);
          return;
        }
        lastFrameTime = timestamp;

        const point = movement.customPath[movement.pathIndex];
        // Calculate pixel position: normalized (0-1) to screen pixels
        // Ensure window stays within screen bounds
        const maxXPx = width - winWPx;
        const maxYPx = height - winHPx;
        const pixelX = Math.round(
          monitor.position.x + Math.max(0, Math.min(maxXPx, point[0] * maxXPx))
        );
        const pixelY = Math.round(
          monitor.position.y + Math.max(0, Math.min(maxYPx, point[1] * maxYPx))
        );

        if (customPathSampleLogRef.current < 3) {
          customPathSampleLogRef.current += 1;
          logDebug(
            `animateCustomPath: sample index=${movement.pathIndex} point=[${point[0].toFixed(3)},${point[1].toFixed(3)}] pixel=[${pixelX},${pixelY}]`
          );
        }

        movement.currentX = pixelX;
        movement.currentY = pixelY;
        void win.setPosition(new PhysicalPosition(pixelX, pixelY)).catch((e) => {
          logDebug(`animateCustomPath: setPosition failed error=${String(e)}`);
        });

        const nextIndex = movement.pathIndex + (movement.pathDirection || 1);

        if (nextIndex >= movement.customPath.length || nextIndex < 0) {
          if (movement.isClosed) {
            movement.pathIndex = 0;
          } else {
            movement.pathDirection = (movement.pathDirection || 1) * -1;
            movement.pathIndex += movement.pathDirection;
          }
        } else {
          movement.pathIndex = nextIndex;
        }

        animationFrameRef.current = requestAnimationFrame(animateCustomPath);
      };

      animationFrameRef.current = requestAnimationFrame(animateCustomPath);
      return;
    }

    logDebug(`startMovement: entering linear branch direction=${movement.direction}`);

    // Linear movement (horizontal/vertical)
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
    const unlisten = listen<PluginMessage>("plugin-message", async ({ payload }) => {
      const win = getCurrentWindow();

      switch (payload.type) {
        case "show":
          setState((s) => ({ ...s, visible: true }));
          logDebug(`show: visible=true hook=${payload.hook_id ?? "none"} stop=${payload.stop_movement ? "true" : "false"}`);

          if (payload.stop_movement) {
            stopMovement();
            win.show();
            logDebug("show: stop_movement=true, showing window without starting movement");
            break;
          }

          // Unfreeze synchronously (before any await) so that if stopMovement()
          // was called by a concurrent handler while we are suspended below,
          // startMovement will correctly see the frozen flag when we resume.
          movementFrozenRef.current = false;

          // Load movement configuration for this hook
          await loadMovementConfig(payload.hook_id);

          // If direction is "none" and we're currently moving, stop movement
          if (movementStateRef.current.direction === "none" && movementStateRef.current.moving) {
            stopMovement();
            win.show();
            logDebug("show: direction became none while moving, window shown and movement stopped");
            break;
          }
          
          if (!hasPositionedRef.current) {
            // For custom path, use first path point instead of random position
            if (movementStateRef.current.direction === "custom" && 
                movementStateRef.current.customPath && 
                movementStateRef.current.customPath.length >= 2) {
              const monitor = await currentMonitor();
              if (monitor) {
                const { width, height } = monitor.size;
                const scale = monitor.scaleFactor;
                const winWPx = WIN_W * scale;
                const winHPx = WIN_H * scale;
                const firstPoint = movementStateRef.current.customPath[0];
                const maxX = width - winWPx;
                const maxY = height - winHPx;
                const pixelX = Math.round(
                  monitor.position.x + Math.max(0, Math.min(maxX, firstPoint[0] * maxX))
                );
                const pixelY = Math.round(
                  monitor.position.y + Math.max(0, Math.min(maxY, firstPoint[1] * maxY))
                );
                await win.setPosition(new PhysicalPosition(pixelX, pixelY));
                movementStateRef.current.initialX = pixelX;
                movementStateRef.current.initialY = pixelY;
                movementStateRef.current.currentX = pixelX;
                movementStateRef.current.currentY = pixelY;
                logDebug(`show: first custom-path position set to [${pixelX},${pixelY}]`);
              }
            } else {
              const pos = await moveToRandomPosition();
              movementStateRef.current.initialX = pos.x;
              movementStateRef.current.initialY = pos.y;
              movementStateRef.current.currentX = pos.x;
              movementStateRef.current.currentY = pos.y;
              logDebug(`show: random initial position set to [${pos.x},${pos.y}]`);
            }
            hasPositionedRef.current = true;
            
            win.show();
            logDebug(`show: window shown, hasPositioned=${hasPositionedRef.current ? "true" : "false"}`);
            
            // Start movement if direction is not "none"
            if (movementStateRef.current.direction !== "none") {
              startMovement();
            }
          } else {
            win.show();
            logDebug("show: window shown using existing position");
            
            // Resume movement if direction is not "none"
            if (movementStateRef.current.direction !== "none" && !movementStateRef.current.moving) {
              startMovement();
            }
          }
          break;
        case "hide":
          setState((s) => ({ ...s, visible: false, progressText: "" }));
          stopMovement();
          win.hide();
          logDebug("hide: visible=false and window hidden");
          break;
        case "animation":
          setState((s) => ({ ...s, animationName: payload.name }));
          logDebug(`animation: name=${payload.name}`);
          break;
        case "progress":
          setState((s) => ({ ...s, progressText: payload.text }));
          break;
      }
    });

    // Notify the backend that listeners are registered and ready to receive events
    emit("overlay-ready", {});

    return () => {
      stopMovement();
      unlisten.then((fn) => fn());
    };
  }, []);

  if (!state.visible) {
    return null;
  }

  return (
    <Overlay
      animationName={state.animationName}
      progressText={state.progressText}
    />
  );
}
