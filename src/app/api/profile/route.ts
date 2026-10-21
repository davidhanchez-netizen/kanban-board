import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { apiError, requireUser } from "../_utils";
import { publishWorkspaceEvent } from "../_pusher";
import { getDb } from "@/app/db";
import { userPreferences, users, workspaces, type UserSettings } from "@/app/db/schema";

const navigationItems = ["work", "agents", "strategy", "knowledge", "people"];
const defaultSettings: UserSettings = {
  browserNotifications: false,
  projectNotifications: true,
  emailNotifications: false,
  doNotDisturb: false,
  theme: "system",
  themeStyle: "aura",
  sidebarColor: "purple",
  language: "es",
  weekStartsOn: "monday",
  toastDuration: "normal",
  compactMode: false,
  colorBlindMode: false,
  showRowNumbers: false,
  navigationLabels: "icons-and-text",
  navigationOrder: navigationItems,
  extraCelebrations: false,
  recurringTasks: false,
  muteDueToday: false,
};

function parseSettings(value: unknown): UserSettings | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const legacyColor = source.sidebarColor === "indigo" || source.sidebarColor === "violet"
    ? "purple"
    : source.sidebarColor === "slate" ? "midnight" : source.sidebarColor;
  const settings = { ...defaultSettings, ...source, sidebarColor: legacyColor } as Record<string, unknown>;
  return (
    typeof settings.browserNotifications === "boolean" &&
      typeof settings.projectNotifications === "boolean" &&
      typeof settings.emailNotifications === "boolean" &&
      typeof settings.doNotDisturb === "boolean" &&
      ["system", "light", "dark"].includes(String(settings.theme)) &&
      ["aura", "cyberpunk", "forest", "sunset", "monochrome"].includes(String(settings.themeStyle)) &&
      ["midnight", "purple", "space-blue", "olive", "pink"].includes(String(settings.sidebarColor)) &&
      ["es", "en"].includes(String(settings.language)) &&
      ["monday", "sunday"].includes(String(settings.weekStartsOn)) &&
      ["short", "normal", "long"].includes(String(settings.toastDuration)) &&
      typeof settings.compactMode === "boolean" &&
      typeof settings.colorBlindMode === "boolean" &&
      typeof settings.showRowNumbers === "boolean" &&
      ["icons", "icons-and-text"].includes(String(settings.navigationLabels)) &&
      Array.isArray(settings.navigationOrder) &&
      settings.navigationOrder.length === navigationItems.length &&
      settings.navigationOrder.every((item) => typeof item === "string" && navigationItems.includes(item)) &&
      new Set(settings.navigationOrder).size === navigationItems.length &&
      typeof settings.extraCelebrations === "boolean" &&
      typeof settings.recurringTasks === "boolean" &&
      typeof settings.muteDueToday === "boolean"
  ) ? settings as UserSettings : null;
}

