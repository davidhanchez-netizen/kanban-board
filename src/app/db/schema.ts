import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const priorityEnum = pgEnum("task_priority", ["high", "medium", "low"]);

export const columns = pgTable("board_columns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  workspace: text("workspace").notNull().default("Producto"),
  position: integer("position").notNull().default(0),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  priority: priorityEnum("priority").notNull().default("medium"),
  columnId: integer("column_id")
    .notNull()
    .references(() => columns.id, { onDelete: "restrict" }),
  assignee: text("assignee").notNull().default("You"),
  completed: boolean("completed").notNull().default(false),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Column = typeof columns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
