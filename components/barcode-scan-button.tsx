"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Feature 10 — decoding happens entirely in the browser. Only the digits ever
 * reach the server; no image is uploaded or stored.
 *
 * Chrome/Android has a native `BarcodeDetector`; Safari and Firefox do not, so
 * @zxing/browser is loaded lazily as a fallback (it is ~200 KB, and there is no
 * reason to ship it to someone who never taps "scan").
 */

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export function BarcodeScanButton({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({ formats: FORMATS });
          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const [hit] = await detector.detect(videoRef.current);
              if (hit?.rawValue) {
                finish(hit.rawValue);
                return;
              }
            } catch {
              // A frame that cannot be decoded is normal — keep looking.
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          return;
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(
          videoRef.current,
          (result) => {
            if (result) finish(result.getText());
          },
        );
        stopRef.current = () => controls.stop();
      } catch {
        setError(
          "Не вдалося увімкнути камеру. Введіть штрихкод вручну або дозвольте доступ до камери.",
        );
      }
    }

    function finish(code: string) {
      onScan(code.replace(/\D/g, ""));
      setOpen(false);
    }

    start();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, onScan]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Сканувати штрихкод"
        onClick={() => setOpen(true)}
      >
        <ScanLine className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Сканування</DialogTitle>
            <DialogDescription>
              Наведіть камеру на штрихкод. Фото нікуди не надсилається.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : (
            <video
              ref={videoRef}
              className="aspect-square w-full rounded-md bg-muted object-cover"
              muted
              playsInline
            />
          )}

          <Button variant="ghost" onClick={() => setOpen(false)}>
            <X className="size-4" />
            Закрити
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