export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const db = getDb();
    const [profile] = await db
      .select({
        name: users.name,
        email: users.email,
        image: users.image,
        role: users.role,
        pronouns: userPreferences.pronouns,
        pronunciation: userPreferences.pronunciation,
        pronunciationAudio: userPreferences.pronunciationAudio,
        jobTitle: userPreferences.jobTitle,
        department: userPreferences.department,
        about: userPreferences.about,
        outOfOffice: userPreferences.outOfOffice,
        settings: userPreferences.settings,
      })
      .from(users)
      .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
      .where(eq(users.id, user.id))
      .limit(1);
    if (!profile) return Response.json({ error: "Profile not found." }, { status: 404 });
    return Response.json({
      profile: {
        ...profile,
        outOfOffice: profile.outOfOffice ?? false,
        settings: parseSettings(profile.settings) ?? defaultSettings,
        emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL)),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (response) return response;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Profile fields are required." }, { status: 400 });
    }

    const values = body as Record<string, unknown>;
    const textFields = ["name", "pronouns", "pronunciation", "jobTitle", "department", "about"] as const;
    for (const field of textFields) {
      const value = values[field];
      if (value !== undefined && (typeof value !== "string" || value.length > (field === "about" ? 2000 : 120))) {
        return Response.json({ error: `Invalid profile field: ${field}.` }, { status: 400 });
      }
    }
    if (values.name !== undefined && !(values.name as string).trim()) {
      return Response.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    if (
      values.outOfOffice !== undefined &&
      values.outOfOffice !== null &&
      typeof values.outOfOffice !== "boolean"
    ) {
      return Response.json({ error: "Out-of-office must be a boolean." }, { status: 400 });
    }
    const parsedSettings = values.settings === undefined ? undefined : parseSettings(values.settings);
    if (values.settings !== undefined && !parsedSettings) {
      return Response.json({ error: "One or more settings are invalid." }, { status: 400 });
    }
    if (values.image !== undefined) {
      if (
        values.image !== null &&
        (typeof values.image !== "string" ||
          !/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(values.image) ||
          Buffer.byteLength(values.image, "utf8") > 1_400_000)
      ) {
        return Response.json({ error: "Profile images must be JPEG, PNG, WebP, or GIF and smaller than 1 MB." }, { status: 400 });
      }
    }
    if (
      values.pronunciationAudio !== undefined &&
      values.pronunciationAudio !== null &&
      (typeof values.pronunciationAudio !== "string" ||
        !/^data:audio\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(values.pronunciationAudio) ||
        Buffer.byteLength(values.pronunciationAudio, "utf8") > 4_200_000)
    ) {
      return Response.json({ error: "Pronunciation audio must be a valid audio file smaller than 3 MB." }, { status: 400 });
    }
    if (!Object.keys(values).length) {
      return Response.json({ error: "No profile fields were provided." }, { status: 400 });
    }

    const db = getDb();
    const [existingUser] = await db
      .select({
        name: users.name,
        image: users.image,
        pronouns: userPreferences.pronouns,
        pronunciation: userPreferences.pronunciation,
        pronunciationAudio: userPreferences.pronunciationAudio,
        jobTitle: userPreferences.jobTitle,
        department: userPreferences.department,
        about: userPreferences.about,
        outOfOffice: userPreferences.outOfOffice,
      })
      .from(users)
      .leftJoin(userPreferences, eq(users.id, userPreferences.userId))
      .where(eq(users.id, user.id))
      .limit(1);
    const userUpdate: Partial<typeof users.$inferInsert> = {};
    if (typeof values.name === "string") userUpdate.name = values.name.trim();
    if (values.image === null || typeof values.image === "string") userUpdate.image = values.image;
    if (Object.keys(userUpdate).length) {
      await db.update(users).set(userUpdate).where(eq(users.id, user.id));
    }

    const preferenceUpdate: Partial<typeof userPreferences.$inferInsert> = { updatedAt: new Date() };
    if (typeof values.pronouns === "string") preferenceUpdate.pronouns = values.pronouns.trim() || null;
    if (typeof values.pronunciation === "string") preferenceUpdate.pronunciation = values.pronunciation.trim() || null;
    if (values.pronunciationAudio === null || typeof values.pronunciationAudio === "string") {
      preferenceUpdate.pronunciationAudio = values.pronunciationAudio;
    }
    if (typeof values.jobTitle === "string") preferenceUpdate.jobTitle = values.jobTitle.trim() || null;
    if (typeof values.department === "string") preferenceUpdate.department = values.department.trim() || null;
    if (typeof values.about === "string") preferenceUpdate.about = values.about.trim() || null;
    if (typeof values.outOfOffice === "boolean") preferenceUpdate.outOfOffice = values.outOfOffice;
    if (parsedSettings) preferenceUpdate.settings = parsedSettings;
    const [preference] = await db
      .insert(userPreferences)
      .values({ userId: user.id, ...preferenceUpdate })
      .onConflictDoUpdate({ target: userPreferences.userId, set: preferenceUpdate })
      .returning();
    const [updatedUser] = await db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const nameChanged = userUpdate.name !== undefined && userUpdate.name !== existingUser?.name;
    const imageChanged = userUpdate.image !== undefined && userUpdate.image !== existingUser?.image;
    const preferenceFieldsChanged = (
      [
        ["pronouns", existingUser?.pronouns],
        ["pronunciation", existingUser?.pronunciation],
        ["pronunciationAudio", existingUser?.pronunciationAudio],
        ["jobTitle", existingUser?.jobTitle],
        ["department", existingUser?.department],
        ["about", existingUser?.about],
      ] as const
    ).some(([field, previous]) => {
      const value = values[field];
      if (typeof value !== "string" && value !== null) return false;
      return (typeof value === "string" ? value.trim() || null : null) !== previous;
    });
    const outOfOfficeChanged =
      typeof values.outOfOffice === "boolean" &&
      values.outOfOffice !== (existingUser?.outOfOffice ?? false);
    if (nameChanged || imageChanged || preferenceFieldsChanged || outOfOfficeChanged) {
      const workspaceIds = await db.select({ id: workspaces.id }).from(workspaces);
      await Promise.all(workspaceIds.map(({ id }) =>
        publishWorkspaceEvent(id, "profile:updated", {
          user: {
            id: user.id,
            name: updatedUser.name,
            image: updatedUser.image?.startsWith("data:") ? null : updatedUser.image,
            imageStored: Boolean(updatedUser.image),
          },
        }),
      ));
    }
    revalidatePath("/");
    return Response.json({
      profile: {
        ...updatedUser,
        pronouns: preference.pronouns,
        pronunciation: preference.pronunciation,
        pronunciationAudio: preference.pronunciationAudio,
        jobTitle: preference.jobTitle,
        department: preference.department,
        about: preference.about,
        outOfOffice: preference.outOfOffice ?? false,
        emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL)),
        settings: parseSettings(preference.settings) ?? defaultSettings,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
