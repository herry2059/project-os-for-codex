// Core types for the project system and Git-backed audit trail.

export type ProjectStatus = 'active' | 'paused' | 'done';
export type ProjectHealth = 'green' | 'yellow' | 'red';

/** Kickoff card: the four required inputs for every new project. */
export interface KickoffCard {
  /** Intended user */
  forWhom: string;
  /** Desired outcome, described as what the user can do */
  goal: string;
  /** Acceptance criteria */
  acceptance: string[];
  /** Explicitly out of scope for this iteration */
  notDoing: string;
}

export interface Project {
  id: string;
  name: string;
  kickoff: KickoffCard;
  status: ProjectStatus;
  health: ProjectHealth;
  /** Progress percentage derived from the Git trail (0-100) */
  progress: number;
  /** Git repository URL populated after backend provisioning */
  repoUrl: string | null;
  /** Legacy assignee key name. New integrations should use the per-project secret. */
  keyName: string | null;
  /** Redacted project secret prefix; the full secret is shown only once after rotation */
  projectKeyPrefix?: string | null;
  /** Project context endpoint */
  projectContextUrl?: string | null;
  /** My next action on this project */
  nextStep: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One audit event maps to one Git commit. */
export interface ProjectEvent {
  id: string;
  projectId: string;
  at: string;
  actor: string;
  /** Credential used for the event; null for a human action */
  keyName: string | null;
  message: string;
  plainMessage: string | null;
  why: string | null;
  benefit: string | null;
  /** Agent-reported check, artifact, command result, or observed acceptance path */
  verification: string | null;
  stageIndex: number | null;
  nextStep: string | null;
  progressFrom: number | null;
  progressTo: number | null;
}

export interface CreateProjectInput {
  name: string;
  kickoff: KickoffCard;
  ownerName?: string;
}
