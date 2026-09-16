-- Add optional canvasHeight column so rectangular drawings can be stored.
-- Legacy square rows leave this null and render at 1:1 (canvasSize x canvasSize).
ALTER TABLE "DrawingSubmission" ADD COLUMN "canvasHeight" INTEGER;
