"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

export type UserSettings = {
  browserNotifications: boolean;
  projectNotifications: boolean;
  emailNotifications: boolean;
  doNotDisturb: boolean;
  theme: "system" | "light" | "dark";
  sidebarColor: "indigo" | "slate" | "violet";
  language: "es" | "en";
  weekStartsOn: "monday" | "sunday";
  toastDuration: "short" | "normal" | "long";
  compactMode: boolean;
  colorBlindMode: boolean;
  showRowNumbers: boolean;
  navigationLabels: "icons" | "icons-and-text";
  navigationOrder: string[];
  extraCelebrations: boolean;
  recurringTasks: boolean;
  muteDueToday: boolean;
};

type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "ADMIN" | "MEMBER";
  pronouns: string | null;
  pronunciation: string | null;
  pronunciationAudio: string | null;
  jobTitle: string | null;
  department: string | null;
  about: string | null;
  outOfOffice: boolean;
  settings: UserSettings;
};

type Workspace = { id: number; name: string };
export type SettingsTab = "profile" | "notifications" | "account" | "appearance" | "navigation" | "experimental";
type Tab = SettingsTab;

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "profile", label: "Perfil", icon: "◉" },
  { id: "notifications", label: "Notificaciones", icon: "♧" },
  { id: "account", label: "Cuenta y espacios", icon: "▣" },
  { id: "appearance", label: "Pantalla y apariencia", icon: "◐" },
  { id: "navigation", label: "Navegación", icon: "☷" },
  { id: "experimental", label: "Funciones experimentales", icon: "✦" },
];

const navigationLabels: Record<string, string> = {
  work: "Trabajo",
  agents: "Agentes",
  strategy: "Estrategia",
  knowledge: "Conocimientos",
  people: "Personas",
};

async function profileRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/profile", {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo guardar el perfil.");
  return result;
}

function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <div><p className="text-sm font-medium text-slate-800">{label}</p>{description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}</div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-indigo-600" : "bg-slate-300"}`}
      ><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} /></button>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="form-control">
        {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
      </select>
    </label>
  );
}

