CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMembership" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamInvitation" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "TeamRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "invitedById" TEXT NOT NULL,
  "acceptedById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMembershipAuditLog" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "actorId" TEXT,
  "subjectUserId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMembershipAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD COLUMN "teamId" TEXT;

CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");
CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");
CREATE INDEX "Team_createdById_idx" ON "Team"("createdById");
CREATE INDEX "TeamMembership_userId_revokedAt_idx" ON "TeamMembership"("userId", "revokedAt");
CREATE INDEX "TeamMembership_teamId_role_revokedAt_idx" ON "TeamMembership"("teamId", "role", "revokedAt");
CREATE INDEX "TeamInvitation_teamId_status_expiresAt_idx" ON "TeamInvitation"("teamId", "status", "expiresAt");
CREATE INDEX "TeamInvitation_email_status_idx" ON "TeamInvitation"("email", "status");
CREATE INDEX "TeamMembershipAuditLog_teamId_createdAt_idx" ON "TeamMembershipAuditLog"("teamId", "createdAt");
CREATE INDEX "TeamMembershipAuditLog_subjectUserId_createdAt_idx" ON "TeamMembershipAuditLog"("subjectUserId", "createdAt");
CREATE INDEX "Project_teamId_archivedAt_idx" ON "Project"("teamId", "archivedAt");

ALTER TABLE "Team" ADD CONSTRAINT "Team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamMembershipAuditLog" ADD CONSTRAINT "TeamMembershipAuditLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembershipAuditLog" ADD CONSTRAINT "TeamMembershipAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
