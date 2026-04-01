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
  const [movUrl, setMovUrl] = useState<string | null>(null);
  const [webmUrl, setWebmUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    animRef.current?.destroy();
    animRef.current = null;
    setGifUrl(null);
    setMovUrl(null);
    setWebmUrl(null);
    setImageUrl(null);

    if (!name) {
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

    invoke<AnimationEntry>("get_animation_by_name", { name })
      .then((entry) => {
        animRef.current?.destroy();

        if (entry.anim_type === "image") {
          invoke<number[]>("read_binary_file", { path: entry.path })
            .then((bytes) => {
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
              console.error("Image load failed:", e);
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
          invoke<number[]>("read_binary_file", { path: entry.path })
            .then((bytes) => {
              const blob = new Blob([new Uint8Array(bytes)], { type: "image/gif" });
              setGifUrl(URL.createObjectURL(blob));
            })
            .catch((e) => {
              console.error("GIF load failed:", e);
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
          const webmPath = entry.path.endsWith(".webm")
            ? entry.path
            : entry.path.replace(/\.[^.]+$/, ".webm");
          const movPath = entry.path.replace(/\.[^.]+$/, ".mov");

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

            if (!mov && !webm) {
              console.error("Both video sources failed");
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
          invoke<number[]>("read_binary_file", { path: entry.path })
            .then((bytes) => {
              if (!containerRef.current) return;
              const text = new TextDecoder().decode(new Uint8Array(bytes));
              animRef.current?.destroy();
              animRef.current = lottie.loadAnimation({
                container: containerRef.current,
                renderer: "svg",
                loop: true,
                autoplay: true,
                animationData: JSON.parse(text),
              });
            })
            .catch((e) => {
              console.error("Lottie file read failed:", e);
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
        console.error("get_animation_by_name failed:", e);
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

  useEffect(() => {
    return () => {
      if (gifUrl) URL.revokeObjectURL(gifUrl);
      if (movUrl) URL.revokeObjectURL(movUrl);
      if (webmUrl) URL.revokeObjectURL(webmUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [gifUrl, movUrl, webmUrl, imageUrl]);

  if (imageUrl) {
    return (
      <div className="animation-player">
        <img
          src={imageUrl}
          alt="animation"
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
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
        >
          {movUrl && <source src={movUrl} type="video/mp4; codecs=hvc1" />}
          {webmUrl && <source src={webmUrl} type="video/webm; codecs=vp9" />}
        </video>
      </div>
    );
  }

  return <div ref={containerRef} className="animation-player" />;
}