export function SettingsModal({
  workspaces,
  initialTab = "profile",
  onClose,
  onProfileUpdated,
}: {
  workspaces: Workspace[];
  initialTab?: SettingsTab;
  onClose: () => void;
  onProfileUpdated: (profile: Pick<UserProfile, "id" | "name" | "image" | "settings">) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [avatarInputKey, setAvatarInputKey] = useState(0);
  const orderedTabs = useMemo(() => tabs, []);

  useEffect(() => {
    let active = true;
    profileRequest<{ profile: UserProfile }>()
      .then(({ profile: result }) => {
        if (!active) return;
        setProfile(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el perfil.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profile) return;
    document.documentElement.dataset.theme = profile.settings.theme;
    document.documentElement.dataset.sidebarColor = profile.settings.sidebarColor;
    document.documentElement.dataset.compact = String(profile.settings.compactMode);
  }, [profile]);

  function updateField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((current) => current ? { ...current, [key]: value } : current);
    setSaved(false);
  }

  function updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setProfile((current) => current ? {
      ...current,
      settings: { ...current.settings, [key]: value },
    } : current);
    setSaved(false);
  }

  async function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 1024 * 1024) {
      setError("El avatar debe ser JPEG, PNG, WebP o GIF y pesar menos de 1 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateField("image", reader.result);
    };
    reader.onerror = () => setError("No se pudo leer la imagen seleccionada.");
    reader.readAsDataURL(file);
  }

  async function selectPronunciationAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !profile) return;
    if (!file.type.startsWith("audio/") || file.size > 3 * 1024 * 1024) {
      setError("El audio debe ser un archivo válido y pesar menos de 3 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateField("pronunciationAudio", reader.result);
    };
    reader.onerror = () => setError("No se pudo leer el audio seleccionado.");
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await profileRequest<{ profile: UserProfile }>({
        method: "PATCH",
        body: JSON.stringify({
          name: profile.name ?? "",
          image: profile.image,
          pronouns: profile.pronouns ?? "",
          pronunciation: profile.pronunciation ?? "",
          pronunciationAudio: profile.pronunciationAudio,
          jobTitle: profile.jobTitle ?? "",
          department: profile.department ?? "",
          about: profile.about ?? "",
          outOfOffice: profile.outOfOffice,
          settings: profile.settings,
        }),
      });
      setProfile(result.profile);
      onProfileUpdated({
        id: result.profile.id,
        name: result.profile.name,
        image: result.profile.image,
        settings: result.profile.settings,
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  function moveNavigation(index: number, direction: -1 | 1) {
    if (!profile) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= profile.settings.navigationOrder.length) return;
    const nextOrder = [...profile.settings.navigationOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    updateSetting("navigationOrder", nextOrder);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50 p-4 sm:w-56 sm:border-r sm:border-b-0 sm:p-5">
          <div className="mb-4 flex items-center justify-between sm:mb-8">
            <h2 id="settings-title" className="text-base font-bold text-slate-900">Ajustes</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar ajustes" className="rounded-md p-1 text-slate-500 hover:bg-slate-200 sm:hidden">×</button>
          </div>
          <nav aria-label="Secciones de ajustes" className="flex gap-1 overflow-x-auto sm:block sm:space-y-1">
            {orderedTabs.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition sm:w-full sm:text-sm ${tab === item.id ? "bg-indigo-100 text-indigo-800" : "text-slate-600 hover:bg-slate-200/70"}`}>
                <span aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="hidden items-center justify-between border-b border-slate-100 px-7 py-5 sm:flex">
            <div><h3 className="text-lg font-semibold text-slate-900">{tabs.find((item) => item.id === tab)?.label}</h3><p className="mt-1 text-xs text-slate-500">Personaliza tu experiencia de trabajo.</p></div>
            <button type="button" onClick={onClose} aria-label="Cerrar ajustes" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {loading && <p className="text-sm text-slate-500">Cargando ajustes...</p>}
            {!loading && !profile && <p role="alert" className="text-sm text-rose-600">{error || "No se pudo cargar el perfil."}</p>}
            {!loading && profile && <>
              {tab === "profile" && <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-4">
                  {profile.image ? <Image src={profile.image} alt="Avatar de perfil" width={72} height={72} unoptimized className="size-[72px] rounded-full border border-slate-200 object-cover" /> : <div className="flex size-[72px] items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">{profile.name?.[0]?.toUpperCase() ?? "U"}</div>}
                  <div><p className="text-sm font-semibold text-slate-800">Foto de perfil</p><p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP o GIF; máximo 1 MB.</p><div className="mt-2 flex gap-2"><label className="button-secondary cursor-pointer !px-3 !py-1.5 text-xs">Subir foto<input key={avatarInputKey} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(event) => void selectAvatar(event)} /></label>{profile.image && <button type="button" onClick={() => { updateField("image", null); setAvatarInputKey((key) => key + 1); }} className="text-xs font-medium text-rose-600">Eliminar</button>}</div></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Nombre completo</span><input className="form-control" maxLength={120} value={profile.name ?? ""} onChange={(event) => updateField("name", event.target.value)} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Pronombres</span><input className="form-control" maxLength={120} value={profile.pronouns ?? ""} onChange={(event) => updateField("pronouns", event.target.value)} placeholder="Ella / Él / Elle" /></label>
                  <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Pronunciación del nombre (guía fonética)</span><input className="form-control" maxLength={120} value={profile.pronunciation ?? ""} onChange={(event) => updateField("pronunciation", event.target.value)} placeholder="Escribe cómo se pronuncia" /></label>
                  <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Puesto</span><input className="form-control" maxLength={120} value={profile.jobTitle ?? ""} onChange={(event) => updateField("jobTitle", event.target.value)} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Departamento / equipo</span><input className="form-control" maxLength={120} value={profile.department ?? ""} onChange={(event) => updateField("department", event.target.value)} /></label>
                  <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Correo electrónico (Google)</span><input className="form-control bg-slate-50" readOnly value={profile.email ?? ""} /></label>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-600">Audio de pronunciación</p>
                  <p className="mt-1 text-xs text-slate-500">Sube un audio de hasta 3 MB para ayudar al equipo a pronunciar tu nombre.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="button-secondary cursor-pointer !px-3 !py-1.5 text-xs">Subir audio<input type="file" accept="audio/*" className="sr-only" onChange={(event) => void selectPronunciationAudio(event)} /></label>
                    {profile.pronunciationAudio && <><audio controls preload="none" src={profile.pronunciationAudio} className="h-9 max-w-full" /><button type="button" onClick={() => updateField("pronunciationAudio", null)} className="text-xs font-medium text-rose-600">Eliminar audio</button></>}
                  </div>
                </div>
                <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Acerca de mí</span><textarea className="form-control resize-y" maxLength={2000} rows={4} value={profile.about ?? ""} onChange={(event) => updateField("about", event.target.value)} /></label>
                <Toggle label="Aviso de ausencia" description="Indica a tu equipo que estás fuera de la oficina." checked={profile.outOfOffice} onChange={(value) => updateField("outOfOffice", value)} />
              </div>}

              {tab === "notifications" && <div className="divide-y divide-slate-100">
                <Toggle label="Notificaciones del navegador" description="Preferencia guardada; el permiso del navegador aún debe activarse." checked={profile.settings.browserNotifications} onChange={(value) => updateSetting("browserNotifications", value)} />
                <Toggle label="Notificaciones de proyectos y objetivos" checked={profile.settings.projectNotifications} onChange={(value) => updateSetting("projectNotifications", value)} />
                <Toggle label="Notificaciones por correo electrónico" checked={profile.settings.emailNotifications} onChange={(value) => updateSetting("emailNotifications", value)} />
                <Toggle label="No molestar" description="Guarda la preferencia para futuras notificaciones." checked={profile.settings.doNotDisturb} onChange={(value) => updateSetting("doNotDisturb", value)} />
                <div className="py-4"><p className="text-sm font-semibold text-slate-800">Integraciones</p><p className="mt-1 text-xs text-slate-500">Slack y Microsoft Teams no están conectados en este proyecto.</p><div className="mt-3 flex gap-2"><button type="button" disabled className="button-secondary opacity-50">Conectar Slack</button><button type="button" disabled className="button-secondary opacity-50">Conectar Teams</button></div></div>
              </div>}

              {tab === "account" && <div className="space-y-5">
                <section><h4 className="text-sm font-semibold text-slate-800">Organizaciones y espacios</h4><div className="mt-3 space-y-2">{workspaces.map((workspace) => <div key={workspace.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5"><span className="text-sm text-slate-700">{workspace.name}</span><span className="text-xs text-slate-400">Espacio compartido</span></div>)}</div></section>
                <section className="rounded-xl border border-slate-200 p-4"><h4 className="text-sm font-semibold text-slate-800">Correo asociado</h4><p className="mt-1 text-sm text-slate-600">{profile.email ?? "Sin correo"}</p><p className="mt-1 text-xs text-slate-500">La cuenta se administra mediante Google OAuth.</p></section>
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h4 className="text-sm font-semibold text-amber-900">Seguridad y cuenta</h4><p className="mt-1 text-xs leading-5 text-amber-800">Cerrar otras sesiones y desactivar o eliminar cuentas requiere un flujo de seguridad del servidor que aún no existe. Estas acciones no están habilitadas para evitar cambios no seguros.</p></section>
              </div>}

              {tab === "appearance" && <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Tema" value={profile.settings.theme} onChange={(value) => updateSetting("theme", value as UserSettings["theme"])} options={[["system", "Sincronizar con el sistema"], ["light", "Claro"], ["dark", "Oscuro"]]} />
                <SelectField label="Color del menú" value={profile.settings.sidebarColor} onChange={(value) => updateSetting("sidebarColor", value as UserSettings["sidebarColor"])} options={[["indigo", "Índigo"], ["slate", "Gris"], ["violet", "Violeta"]]} />
                <SelectField label="Idioma" value={profile.settings.language} onChange={(value) => updateSetting("language", value as UserSettings["language"])} options={[["es", "Español"], ["en", "English"]]} />
                <SelectField label="Primer día de la semana" value={profile.settings.weekStartsOn} onChange={(value) => updateSetting("weekStartsOn", value as UserSettings["weekStartsOn"])} options={[["monday", "Lunes"], ["sunday", "Domingo"]]} />
                <SelectField label="Duración de avisos" value={profile.settings.toastDuration} onChange={(value) => updateSetting("toastDuration", value as UserSettings["toastDuration"])} options={[["short", "Corta"], ["normal", "Normal"], ["long", "Larga"]]} />
                <div className="sm:col-span-2"><Toggle label="Modo compacto" checked={profile.settings.compactMode} onChange={(value) => updateSetting("compactMode", value)} /><Toggle label="Modo para daltonismo" description="Preferencia guardada; la paleta accesible aún no está implementada." checked={profile.settings.colorBlindMode} onChange={(value) => updateSetting("colorBlindMode", value)} /><Toggle label="Mostrar números de filas" checked={profile.settings.showRowNumbers} onChange={(value) => updateSetting("showRowNumbers", value)} /></div>
              </div>}

              {tab === "navigation" && <div className="space-y-5">
                <SelectField label="Etiquetas de navegación" value={profile.settings.navigationLabels} onChange={(value) => updateSetting("navigationLabels", value as UserSettings["navigationLabels"])} options={[["icons-and-text", "Ícono y texto"], ["icons", "Solo ícono"]]} />
                <div><p className="text-sm font-semibold text-slate-800">Orden de navegación</p><p className="mb-3 mt-1 text-xs text-slate-500">Usa las flechas para reordenar las secciones.</p><ol className="space-y-2">{profile.settings.navigationOrder.map((item, index) => <li key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"><span className="flex-1 text-sm text-slate-700">{navigationLabels[item] ?? item}</span><button type="button" aria-label={`Mover ${navigationLabels[item]} arriba`} disabled={!index} onClick={() => moveNavigation(index, -1)} className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">↑</button><button type="button" aria-label={`Mover ${navigationLabels[item]} abajo`} disabled={index === profile.settings.navigationOrder.length - 1} onClick={() => moveNavigation(index, 1)} className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">↓</button></li>)}</ol></div>
              </div>}

              {tab === "experimental" && <div>
                <Toggle label="Alegría extra / celebraciones" checked={profile.settings.extraCelebrations} onChange={(value) => updateSetting("extraCelebrations", value)} />
                <Toggle label="Tareas recurrentes" description="Preferencia guardada; la programación recurrente aún no está implementada." checked={profile.settings.recurringTasks} onChange={(value) => updateSetting("recurringTasks", value)} />
                <Toggle label="Silenciar avisos de entregas de hoy" checked={profile.settings.muteDueToday} onChange={(value) => updateSetting("muteDueToday", value)} />
              </div>}
            </>}
            {error && profile && <p role="alert" className="mt-4 text-xs text-rose-600">{error}</p>}
            {saved && <p role="status" className="mt-4 text-xs font-medium text-emerald-700">Ajustes guardados.</p>}
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-7">
            <button type="button" onClick={onClose} className="button-secondary">Cerrar</button>
            <button type="button" onClick={() => void save()} disabled={loading || saving || !profile} className="button-primary">{saving ? "Guardando..." : "Guardar cambios"}</button>
          </footer>
        </div>
      </section>
    </div>
  );
}
