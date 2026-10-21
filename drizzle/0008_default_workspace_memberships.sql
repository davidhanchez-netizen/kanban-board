DO $$
DECLARE
  principal_workspace_id integer;
BEGIN
  SELECT "id" INTO principal_workspace_id
  FROM "workspaces"
  WHERE "is_private" = false
  ORDER BY "id"
  LIMIT 1;

  IF principal_workspace_id IS NULL THEN
    INSERT INTO "workspaces" ("name", "description", "icon", "color", "is_private")
    VALUES ('General / Primer Proyecto', 'Workspace principal para organizar el trabajo.', 'briefcase', '#4f46e5', false)
    ON CONFLICT ("name") DO NOTHING;

    SELECT "id" INTO principal_workspace_id
    FROM "workspaces"
    WHERE "is_private" = false
    ORDER BY "id"
    LIMIT 1;
  END IF;

  IF principal_workspace_id IS NOT NULL THEN
    INSERT INTO "workspace_members" ("workspace_id", "user_id")
    SELECT principal_workspace_id, "id" FROM "users"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
