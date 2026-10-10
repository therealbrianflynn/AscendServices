"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ROLE_LABELS } from "@/lib/admin/managed-user";
import type { AdminUserView } from "@/lib/admin/users";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

import { UsersGrid } from "../users-grid";

interface Draft {
  name: string;
  email: string;
  role: AppRole;
  bio: string;
  phone: string;
  services: string[];
  validated: boolean;
  active: boolean;
}

const EMPTY: Draft = {
  name: "",
  email: "",
  role: "REQUESTER",
  bio: "",
  phone: "",
  services: [],
  validated: false,
  active: true,
};

const FIELD =
  "mt-1 w-full rounded-xl border border-ascend-navy/15 bg-white px-3 py-2 text-ascend-navy";

function draftFrom(user: AdminUserView): Draft {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    bio: user.bio,
    phone: user.phone,
    services: user.services_provided,
    validated: user.validated,
    active: user.active,
  };
}

function messageFor(code: string): string {
  if (code === "email_taken") return "That email already belongs to someone else.";
  if (code === "last_admin") return "The ministry needs at least one active admin.";
  if (code === "self_deactivate") return "You can't deactivate your own account.";
  if (code === "not_found") return "That person is no longer on the list.";
  return "Check the name, email, access level, and services, then try again.";
}

export function UserManager({
  users,
  services,
  actorId,
}: {
  users: AdminUserView[];
  services: string[];
  actorId: string;
}) {
  const router = useRouter();
  const detailRef = useRef<HTMLFormElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const editingSelf = editingId === actorId;

  function showDetail() {
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function startAdd() {
    setEditingId(null);
    setDraft(EMPTY);
    setError(null);
    setNotice(null);
    showDetail();
  }

  function startEdit(user: AdminUserView) {
    setEditingId(user.id);
    setDraft(draftFrom(user));
    setError(null);
    setNotice(null);
    showDetail();
  }

  function toggleService(service: string) {
    setDraft((current) => ({
      ...current,
      services: current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service],
    }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        editingId ? `/api/admin/users/${editingId}` : "/api/admin/users",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        emailSent?: boolean;
      } | null;
      if (!response.ok) {
        setError(messageFor(body?.error ?? ""));
        return;
      }
      if (!editingId) {
        setNotice(
          body?.emailSent
            ? "Account added. A sign-in link was emailed."
            : "Account added. The sign-in email could not be sent — they can request one from the sign-in page.",
        );
        setDraft(EMPTY);
      } else {
        setNotice(draft.active ? "Changes saved." : "Account deactivated.");
      }
      router.refresh();
    } catch {
      setError("That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="people-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="people-heading" className="text-xl font-semibold text-ascend-navy">
              People
            </h2>
            <p className="mt-1 text-sm text-ascend-taupe">
              Sort any column, or search across every field. Choose a person to edit them.
            </p>
          </div>
          <button
            type="button"
            onClick={startAdd}
            className="rounded-full bg-ascend-navy px-4 py-2.5 text-sm font-semibold text-white"
          >
            Add person
          </button>
        </div>
        <UsersGrid users={users} selectedId={editingId} onSelect={startEdit} />
      </section>

      <form
        ref={detailRef}
        onSubmit={onSubmit}
        className="rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto"
      >
        <h2 className="text-xl font-semibold text-ascend-navy">
          {editingId ? "Edit person" : "Add a person"}
        </h2>
        <label className="mt-4 block text-sm font-semibold text-ascend-navy">
          Name
          <input
            className={FIELD}
            value={draft.name}
            maxLength={80}
            required
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-ascend-navy">
          Email
          <input
            type="email"
            className={FIELD}
            value={draft.email}
            required
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-ascend-navy">
          Phone number
          <input
            type="tel"
            autoComplete="tel"
            className={FIELD}
            value={draft.phone}
            maxLength={20}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
        </label>
        <label className="mt-4 block text-sm font-semibold text-ascend-navy">
          Access level
          <select
            className={FIELD}
            value={draft.role}
            onChange={(event) =>
              setDraft({ ...draft, role: event.target.value as AppRole })
            }
          >
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm text-ascend-taupe">
          Admins manage the ministry. Servers offer help and, once validated, open
          the Help Wanted board. Requesters are the people we are serving.
        </p>
        <label className="mt-4 block text-sm font-semibold text-ascend-navy">
          Bio
          <textarea
            className={FIELD}
            value={draft.bio}
            maxLength={500}
            rows={3}
            onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
          />
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-ascend-navy">Ways they can serve</legend>
          <div className="mt-2 grid gap-2">
            {services.map((service) => (
              <label key={service} className="flex items-center gap-2 text-sm text-ascend-navy">
                <input
                  type="checkbox"
                  checked={draft.services.includes(service)}
                  onChange={() => toggleService(service)}
                />
                {service}
              </label>
            ))}
          </div>
        </fieldset>
        {draft.role === "SERVER" ? (
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ascend-navy">
            <input
              type="checkbox"
              checked={draft.validated}
              onChange={(event) => setDraft({ ...draft, validated: event.target.checked })}
            />
            Validated server — may open the Help Wanted board
          </label>
        ) : null}
        {editingId ? (
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ascend-navy">
            <input
              type="checkbox"
              checked={draft.active}
              disabled={editingSelf}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
            />
            Active account
          </label>
        ) : null}
        {editingSelf ? (
          <p className="mt-2 text-sm text-ascend-taupe">
            You can't deactivate your own account.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-4 text-sm text-ascend-navy">
            {notice}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ascend-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add person"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={startAdd}
              className="rounded-full border border-ascend-navy/15 bg-white px-4 py-2.5 text-sm font-semibold text-ascend-navy"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
