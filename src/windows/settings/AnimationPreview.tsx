import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import lottie, { AnimationItem } from "lottie-web";

type Props = {
  path: string;
  animType: string;
};

export function AnimationPreview({ path, animType }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cleanup
    animRef.current?.destroy();
    animRef.current = null;
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaUrl(null);
    setError(null);
    setLoading(true);

    if (animType === "image") {
      const ext = path.split(".").pop()?.toLowerCase() || "png";
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        svg: "image/svg+xml",
      };
      const mime = mimeMap[ext] || "image/png";
      invoke<number[]>("read_binary_file", { path })
        .then((bytes) => {
          const blob = new Blob([new Uint8Array(bytes)], { type: mime });
          setMediaUrl(URL.createObjectURL(blob));
          setLoading(false);
        })
        .catch((e) => {
          console.error("Failed to load image:", e);
          setError(String(e));
          setLoading(false);
        });
      return;
    }

    if (animType === "gif") {
      invoke<number[]>("read_binary_file", { path })
        .then((bytes) => {
          const blob = new Blob([new Uint8Array(bytes)], { type: "image/gif" });
          setMediaUrl(URL.createObjectURL(blob));
          setLoading(false);
        })
        .catch((e) => {
          console.error("Failed to load GIF:", e);
          setError(String(e));
          setLoading(false);
        });
      return;
    }

    if (animType === "video") {
      const mime = path.endsWith(".webm") ? "video/webm" : "video/mp4";
      invoke<number[]>("read_binary_file", { path })
        .then((bytes) => {
          const blob = new Blob([new Uint8Array(bytes)], { type: mime });
          setMediaUrl(URL.createObjectURL(blob));
          setLoading(false);
        })
        .catch((e) => {
          console.error("Failed to load video:", e);
          setError(String(e));
          setLoading(false);
        });
      return;
    }

    // Lottie JSON - needs containerRef
    if (!containerRef.current) return;
    invoke<string>("read_animation_file", { path })
      .then((jsonStr) => {
        if (!containerRef.current) return;
        const data = JSON.parse(jsonStr);
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData: data,
        });
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load animation:", e);
        setError(String(e));
        setLoading(false);
      });

    return () => {
      animRef.current?.destroy();
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [path, animType]);

  if (error) {
    return (
      <div className="preview-container">
        <div className="preview-error">Failed to load: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="preview-container">
        <div className="preview-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="preview-container">
      {animType === "image" && mediaUrl && (
        <img
          src={mediaUrl}
          alt="Image preview"
          className="preview-media"
        />
      )}

      {animType === "gif" && mediaUrl && (
        <img
          src={mediaUrl}
          alt="Animation preview"
          className="preview-media"
        />
      )}

      {animType === "video" && mediaUrl && (
        <video
          src={mediaUrl}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="preview-media"
        />
      )}

      {animType === "lottie" && (
        <div ref={containerRef} className="preview-player" />
      )}
    </div>
  );
}
