export type ProjectVisibility = "public" | "private";
export type ProjectView = "board" | "list" | "overview";

export interface Project {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  isPrivate: boolean;
  createdBy: string | null;
  createdAt: string;
  memberIds: string[];
  memberEmails: string[];
}

export interface ProjectMember {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export type TaskAssignee = User;

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
}

export interface Comment {
  id: number;
  taskId: number;
  userId: string;
  content: string;
  isActivity: boolean;
  createdAt: string;
  userName: string;
  userImage: string | null;
}

export interface ActivityLog extends Comment {
  isActivity: true;
}
