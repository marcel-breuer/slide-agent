CREATE TABLE "PresentationCollaborationOperation" (
  "id" TEXT NOT NULL,
  "presentationId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "sequence" SERIAL NOT NULL,
  "baseUpdatedAt" TIMESTAMP(3) NOT NULL,
  "command" JSONB NOT NULL,
  "resultUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PresentationCollaborationOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PresentationCollaborationOperation_presentationId_operationId_key"
  ON "PresentationCollaborationOperation"("presentationId", "operationId");
CREATE INDEX "PresentationCollaborationOperation_presentationId_sequence_idx"
  ON "PresentationCollaborationOperation"("presentationId", "sequence");
CREATE INDEX "PresentationCollaborationOperation_actorId_createdAt_idx"
  ON "PresentationCollaborationOperation"("actorId", "createdAt");

ALTER TABLE "PresentationCollaborationOperation"
  ADD CONSTRAINT "PresentationCollaborationOperation_presentationId_fkey"
  FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationCollaborationOperation"
  ADD CONSTRAINT "PresentationCollaborationOperation_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
