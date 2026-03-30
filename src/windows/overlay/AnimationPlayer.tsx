import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import lottie, { AnimationItem } from "lottie-web";
import defaultSpinner from "../../animations/default.json";

type Props = { name: string };

type AnimationEntry = {
  name: string;
  path: string;
  anim_type: string;
  assigned_phase: string | null;
  bookmark?: string | null;
};

export function AnimationPlayer({ name }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  // Dual-source video: .mov (hvc1, WKWebView alpha) + .webm (vp9, Chrome fallback)
  const [movUrl, setMovUrl] = useState<string | null>(null);
  const [webmUrl, setWebmUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Log container dimensions after render
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      console.log(
        `[AnimationPlayer] containerRef size: ${rect.width}x${rect.height}, offset: ${el.offsetWidth}x${el.offsetHeight}`
      );
    } else {
      console.log("[AnimationPlayer] containerRef is null after mount");
    }
  });

  useEffect(() => {
    console.log(`[AnimationPlayer] useEffect triggered, name="${name}"`);
    console.log(`[AnimationPlayer] containerRef.current exists:`, !!containerRef.current);

    // Always cleanup previous animation state first, regardless of ref availability
    animRef.current?.destroy();
    animRef.current = null;
    setGifUrl(null);
    setMovUrl(null);
    setWebmUrl(null);
    setImageUrl(null);

    // No name → use built-in default lottie (requires ref)
    if (!name) {
      if (!containerRef.current) return;
      console.log("[AnimationPlayer] no name, loading default lottie spinner");
      animRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: defaultSpinner,
      });
      console.log("[AnimationPlayer] default lottie loaded:", !!animRef.current);
      return;
    }

    // Load animation info by name
    console.log(`[AnimationPlayer] invoking get_animation_by_name for "${name}"`);
    invoke<AnimationEntry>("get_animation_by_name", { name })
      .then((entry) => {
        console.log("[AnimationPlayer] get_animation_by_name result:", JSON.stringify(entry));
        animRef.current?.destroy();

        if (entry.anim_type === "image") {
          console.log("[AnimationPlayer] loading image from path:", entry.path);
          invoke<number[]>("read_binary_file", { path: entry.path })
            .then((bytes) => {
              console.log("[AnimationPlayer] image loaded, bytes:", bytes.length);
              const ext = entry.path.split(".").pop()?.toLowerCase() || "png";
              const mimeMap: Record<string, string> = {
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                webp: "image/webp",
                svg: "image/svg+xml",
              };
              const mime = mimeMap[ext] || "image/png";
              const blob = new Blob([new Uint8Array(bytes)], { type: mime });
              setImageUrl(URL.createObjectURL(blob));
            })
            .catch((e) => {
              console.error("[AnimationPlayer] image load failed:", e, "→ fallback to default spinner");
              if (!containerRef.current) return;
              animRef.current = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: defaultSpinner,
              });
            });
        } else if (entry.anim_type === "gif") {
          console.log("[AnimationPlayer] loading GIF from path:", entry.path);
          invoke<number[]>("read_binary_file", { path: entry.path })
            .then((bytes) => {
              console.log("[AnimationPlayer] GIF loaded, bytes:", bytes.length);
              const blob = new Blob([new Uint8Array(bytes)], { type: "image/gif" });
              setGifUrl(URL.createObjectURL(blob));
            })
            .catch((e) => {
              console.error("[AnimationPlayer] GIF load failed:", e, "→ fallback to default spinner");
              if (!containerRef.current) return;
              animRef.current = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: defaultSpinner,
              });
            });
        } else if (entry.anim_type === "video") {
          // Derive companion paths: always load .webm; also try .mov for WKWebView hvc1 alpha support
          const webmPath = entry.path.endsWith(".webm")
            ? entry.path
            : entry.path.replace(/\.[^.]+$/, ".webm");
          const movPath = entry.path.replace(/\.[^.]+$/, ".mov");

          console.log("[AnimationPlayer] loading video pair — webm:", webmPath, "mov:", movPath);

          const loadFile = (path: string, mime: string) =>
            invoke<number[]>("read_binary_file", { path }).then((bytes) => {
              const blob = new Blob([new Uint8Array(bytes)], { type: mime });
              return URL.createObjectURL(blob);
            });

          Promise.allSettled([
            loadFile(movPath, "video/mp4"),
            loadFile(webmPath, "video/webm"),
          ]).then(([movResult, webmResult]) => {
            const mov = movResult.status === "fulfilled" ? movResult.value : null;
            const webm = webmResult.status === "fulfilled" ? webmResult.value : null;
            console.log("[AnimationPlayer] video pair loaded — mov:", !!mov, "webm:", !!webm);

            if (!mov && !webm) {
              console.error("[AnimationPlayer] both video sources failed → fallback to default spinner");
              if (!containerRef.current) return;
              animRef.current = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: defaultSpinner,
              });
              return;
            }
            setMovUrl(mov);
            setWebmUrl(webm);
          });
        } else {
          console.log("[AnimationPlayer] loading lottie JSON from path:", entry.path);
          invoke<number[]>("read_binary_file", { path: entry.path })
            .then((bytes) => {
              console.log("[AnimationPlayer] lottie file read, bytes:", bytes.length);
              if (!containerRef.current) {
                console.warn("[AnimationPlayer] containerRef gone after readFile");
                return;
              }
              const text = new TextDecoder().decode(new Uint8Array(bytes));
              animRef.current?.destroy();
              animRef.current = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: JSON.parse(text),
              });
              console.log("[AnimationPlayer] lottie animation loaded:", !!animRef.current);
            })
            .catch((e) => {
              console.error("[AnimationPlayer] lottie file read failed:", e, "→ fallback to default spinner");
              if (!containerRef.current) return;
              animRef.current = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: defaultSpinner,
              });
            });
        }
      })
      .catch((e) => {
        console.error(`[AnimationPlayer] get_animation_by_name failed for "${name}":`, e, "→ fallback to default spinner");
        if (!containerRef.current) return;
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: defaultSpinner,
        });
      });

    return () => {
      animRef.current?.destroy();
    };
  }, [name]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      if (movUrl) URL.revokeObjectURL(movUrl);
      if (webmUrl) URL.revokeObjectURL(webmUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [gifUrl, movUrl, webmUrl, imageUrl]);

  console.log(`[AnimationPlayer] render branch — gifUrl:${!!gifUrl} movUrl:${!!movUrl} webmUrl:${!!webmUrl} imageUrl:${!!imageUrl} name:"${name}"`);

  if (imageUrl) {
    return (
      <div className="animation-player">
        <img
          src={imageUrl}
          alt="animation"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onLoad={() => console.log("[AnimationPlayer] <img> onLoad fired, image displayed")}
          onError={(e) => console.error("[AnimationPlayer] <img> onError:", e)}
        />
      </div>
    );
  }

  if (gifUrl) {
    return (
      <div className="animation-player">
        <img
          src={gifUrl}
          alt="animation"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onLoad={() => console.log("[AnimationPlayer] <img> onLoad fired, GIF displayed")}
          onError={(e) => console.error("[AnimationPlayer] <img> onError:", e)}
        />
      </div>
    );
  }

  if (movUrl || webmUrl) {
    return (
      <div className="animation-player">
        <video
          autoPlay
          loop
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onCanPlay={() => console.log("[AnimationPlayer] <video> onCanPlay fired")}
          onError={(e) => console.error("[AnimationPlayer] <video> onError:", e)}
        >
          {movUrl && <source src={movUrl} type="video/mp4; codecs=hvc1" />}
          {webmUrl && <source src={webmUrl} type="video/webm; codecs=vp9" />}
        </video>
      </div>
    );
  }

  console.log("[AnimationPlayer] rendering lottie container div (ref branch)");
  return <div ref={containerRef} className="animation-player" />;
}
