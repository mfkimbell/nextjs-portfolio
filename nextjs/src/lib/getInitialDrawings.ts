import "server-only";
import { prisma } from "@/lib/prisma";

export type InitialDrawing = {
  id: string;
  name: string;
  strokes: unknown;
  canvasSize: number;
  canvasHeight: number | null;
  upvotes: number;
  createdAt: string;
};

export type InitialGalleryResponse = {
  drawings: InitialDrawing[];
  limit: number;
  weekWindowDays: number;
};

const SELECT = {
  id: true,
  name: true,
  strokes: true,
  canvasSize: true,
  canvasHeight: true,
  upvotes: true,
  createdAt: true,
} as const;

const EMPTY_INITIAL_GALLERY: InitialGalleryResponse = {
  drawings: [],
  limit: 3,
  weekWindowDays: 7,
};

export async function getInitialGallery(): Promise<InitialGalleryResponse> {
  try {
    const rows = await prisma.drawingSubmission.findMany({
      where: { hidden: false },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: SELECT,
    });

    return {
      drawings: rows.map((d) => ({
        id: d.id,
        name: d.name,
        strokes: d.strokes,
        canvasSize: d.canvasSize,
        canvasHeight: d.canvasHeight,
        upvotes: d.upvotes,
        createdAt: d.createdAt.toISOString(),
      })),
      limit: 3,
      weekWindowDays: 7,
    };
  } catch (error) {
    console.warn("[getInitialGallery] Could not load drawings; rendering empty gallery.", error);
    return EMPTY_INITIAL_GALLERY;
  }
}
