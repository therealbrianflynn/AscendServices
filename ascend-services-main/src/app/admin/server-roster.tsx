"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminUserView } from "@/lib/admin/users";

export function ServerRoster({ users }: { users: AdminUserView[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setValidated(user: AdminUserView, validated: boolean) {
    if (busyId) return;
    setBusyId(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/validation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validated }),
      });
      if (!response.ok) {
        setError("That change could not be saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("That change could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-3xl bg-white shadow-md ring-1 ring-ascend-navy/5">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Servers and whether they may open the Help Wanted board</caption>
        <thead className="bg-ascend-bg text-ascend-navy">
          <tr>
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold">Board access</th>
            <th className="px-4 py-3 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const open = user.role === "ADMIN" || user.validated;
            return (
              <tr key={user.id} className="border-t border-ascend-navy/10">
                <td className="px-4 py-3">{user.name}</td>
                <td className="px-4 py-3">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3">{open ? "Open" : "Waiting"}</td>
                <td className="px-4 py-3">
                  {user.role === "SERVER" ? (
                    <button
                      type="button"
                      disabled={busyId === user.id}
                      onClick={() => setValidated(user, !user.validated)}
                      className="rounded-full bg-ascend-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {user.validated ? "Remove validation" : "Validate server"}
                    </button>
                  ) : (
                    <span className="text-ascend-navy/50">Admin</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? <p role="alert" className="px-4 py-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
