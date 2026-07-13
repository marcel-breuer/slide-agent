"use client";

/* global HTMLFormElement */

import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { ArrowLeft, Loader2, Plus, Shield, UserMinus, Users } from "lucide-react";

import { Button, ButtonLink, PageHeader, ui } from "./ui";

type TeamSummary = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  memberCount?: number;
  projectCount?: number;
  createdAt: string;
};

type TeamDetail = TeamSummary & {
  members: Array<{
    id: string;
    role: TeamSummary["role"];
    user: { id: string; email: string; displayName: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: TeamSummary["role"];
    expiresAt: string;
  }>;
  auditEvents: Array<{ id: string; action: string; createdAt: string }>;
};

type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function TeamsWorkspace({ teamId }: { teamId?: string }): ReactElement {
  return teamId ? <TeamDetailWorkspace teamId={teamId} /> : <TeamListWorkspace />;
}

function TeamListWorkspace(): ReactElement {
  const [name, setName] = useState("");
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function loadTeams(): Promise<void> {
    const response = await fetch("/api/teams");
    const payload = (await response.json()) as ApiResponse<TeamSummary[]>;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Teams could not be loaded." : payload.error.message);
      return;
    }
    setTeams(payload.data);
  }

  useEffect(() => {
    void loadTeams();
  }, []);

  async function createTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/teams", {
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as ApiResponse<TeamSummary>;
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Team could not be created." : payload.error.message);
        return;
      }
      setTeams((current) => [payload.data, ...current]);
      setName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Team could not be created.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className={ui.pageShell}>
      <PageHeader eyebrow="Workspace" title="Teams" />
      {error ? <div className={ui.alert}>{error}</div> : null}
      <form className={ui.form} onSubmit={(event) => void createTeam(event)}>
        <div className={ui.field}>
          <label htmlFor="team-name">Team name</label>
          <input className={ui.input} id="team-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        </div>
        <Button type="submit" variant="primary" disabled={isCreating}>
          {isCreating ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
          Create team
        </Button>
      </form>
      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>Your teams</h2>
        {teams.length === 0 ? <p className={ui.empty}>No teams yet.</p> : (
          <ul className={ui.list}>
            {teams.map((team) => (
              <li className={ui.item} key={team.id}>
                <div className={ui.itemMain}>
                  <div className={ui.itemTitle}><Users size={18} />{team.name}</div>
                  <p className={ui.itemMeta}>{team.role.toLowerCase()} · {team.memberCount ?? 0} members · {team.projectCount ?? 0} projects</p>
                </div>
                <ButtonLink href={`/app/teams/${encodeURIComponent(team.id)}`}>Manage</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function TeamDetailWorkspace({ teamId }: { teamId: string }): ReactElement {
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "EDITOR" | "VIEWER">("EDITOR");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadTeam(): Promise<void> {
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}`);
    const payload = (await response.json()) as ApiResponse<TeamDetail>;
    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Team could not be loaded." : payload.error.message);
      return;
    }
    setTeam(payload.data);
    setName(payload.data.name);
  }

  useEffect(() => {
    void loadTeam();
  }, [teamId]);

  async function renameTeam(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, {
      body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" }, method: "PATCH",
    });
    const payload = (await response.json()) as ApiResponse<{ id: string; name: string }>;
    if (!response.ok || !payload.ok) setError(payload.ok ? "Team could not be renamed." : payload.error.message);
    else setTeam((current) => current ? { ...current, name: payload.data.name } : current);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setInviteToken(null);
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/invitations`, {
      body: JSON.stringify({ email, role }), headers: { "Content-Type": "application/json" }, method: "POST",
    });
    const payload = (await response.json()) as ApiResponse<{ token: string }>;
    if (!response.ok || !payload.ok) setError(payload.ok ? "Invitation could not be created." : payload.error.message);
    else { setInviteToken(payload.data.token); setEmail(""); await loadTeam(); }
  }

  async function updateMember(userId: string, nextRole: TeamSummary["role"]): Promise<void> {
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
      body: JSON.stringify({ role: nextRole, userId }), headers: { "Content-Type": "application/json" }, method: "PATCH",
    });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!response.ok || !payload.ok) setError(payload.ok ? "Member could not be updated." : payload.error.message);
    else await loadTeam();
  }

  async function removeMember(userId: string): Promise<void> {
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
      body: JSON.stringify({ userId }), headers: { "Content-Type": "application/json" }, method: "DELETE",
    });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!response.ok || !payload.ok) setError(payload.ok ? "Member could not be removed." : payload.error.message);
    else await loadTeam();
  }

  async function revokeInvitation(invitationId: string): Promise<void> {
    const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
    const payload = (await response.json()) as ApiResponse<unknown>;
    if (!response.ok || !payload.ok) setError(payload.ok ? "Invitation could not be revoked." : payload.error.message);
    else await loadTeam();
  }

  if (!team) return <section className={ui.pageShell}><p className={ui.empty}>Loading team…</p>{error ? <div className={ui.alert}>{error}</div> : null}</section>;
  const canManage = team.role === "OWNER" || team.role === "ADMIN";

  return (
    <section className={ui.pageShell}>
      <ButtonLink href="/app/teams"><ArrowLeft size={16} /> All teams</ButtonLink>
      <PageHeader eyebrow="Workspace" title={team.name} />
      {error ? <div className={ui.alert}>{error}</div> : null}
      {canManage ? <form className={ui.form} onSubmit={(event) => void renameTeam(event)}><div className={ui.field}><label htmlFor="rename-team">Team name</label><input className={ui.input} id="rename-team" value={name} onChange={(event) => setName(event.target.value)} /></div><Button type="submit" variant="secondary">Save name</Button></form> : null}
      {canManage ? <form className={ui.form} onSubmit={(event) => void inviteMember(event)}><div className={ui.field}><label htmlFor="invite-email">Invite by email</label><input className={ui.input} id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className={ui.field}><label htmlFor="invite-role">Role</label><select className={ui.input} id="invite-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option>{team.role === "OWNER" ? <option value="ADMIN">Admin</option> : null}</select></div><Button type="submit" variant="primary"><Plus size={17} /> Create invitation</Button></form> : null}
      {inviteToken ? <div className={ui.alert}>Invitation token: <code className="break-all">{inviteToken}</code></div> : null}
      <section className={ui.section}><h2 className={ui.sectionTitle}><Shield size={18} /> Members</h2><ul className={ui.list}>{team.members.map((member) => <li className={ui.item} key={member.id}><div className={ui.itemMain}><strong>{member.user.displayName}</strong><span className={ui.itemMeta}>{member.user.email}</span></div>{member.role === "OWNER" ? <span className={ui.badge}>Owner</span> : canManage ? <div className="flex gap-2"><select className={ui.input} value={member.role} onChange={(event) => void updateMember(member.user.id, event.target.value as TeamSummary["role"])}><option value="ADMIN">Admin</option><option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option></select><button className={ui.iconButton} type="button" title="Remove member" onClick={() => void removeMember(member.user.id)}><UserMinus size={17} /></button></div> : <span className={ui.badge}>{member.role.toLowerCase()}</span>}</li>)}</ul></section>
      {team.invitations.length > 0 ? <section className={ui.section}><h2 className={ui.sectionTitle}>Pending invitations</h2><ul className={ui.list}>{team.invitations.map((invitation) => <li className={ui.item} key={invitation.id}><div className={ui.itemMain}><strong>{invitation.email}</strong><span className={ui.itemMeta}>{invitation.role.toLowerCase()} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div>{canManage ? <button className={ui.iconButton} type="button" onClick={() => void revokeInvitation(invitation.id)}>Revoke</button> : null}</li>)}</ul></section> : null}
      <section className={ui.section}><h2 className={ui.sectionTitle}>Membership history</h2><ul className={ui.list}>{team.auditEvents.map((event) => <li className={ui.item} key={event.id}><span>{event.action}</span><span className={ui.itemMeta}>{new Date(event.createdAt).toLocaleString()}</span></li>)}</ul></section>
    </section>
  );
}
