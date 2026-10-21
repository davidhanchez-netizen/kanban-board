DO $$
DECLARE
  principal_workspace_id integer;
  principal_workspace_name text;
BEGIN
  SELECT "id", "name" INTO principal_workspace_id, principal_workspace_name
  FROM "workspaces"
  WHERE "is_private" = false
  ORDER BY "id"
  LIMIT 1;

  IF principal_workspace_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "board_columns" WHERE "workspace_id" = principal_workspace_id
  ) THEN
    INSERT INTO "board_columns" ("name", "workspace", "workspace_id", "position")
    VALUES
      ('Por hacer', principal_workspace_name, principal_workspace_id, 0),
      ('En progreso', principal_workspace_name, principal_workspace_id, 1),
      ('Hecho', principal_workspace_name, principal_workspace_id, 2);
  END IF;
END $$;
