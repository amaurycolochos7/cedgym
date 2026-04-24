-- Generic per-workspace key/value settings table.
-- Backs admin-editable pricing knobs (plan overrides, add-on price)
-- without a migration per new key. `value` is JSONB so it can hold
-- numbers, strings, or nested objects interchangeably.

CREATE TABLE "workspace_settings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_settings_workspace_id_key_key" ON "workspace_settings"("workspace_id", "key");

CREATE INDEX "workspace_settings_workspace_id_idx" ON "workspace_settings"("workspace_id");

ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
