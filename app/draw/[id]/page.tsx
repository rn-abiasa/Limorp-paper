"use client";

import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronLeft,
  Pen,
  Eraser,
  Download,
  Trash2,
  Undo2,
  Redo2,
  Hand,
  Type,
  MousePointer2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStroke } from "perfect-freehand";
import { supabase } from "@/lib/supabase";

function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"],
  );
  d.push("Z");
  return d.join(" ");
}

type Point = [number, number, number];

type Stroke = {
  id: string;
  points: Point[];
  mode: "pen" | "eraser";
  color: string;
  size: number;
};

type TextBox = {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontWeight: number;
  color: string;
};

const cursors = {
  pen: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>') 0 24, auto`,
  eraser: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg>') 0 24, auto`,
  pan: `grab`,
  panning: `grabbing`,
  text: `text`,
  select: `default`,
};

type HistorySnapshot = { strokes: Stroke[]; texts: TextBox[] };

export default function DrawPage() {
  const router = useRouter();
  const params = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [texts, setTexts] = useState<TextBox[]>([]);

  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [projectName, setProjectName] = useState("Loading...");

  const saveState = (newStrokes: Stroke[], newTexts: TextBox[]) => {
    setUndoStack((prev) => [...prev, { strokes, texts }]);
    setRedoStack([]);
  };

  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<
    "select" | "pan" | "pen" | "eraser" | "text"
  >("select");
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(4);
  const [fontSize, setFontSize] = useState<number>(24);
  const [fontWeight, setFontWeight] = useState<number>(400);

  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const [lastPanPoint, setLastPanPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Initial load
  useEffect(() => {
    const loadDrawing = async () => {
      // Fetch project name
      const { data: projectData } = await (supabase.from("projects") as any)
        .select("name")
        .eq("id", params.id as string)
        .single();

      if (projectData && projectData.name) {
        setProjectName(projectData.name);
      } else {
        setProjectName("Untitled Project");
      }

      // Fetch drawing data
      const { data, error } = await (supabase.from("drawings") as any)
        .select("data")
        .eq("project_id", params.id as string)
        .single();

      if (data && data.data) {
        const pd = data.data as any;
        if (pd.strokes) setStrokes(pd.strokes);
        if (pd.texts) setTexts(pd.texts);
        if (pd.camera) setCamera(pd.camera);
      }
      setIsLoaded(true);
    };

    if (params.id) {
      loadDrawing();
    }
  }, [params.id]);

  // Debounced Auto-save
  useEffect(() => {
    if (!isLoaded) return;

    setIsSaving(true);
    const timeoutId = setTimeout(async () => {
      const { error } = await (supabase.from("drawings") as any).upsert(
        {
          project_id: params.id as string,
          data: { strokes, texts, camera },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );

      // Also update project's updated_at timestamp to bubble it up
      await (supabase.from("projects") as any)
        .update({ updated_at: new Date().toISOString() })
        .eq("id", params.id as string);

      setIsSaving(false);
      if (error) console.error("Error saving drawing:", error);
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timeoutId);
  }, [strokes, texts, camera, isLoaded, params.id]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.z, camera.z);

      const drawStrokeToCanvas = (
        pathData: string,
        sMode: "pen" | "eraser",
        sColor: string,
      ) => {
        const path = new Path2D(pathData);
        ctx.fillStyle = sMode === "eraser" ? "#000" : sColor;
        ctx.globalCompositeOperation =
          sMode === "eraser" ? "destination-out" : "source-over";
        ctx.fill(path);
      };

      for (const stroke of strokes) {
        if (stroke.points.length === 0) continue;
        const outlinePoints = getStroke(stroke.points, {
          size: stroke.mode === "eraser" ? stroke.size * 5 : stroke.size,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
        });
        const pathData = getSvgPathFromStroke(outlinePoints);
        drawStrokeToCanvas(
          pathData,
          stroke.mode as "pen" | "eraser",
          stroke.color,
        );
      }

      if (
        currentPoints.length > 0 &&
        mode !== "pan" &&
        mode !== "select" &&
        mode !== "text"
      ) {
        const outlinePoints = getStroke(currentPoints, {
          size: mode === "eraser" ? lineWidth * 5 : lineWidth,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
        });
        const pathData = getSvgPathFromStroke(outlinePoints);
        drawStrokeToCanvas(pathData, mode as "pen" | "eraser", color);
      }

      ctx.restore();
    };

    render();
  }, [strokes, currentPoints, mode, color, lineWidth, camera]);

  useEffect(() => {
    const handleResize = () => setStrokes([...strokes]);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [strokes]);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left - camera.x) / camera.z,
      (e.clientY - rect.top - camera.y) / camera.z,
      e.pressure !== undefined ? e.pressure : 0.5,
    ] as Point;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === "pen" || mode === "eraser") {
      (e.target as Element).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      const pt = getCoordinates(e);
      if (pt) setCurrentPoints([pt]);
      return;
    }

    if (mode === "pan") {
      (e.target as Element).setPointerCapture(e.pointerId);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (mode === "select") {
      setEditingTextId(null);
      setTexts((prev) => prev.filter((t) => t.text.trim() !== ""));
      return;
    }

    if (mode === "text") {
      e.preventDefault();
      const pt = getCoordinates(e);
      if (!pt) return;
      const newId = Date.now().toString();
      const newText: TextBox = {
        id: newId,
        x: pt[0],
        y: pt[1],
        text: "",
        fontSize,
        fontWeight,
        color,
      };
      saveState(strokes, texts);
      setTexts((prev) => [...prev, newText]);
      setEditingTextId(newId);
      setMode("select");

      setTimeout(() => {
        const el = document.getElementById(`text-${newId}`);
        if (el) el.focus();
      }, 50);
      return;
    }
  };

  const handleWrapperPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingTextId) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - camera.x) / camera.z;
      const mouseY = (e.clientY - rect.top - camera.y) / camera.z;

      setTexts((prev) =>
        prev.map((t) =>
          t.id === draggingTextId
            ? { ...t, x: mouseX - dragOffset.x, y: mouseY - dragOffset.y }
            : t,
        ),
      );
      return;
    }

    if (mode === "pan" && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setCamera((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (isDrawing && (mode === "pen" || mode === "eraser")) {
      const pt = getCoordinates(e as any);
      if (!pt) return;
      setCurrentPoints((prev) => [...prev, pt]);
    }
  };

  const handleWrapperPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingTextId) {
      // Before setting null, check if position actually changed, but for simplicity we rely on the drag starts
      setDraggingTextId(null);
    }

    if (mode === "pan") {
      setLastPanPoint(null);
    }

    if (isDrawing) {
      setIsDrawing(false);
      if (currentPoints.length > 0) {
        const newStroke: Stroke = {
          id: Date.now().toString(),
          points: currentPoints,
          mode: mode as "pen" | "eraser",
          color,
          size: lineWidth,
        };
        saveState(strokes, texts);
        setStrokes((prev) => [...prev, newStroke]);
        setCurrentPoints([]);
      }
    }
  };

  const handleTextPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    text: TextBox,
  ) => {
    e.stopPropagation();
    if (mode === "select" || mode === "text") {
      if (editingTextId === text.id) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - camera.x) / camera.z;
      const mouseY = (e.clientY - rect.top - camera.y) / camera.z;

      saveState(strokes, texts); // Save state before dragging starts
      setDraggingTextId(text.id);
      setDragOffset({ x: mouseX - text.x, y: mouseY - text.y });
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const lastState = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, { strokes, texts }]);
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokes(lastState.strokes);
    setTexts(lastState.texts);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, { strokes, texts }]);
    setRedoStack((prev) => prev.slice(0, -1));
    setStrokes(nextState.strokes);
    setTexts(nextState.texts);
  };

  const clearCanvas = () => {
    if (strokes.length === 0 && texts.length === 0) return;
    saveState(strokes, texts);
    setStrokes([]);
    setTexts([]);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const zoomSensitivity = 0.002;
    const deltaZ = -e.deltaY * zoomSensitivity;
    const newZ = Math.min(Math.max(camera.z + camera.z * deltaZ, 0.1), 10);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = newZ / camera.z;

    setCamera((prev) => ({
      x: mouseX - (mouseX - prev.x) * zoomFactor,
      y: mouseY - (mouseY - prev.y) * zoomFactor,
      z: newZ,
    }));
  };

  const updateStyle = (key: "fontSize" | "fontWeight" | "color", val: any) => {
    if (key === "fontSize") setFontSize(val);
    if (key === "fontWeight") setFontWeight(val);
    if (key === "color") setColor(val);

    if (editingTextId) {
      setTexts((prev) =>
        prev.map((t) => (t.id === editingTextId ? { ...t, [key]: val } : t)),
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
      // Ctrl+Y or Cmd+Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [strokes, texts, undoStack, redoStack]);

  useEffect(() => {
    const disableDefaultScroll = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", disableDefaultScroll, {
      passive: false,
    });
    return () =>
      document.removeEventListener("touchmove", disableDefaultScroll);
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-background touch-none"
      onPointerMove={isLoaded ? handleWrapperPointerMove : undefined}
      onPointerUp={isLoaded ? handleWrapperPointerUp : undefined}
      onPointerCancel={isLoaded ? handleWrapperPointerUp : undefined}
      onWheel={isLoaded ? handleWheel : undefined}
    >
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-xl shadow-sm border border-border/50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/home")}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="w-px h-6 bg-border mx-1"></div>
        <span className="text-sm font-medium px-2 flex items-center gap-2">
          {projectName}
          {isSaving && (
            <span title="Saving...">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            </span>
          )}
        </span>
      </div>

      {!isLoaded ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="absolute bottom-4 right-4 md:left-1/2 md:-translate-x-1/2 md:right-auto z-20 flex flex-wrap justify-center items-center gap-2 bg-background/80 backdrop-blur-sm p-2 rounded-xl shadow-sm border border-border/50">
            <Button
              variant={mode === "select" ? "default" : "ghost"}
              size="icon"
              onClick={() => setMode("select")}
              title="Select / Move"
            >
              <MousePointer2 className="w-4 h-4" />
            </Button>
            <Button
              variant={mode === "pan" ? "default" : "ghost"}
              size="icon"
              onClick={() => setMode("pan")}
              title="Pan (Drag canvas)"
            >
              <Hand className="w-4 h-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>
            <Button
              variant={mode === "pen" ? "default" : "ghost"}
              size="icon"
              onClick={() => setMode("pen")}
              title="Pen"
            >
              <Pen className="w-4 h-4" />
            </Button>
            <Button
              variant={mode === "eraser" ? "default" : "ghost"}
              size="icon"
              onClick={() => setMode("eraser")}
              title="Eraser"
            >
              <Eraser className="w-4 h-4" />
            </Button>
            <Button
              variant={mode === "text" ? "default" : "ghost"}
              size="icon"
              onClick={() => setMode("text")}
              title="Add Text"
            >
              <Type className="w-4 h-4" />
            </Button>

            <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>

            {(mode === "text" || mode === "select") && (
              <>
                <div className="flex bg-muted/50 rounded-lg p-1">
                  <Button
                    variant={fontSize === 16 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => updateStyle("fontSize", 16)}
                  >
                    S
                  </Button>
                  <Button
                    variant={fontSize === 24 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-sm"
                    onClick={() => updateStyle("fontSize", 24)}
                  >
                    M
                  </Button>
                  <Button
                    variant={fontSize === 36 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-base"
                    onClick={() => updateStyle("fontSize", 36)}
                  >
                    L
                  </Button>
                </div>
                <div className="flex bg-muted/50 rounded-lg p-1">
                  <Button
                    variant={fontWeight === 400 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 font-normal"
                    onClick={() => updateStyle("fontWeight", 400)}
                  >
                    Aa
                  </Button>
                  <Button
                    variant={fontWeight === 600 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 font-semibold"
                    onClick={() => updateStyle("fontWeight", 600)}
                  >
                    Aa
                  </Button>
                  <Button
                    variant={fontWeight === 700 ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 font-bold"
                    onClick={() => updateStyle("fontWeight", 700)}
                  >
                    Aa
                  </Button>
                </div>
                <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>
              </>
            )}

            <input
              type="color"
              value={color}
              onChange={(e) => updateStyle("color", e.target.value)}
              className="w-8 h-8 rounded shrink-0 cursor-pointer overflow-hidden border-none bg-transparent"
              title="Pick Color"
            />

            <div className="w-px h-6 bg-border mx-1 hidden sm:block"></div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
              disabled={undoStack.length === 0}
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRedo}
              title="Redo (Ctrl+Y)"
              disabled={redoStack.length === 0}
            >
              <Redo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearCanvas}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Clear Canvas"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div
            className="absolute inset-0 pointer-events-none opacity-50 dark:opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle, currentColor ${1 * camera.z}px, transparent ${1 * camera.z}px)`,
              backgroundPosition: `${camera.x}px ${camera.y}px`,
              backgroundSize: `${24 * camera.z}px ${24 * camera.z}px`,
              color: "oklch(0.5 0 0)",
            }}
          />

          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none pointer-events-auto"
            style={{
              cursor:
                mode === "pen"
                  ? cursors.pen
                  : mode === "eraser"
                    ? cursors.eraser
                    : mode === "pan" || lastPanPoint
                      ? lastPanPoint
                        ? cursors.panning
                        : cursors.pan
                      : mode === "text"
                        ? cursors.text
                        : cursors.select,
            }}
            onPointerDown={handlePointerDown}
          />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
              transformOrigin: "0 0",
            }}
          >
            {texts.map((text) => (
              <div
                key={text.id}
                className={`absolute pointer-events-auto ${mode === "select" ? "cursor-move" : ""}`}
                style={{
                  left: text.x,
                  top: text.y,
                  color: text.color,
                  fontSize: `${text.fontSize}px`,
                  fontWeight: text.fontWeight,
                }}
                onPointerDown={(e) => handleTextPointerDown(e, text)}
                onDoubleClick={() => setEditingTextId(text.id)}
              >
                {editingTextId === text.id ? (
                  <textarea
                    id={`text-${text.id}`}
                    autoFocus
                    value={text.text}
                    onChange={(e) =>
                      setTexts((prev) =>
                        prev.map((t) =>
                          t.id === text.id ? { ...t, text: e.target.value } : t,
                        ),
                      )
                    }
                    onBlur={() => {
                      // Ensure we don't save unchanged empty states
                      const trimmed = text.text.trim();
                      if (trimmed !== "") {
                        // Check if it's new text that was just created, or edited text
                        // Actually, we already saved state when we created it.
                        // Or save state here before modifying it completely. For simplicity let's just keep the new value as the current state since we pushed a state string create/drag time.
                      }

                      setEditingTextId(null);
                      if (trimmed === "") {
                        setTexts((prev) =>
                          prev.filter((t) => t.id !== text.id),
                        );
                        // we could technically pop the undo stack here if we wanted to be perfectly clean for "empty added then removed" text boxes, but it's an edge case.
                      }
                    }}
                    className="bg-transparent border border-primary/50 outline-none resize-none m-0 p-0 block pointer-events-auto"
                    style={{
                      fontSize: "inherit",
                      fontWeight: "inherit",
                      color: "inherit",
                      minWidth: "100px",
                      lineHeight: 1.2,
                      height: `${Math.max(1, (text.text.match(/\n/g) || []).length + 1) * 1.2 + 0.5}em`,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div
                    className="whitespace-pre-wrap leading-tight border border-transparent hover:border-primary/20 p-0 m-0"
                    style={{ minWidth: "20px", minHeight: "20px" }}
                  >
                    {text.text || " "}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
