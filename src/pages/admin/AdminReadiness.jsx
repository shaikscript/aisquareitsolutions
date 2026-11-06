import React, { useState } from 'react';
import { BadgeCheck, Plus, Settings2, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Confirm,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Metre,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../../components/ui.jsx';
import { api, formatDate, initials, titleCase } from '../../lib/api.js';
import { useFetch } from '../../lib/hooks.js';
import { useToast } from '../../context/AppContext.jsx';

const STATUSES = ['not_ready', 'in_preparation', 'pending_approval', 'approved', 'revoked'];

export default function AdminReadiness() {
  const { data, loading, error, reload } = useFetch('/api/admin/readiness');
  const { data: directory } = useFetch('/api/admin/directory');
  const { data: projectData, reload: reloadProjects } = useFetch('/api/admin/projects');
  const { toast } = useToast();

  const [decision, setDecision] = useState(null);
  const [status, setStatus] = useState('approved');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectEditor, setProjectEditor] = useState(null);

  const projects = data?.projects || [];
  const assessments = directory?.assessments || [];

  const saveDecision = async () => {
    setBusy(true);
    try {
      await api('/api/admin/readiness/decision', {
        method: 'POST',
        body: { projectId: decision.projectId, userId: decision.userId, status, notes },
      });
      toast(`Readiness set to ${titleCase(status)}.`, 'ok');
      setDecision(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveProject = async () => {
    setBusy(true);
    const body = {
      name: projectEditor.name,
      clientNote: projectEditor.clientNote,
      description: projectEditor.description,
      approvalMode: projectEditor.approvalMode,
      status: projectEditor.status,
      requirements: projectEditor.requirements
        .filter((requirement) => requirement.assessmentId)
        .map((requirement) => ({
          assessmentId: Number(requirement.assessmentId),
          minimumPercentage: Number(requirement.minimumPercentage) || null,
        })),
    };
    try {
      if (projectEditor.id) {
        await api(`/api/admin/projects/${projectEditor.id}`, { method: 'PUT', body });
        toast('Project updated.', 'ok');
      } else {
        await api('/api/admin/projects', { method: 'POST', body });
        toast('Project created.', 'ok');
      }
      setProjectEditor(null);
      reloadProjects();
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const openProject = (project) => {
    setProjectEditor(
      project
        ? {
            id: project.id,
            name: project.name,
            clientNote: project.clientNote || '',
            description: project.description || '',
            approvalMode: project.approvalMode,
            status: project.status,
            requirements: project.requirements.map((requirement) => ({
              assessmentId: requirement.assessmentId,
              minimumPercentage: requirement.minimumPercentage || 75,
            })),
          }
        : {
            name: '',
            clientNote: '',
            description: '',
            approvalMode: 'automatic',
            status: 'active',
            requirements: [{ assessmentId: '', minimumPercentage: 75 }],
          }
    );
  };

  if (loading) return <Loading label="Loading readiness…" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <>
      <PageHeader
        eyebrow="Project gates"
        title="Readiness"
        description="Automatic gates clear people when linked assessment thresholds are met. Manual projects wait for an administrator decision. Every change is recorded."
        actions={
          <Button variant="primary" size="sm" icon={Plus} onClick={() => openProject(null)}>
            New project
          </Button>
        }
      />

      <div className="grid-2" style={{ marginBottom: 18 }}>
        {(projectData?.projects || []).map((project) => (
          <div className="card card--pad" key={project.id} style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{project.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--faint)', marginTop: 3 }}>
                  {titleCase(project.approvalMode)} gate · {project.requirements.length} requirement{project.requirements.length === 1 ? '' : 's'}
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => openProject(project)} title="Edit project">
                <Settings2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!projectData?.projects?.length ? (
          <div className="banner"><BadgeCheck size={15} /> No projects yet — create one to start gating readiness.</div>
        ) : null}
      </div>

      <div className="stack gap-4">
        {projects.map((project) => (
          <section className="panel" key={project.id}>
            <div className="panel__head">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="panel__title">{project.name}</span>
                  <Badge tone={project.approvalMode === 'manual' ? 'violet' : 'default'}>
                    {project.approvalMode === 'manual' ? 'Manual' : 'Automatic'}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--faint)', marginTop: 4 }}>
                  {project.requirements.map((req) => `${req.title} ≥ ${req.minimumPercentage ?? req.passing_percentage}%`).join(' · ') || 'No thresholds'}
                </div>
              </div>
              <Badge>{project.people.length} people</Badge>
            </div>

            <div className="list">
              {project.people.map((person) => (
                <div className="list__row" key={person.userId}>
                  <span className="avatar avatar--sm">{initials(person.name)}</span>
                  <div className="list__main">
                    <div className="list__title">
                      {person.name}
                      <span style={{ fontSize: '0.7rem', color: 'var(--ghost)' }}>{person.code}</span>
                      <StatusBadge status={person.status} />
                    </div>
                    <div className="list__sub">
                      {person.scores.length
                        ? person.scores.map((score) => (
                            <span key={score.assessmentId} style={{ color: score.met ? 'var(--mint)' : undefined }}>
                              {score.title}: {score.best == null ? '—' : `${score.best}%`} / {score.minimum}%
                            </span>
                          ))
                        : 'No linked scores'}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDecision({ projectId: project.id, userId: person.userId, name: person.name, project: project.name });
                      setStatus(person.status);
                      setNotes(person.notes || '');
                    }}
                  >
                    Decide
                  </Button>
                </div>
              ))}
              {!project.people.length ? (
                <EmptyState
                  icon={BadgeCheck}
                  title="No readiness records"
                  description="Records appear once a person is linked to this project (via an assessment attempt or a manual decision)."
                />
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={`Readiness decision · ${decision?.name || ''}`}
        subtitle={decision?.project}
        size="narrow"
        footer={
          <>
            <Button variant="quiet" onClick={() => setDecision(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={saveDecision} loading={busy}>Record decision</Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="New status" htmlFor="d-status">
            <Select id="d-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>{titleCase(value)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reason / note" hint="Shown in the employee's decision history." htmlFor="d-notes">
            <Textarea id="d-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <div className="banner">
            <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: '0.79rem' }}>Manual decisions persist even when an automatic gate later re-evaluates this project.</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(projectEditor)}
        onClose={() => setProjectEditor(null)}
        title={projectEditor?.id ? 'Edit project' : 'New project'}
        subtitle="Link assessments and set the score thresholds that define readiness."
        size="wide"
        footer={
          <>
            <Button variant="quiet" onClick={() => setProjectEditor(null)} disabled={busy}>Cancel</Button>
            <Button variant="iris" onClick={saveProject} loading={busy}>Save project</Button>
          </>
        }
      >
        {projectEditor ? (
          <div className="form-grid">
            <Field label="Project name" required htmlFor="pr-name">
              <Input id="pr-name" value={projectEditor.name} onChange={(e) => setProjectEditor((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <div className="field-row">
              <Field label="Client note" htmlFor="pr-client">
                <Input id="pr-client" value={projectEditor.clientNote} onChange={(e) => setProjectEditor((p) => ({ ...p, clientNote: e.target.value }))} />
              </Field>
              <Field label="Approval mode" htmlFor="pr-mode">
                <Select id="pr-mode" value={projectEditor.approvalMode} onChange={(e) => setProjectEditor((p) => ({ ...p, approvalMode: e.target.value }))}>
                  <option value="automatic">Automatic (threshold based)</option>
                  <option value="manual">Manual approval</option>
                </Select>
              </Field>
            </div>
            <Field label="Description" htmlFor="pr-desc">
              <Textarea id="pr-desc" rows={2} value={projectEditor.description} onChange={(e) => setProjectEditor((p) => ({ ...p, description: e.target.value }))} />
            </Field>
            <Field label="Status" htmlFor="pr-status">
              <Select id="pr-status" value={projectEditor.status} onChange={(e) => setProjectEditor((p) => ({ ...p, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>

            <div className="field">
              <span className="label">Assessment requirements</span>
              <div className="stack gap-2">
                {projectEditor.requirements.map((requirement, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Select
                      value={requirement.assessmentId}
                      onChange={(event) =>
                        setProjectEditor((prev) => {
                          const requirements = [...prev.requirements];
                          requirements[index] = { ...requirements[index], assessmentId: event.target.value };
                          return { ...prev, requirements };
                        })
                      }
                      style={{ flex: 2, minWidth: 180 }}
                    >
                      <option value="">Choose assessment…</option>
                      {assessments.map((assessment) => (
                        <option key={assessment.id} value={assessment.id}>{assessment.title}</option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={requirement.minimumPercentage}
                      onChange={(event) =>
                        setProjectEditor((prev) => {
                          const requirements = [...prev.requirements];
                          requirements[index] = { ...requirements[index], minimumPercentage: event.target.value };
                          return { ...prev, requirements };
                        })
                      }
                      style={{ width: 90 }}
                      aria-label="Minimum percentage"
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--faint)' }}>%</span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setProjectEditor((prev) => ({
                          ...prev,
                          requirements: prev.requirements.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    setProjectEditor((prev) => ({
                      ...prev,
                      requirements: [...prev.requirements, { assessmentId: '', minimumPercentage: 75 }],
                    }))
                  }
                >
                  + Add requirement
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
