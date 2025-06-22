-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "strokes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
); 