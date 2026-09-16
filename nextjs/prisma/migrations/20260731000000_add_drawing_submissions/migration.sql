-- CreateTable
CREATE TABLE "DrawingSubmission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strokes" JSONB NOT NULL,
    "canvasSize" INTEGER NOT NULL DEFAULT 384,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingSubmission_hidden_createdAt_idx" ON "DrawingSubmission"("hidden", "createdAt");

-- CreateIndex
CREATE INDEX "DrawingSubmission_hidden_upvotes_createdAt_idx" ON "DrawingSubmission"("hidden", "upvotes", "createdAt");
