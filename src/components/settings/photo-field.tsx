"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircleIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/user-avatar";
import { setProfilePhotoAction } from "@/server/actions";
import { cn } from "@/lib/utils";

/** The square the browser produces. Bigger than any resume prints it. */
const EDGE = 512;
/** The circle you drag inside, on screen. */
const VIEW = 260;

/**
 * Picking the square out of a photo.
 *
 * A centred crop is wrong for the photos people actually have: a portrait taken
 * on a phone is roughly 3:4, the face sits in the top third, and taking the
 * middle square lands on somebody's chest. It fails silently, too — a square
 * test image passes it — so the fix is not a better guess, it is letting the
 * person see the crop and move it.
 *
 * Drag to reposition, pinch the slider to zoom. The original bitmap is held for
 * as long as the dialog is open so re-cropping never re-encodes an already
 * compressed JPEG; closing it throws the bitmap away.
 */
function cropToDataUri(bitmap: ImageBitmap, zoom: number, offset: { x: number; y: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = EDGE;
  canvas.height = EDGE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser wouldn't give us a canvas to resize with.");

  // The white fill matters: a PNG with transparency would otherwise flatten to
  // black, and this picture is destined for white paper.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, EDGE, EDGE);

  // `scale` maps display pixels to source pixels, so the drag offsets — which
  // are measured on screen — land where the person saw them.
  const base = Math.max(VIEW / bitmap.width, VIEW / bitmap.height) * zoom;
  const drawn = { width: bitmap.width * base, height: bitmap.height * base };
  const ratio = EDGE / VIEW;

  context.drawImage(
    bitmap,
    (VIEW / 2 - drawn.width / 2 + offset.x) * ratio,
    (VIEW / 2 - drawn.height / 2 + offset.y) * ratio,
    drawn.width * ratio,
    drawn.height * ratio,
  );

  return canvas.toDataURL("image/jpeg", 0.85);
}

/** How far the image may be dragged before its edge would show inside the circle. */
function clamp(bitmap: ImageBitmap, zoom: number, next: { x: number; y: number }) {
  const base = Math.max(VIEW / bitmap.width, VIEW / bitmap.height) * zoom;
  const slackX = Math.max(0, (bitmap.width * base - VIEW) / 2);
  const slackY = Math.max(0, (bitmap.height * base - VIEW) / 2);
  return {
    x: Math.min(slackX, Math.max(-slackX, next.x)),
    y: Math.min(slackY, Math.max(-slackY, next.y)),
  };
}

function Cropper({
  bitmap,
  url,
  onCancel,
  onSave,
  saving,
}: {
  bitmap: ImageBitmap;
  url: string;
  onCancel: () => void;
  onSave: (dataUri: string) => void;
  saving: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  // Open on the top of a portrait rather than its middle — where a face is —
  // so the common case needs no dragging at all.
  const [offset, setOffset] = useState(() => {
    const base = Math.max(VIEW / bitmap.width, VIEW / bitmap.height);
    const slackY = Math.max(0, (bitmap.height * base - VIEW) / 2);
    return { x: 0, y: Math.min(slackY, slackY * 0.6) };
  });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const start = drag.current;
      if (!start) return;
      setOffset(
        clamp(bitmap, zoom, {
          x: start.ox + (clientX - start.x),
          y: start.oy + (clientY - start.y),
        }),
      );
    },
    [bitmap, zoom],
  );

  useEffect(() => {
    const up = () => (drag.current = null);
    const onMove = (event: PointerEvent) => move(event.clientX, event.clientY);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
    };
  }, [move]);

  const base = Math.max(VIEW / bitmap.width, VIEW / bitmap.height) * zoom;

  return (
    <>
      <div
        className="bg-inset relative mx-auto touch-none overflow-hidden rounded-full"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        }}
      >
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute cursor-grab select-none active:cursor-grabbing"
          style={{
            width: bitmap.width * base,
            height: bitmap.height * base,
            left: VIEW / 2 - (bitmap.width * base) / 2 + offset.x,
            top: VIEW / 2 - (bitmap.height * base) / 2 + offset.y,
            maxWidth: "none",
          }}
        />
      </div>

      <label className="mt-4 flex items-center gap-3">
        <span className="text-muted-foreground w-10 text-xs">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.02}
          value={zoom}
          onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            setOffset((current) => clamp(bitmap, next, current));
          }}
          className="accent-[var(--primary)] w-full"
        />
      </label>

      <DialogFooter className="mt-5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(cropToDataUri(bitmap, zoom, offset))} disabled={saving}>
          {saving && <LoaderCircleIcon className="size-3.5 animate-spin" />}
          Save photo
        </Button>
      </DialogFooter>
    </>
  );
}

export function PhotoField({
  name,
  email,
  photo: initialPhoto,
}: {
  name: string;
  email: string;
  photo: string;
}) {
  const [photo, setPhoto] = useState(initialPhoto);
  const [dragging, setDragging] = useState(false);
  const [picked, setPicked] = useState<{ bitmap: ImageBitmap; url: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const discard = useCallback(() => {
    setPicked((current) => {
      if (current) {
        current.bitmap.close();
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }, []);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      discard();
      setPicked({ bitmap, url: URL.createObjectURL(file) });
    } catch {
      toast.error("That file isn't an image this browser can read. Try a JPEG or PNG.");
    }
  };

  const save = (dataUri: string) =>
    startTransition(async () => {
      try {
        await setProfilePhotoAction(dataUri);
        setPhoto(dataUri);
        discard();
        toast.success("Photo saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save that photo.");
      }
    });

  const remove = () =>
    startTransition(async () => {
      try {
        await setProfilePhotoAction("");
        setPhoto("");
        toast.success("Photo removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove it.");
      }
    });

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void choose(event.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-4 transition-colors",
        dragging && "border-primary bg-primary-tint",
      )}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        aria-label={photo ? "Replace photo" : "Add a photo"}
        className="focus-visible:ring-ring/40 relative rounded-full transition-opacity hover:opacity-85 focus-visible:ring-[3px] focus-visible:outline-none"
      >
        <UserAvatar name={name} email={email} photo={photo} size={72} />
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
            <LoaderCircleIcon className="size-5 animate-spin text-white" />
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">Profile photo</div>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
          Your avatar here, and the headshot on any resume whose design has the photo switched
          on — one picture, every document. Drop a file or pick one, then drag to frame it.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={pending}
          >
            <UploadIcon className="size-3.5" /> {photo ? "Replace" : "Upload"}
          </Button>
          {photo && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={remove}
              disabled={pending}
            >
              <Trash2Icon className="size-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          // Let the same file be chosen again after a cancel or a failure.
          event.target.value = "";
        }}
      />

      <Dialog open={Boolean(picked)} onOpenChange={(open) => !open && discard()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Frame your photo</DialogTitle>
            <DialogDescription>
              Drag to move, zoom to fill. What you see in the circle is what gets saved.
            </DialogDescription>
          </DialogHeader>
          {picked && (
            <Cropper
              bitmap={picked.bitmap}
              url={picked.url}
              saving={pending}
              onCancel={discard}
              onSave={save}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
