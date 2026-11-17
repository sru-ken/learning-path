import { useEffect, useState } from 'react';
import {
  GitBranch,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api.ts';
import type {
  ConceptWithProgress,
  DifficultyLevel,
  PrerequisiteEdge,
  QuizOptionKey,
} from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Input, Label, SelectNative, Textarea } from './ui/input.tsx';

interface InstructorConceptInspectorProps {
  courseId: string;
  concept: ConceptWithProgress;
  allConcepts: ConceptWithProgress[];
  prerequisites: PrerequisiteEdge[];
  onRefreshCourse: () => Promise<void>;
  onOpenSplitModal: () => void;
}

export function InstructorConceptInspector({
  courseId,
  concept,
  allConcepts,
  prerequisites,
  onRefreshCourse,
  onOpenSplitModal,
}: InstructorConceptInspectorProps) {
  const [title, setTitle] = useState(concept.title);
  const [description, setDescription] = useState(concept.description);
  const [objectivesText, setObjectivesText] = useState(concept.learning_objectives.join('\n'));
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(concept.difficulty);
  const [estimatedMinutes, setEstimatedMinutes] = useState(concept.estimated_minutes);
  const [passingScore, setPassingScore] = useState(concept.passing_score);
  const [savingConcept, setSavingConcept] = useState(false);

  // Add prerequisite dropdown
  const [prereqCandidateId, setPrereqCandidateId] = useState('');
  const [addingEdge, setAddingEdge] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);

  // New lesson state
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonContent, setNewLessonContent] = useState('');
  const [newLessonVideo, setNewLessonVideo] = useState('');
  const [newLessonMins, setNewLessonMins] = useState(15);

  // Inline lesson edit
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [editLessonContent, setEditLessonContent] = useState('');
  const [editLessonVideo, setEditLessonVideo] = useState('');
  const [editLessonMins, setEditLessonMins] = useState(15);

  // Quiz question editor
  const [showQuizEditor, setShowQuizEditor] = useState(false);
  const [quizPassingScore, setQuizPassingScore] = useState(concept.passing_score);
  const [questionsDraft, setQuestionsDraft] = useState(concept.quiz?.questions ?? []);

  useEffect(() => {
    setTitle(concept.title);
    setDescription(concept.description);
    setObjectivesText(concept.learning_objectives.join('\n'));
    setDifficulty(concept.difficulty);
    setEstimatedMinutes(concept.estimated_minutes);
    setPassingScore(concept.passing_score);
    setQuizPassingScore(concept.quiz?.passing_score ?? concept.passing_score);
    setQuestionsDraft(concept.quiz?.questions ?? []);
    setEdgeError(null);
    setPrereqCandidateId('');
    setShowAddLesson(false);
    setEditingLessonId(null);
    setShowQuizEditor(false);
  }, [concept]);

  const activeOthers = allConcepts.filter(
    (c) => c.status === 'active' && c.id !== concept.id,
  );
  const currentPrereqEdges = prerequisites.filter(
    (e) => e.dependent_concept_id === concept.id,
  );
  const currentPrereqIds = new Set(currentPrereqEdges.map((e) => e.prerequisite_concept_id));
  const availablePrereqCandidates = activeOthers.filter((c) => !currentPrereqIds.has(c.id));

  async function handleSaveConcept(e: React.FormEvent) {
    e.preventDefault();
    setSavingConcept(true);
    try {
      await api.updateConcept(concept.id, {
        title,
        description,
        learning_objectives: objectivesText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        difficulty,
        estimated_minutes: estimatedMinutes,
        passing_score: passingScore,
      });
      toast.success('Concept updated.');
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update concept.');
    } finally {
      setSavingConcept(false);
    }
  }

  async function handleAddPrereqEdge() {
    if (!prereqCandidateId) return;
    setAddingEdge(true);
    setEdgeError(null);
    try {
      const res = await api.addPrerequisite(courseId, prereqCandidateId, concept.id);
      toast.success(
        `Prerequisite linked (v${res.versionNumber}, ${res.affectedLearnerCount} learners notified).`,
      );
      setPrereqCandidateId('');
      await onRefreshCourse();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to add prerequisite.';
      setEdgeError(msg);
      toast.error(msg);
    } finally {
      setAddingEdge(false);
    }
  }

  async function handleRemoveEdge(edgeId: string) {
    try {
      const res = await api.removePrerequisite(courseId, edgeId);
      toast.success(`Prerequisite removed (v${res.versionNumber}).`);
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove link.');
    }
  }

  async function handleDeleteOrRetireConcept() {
    try {
      const res = await api.deleteConcept(concept.id);
      toast.success(
        res.retired
          ? `Concept "${concept.title}" retired (learner history preserved, v${res.versionNumber}).`
          : `Concept "${concept.title}" deleted (v${res.versionNumber}).`,
      );
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove concept.');
    }
  }

  async function handleCreateLesson(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createLesson(concept.id, {
        title: newLessonTitle,
        content: newLessonContent,
        video_url: newLessonVideo || undefined,
        duration_minutes: newLessonMins,
      });
      toast.success('Lesson added.');
      setNewLessonTitle('');
      setNewLessonContent('');
      setNewLessonVideo('');
      setShowAddLesson(false);
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add lesson.');
    }
  }

  async function handleSaveEditedLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLessonId) return;
    try {
      await api.updateLesson(editingLessonId, {
        title: editLessonTitle,
        content: editLessonContent,
        video_url: editLessonVideo || null,
        duration_minutes: editLessonMins,
      });
      toast.success('Lesson updated.');
      setEditingLessonId(null);
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update lesson.');
    }
  }

  async function handleDeleteLesson(lessonId: string) {
    try {
      await api.deleteLesson(lessonId);
      toast.success('Lesson deleted.');
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete lesson.');
    }
  }

  async function handleSaveQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!concept.quiz) return;
    try {
      await api.updateQuiz(concept.quiz.id, {
        passing_score: quizPassingScore,
        questions: questionsDraft.map((q) => ({
          id: q.id,
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_option: q.correct_option ?? 'A',
          explanation: q.explanation ?? '',
        })),
      });
      toast.success('Quiz updated.');
      setShowQuizEditor(false);
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save quiz.');
    }
  }

  const isRetired = concept.status !== 'active';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{concept.title}</CardTitle>
              <CardDescription className="capitalize">
                Status: {concept.status} · {concept.difficulty}
              </CardDescription>
            </div>
            {!isRetired && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="violet" onClick={onOpenSplitModal}>
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>Split Concept</span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteOrRetireConcept}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Retire / Delete</span>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {!isRetired && (
            <form onSubmit={handleSaveConcept} className="space-y-3">
              <div>
                <Label>Concept Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Learning Objectives (1 per line)</Label>
                <Textarea
                  value={objectivesText}
                  onChange={(e) => setObjectivesText(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Difficulty</Label>
                  <SelectNative
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </SelectNative>
                </div>
                <div>
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={estimatedMinutes}
                    onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Pass %</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={passingScore}
                    onChange={(e) => setPassingScore(Number(e.target.value))}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={savingConcept}>
                <Save className="h-3.5 w-3.5" />
                <span>{savingConcept ? 'Saving...' : 'Save Concept Details'}</span>
              </Button>
            </form>
          )}

          {/* Prerequisite Manager */}
          {!isRetired && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-[#0F172A]">
                Direct Prerequisites for "{concept.title}"
              </p>

              {currentPrereqEdges.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No prerequisites (root concept — unlocked by default for learners).
                </p>
              ) : (
                <div className="space-y-1.5">
                  {currentPrereqEdges.map((edge) => {
                    const prereq = allConcepts.find((c) => c.id === edge.prerequisite_concept_id);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-[#0F172A]">
                          {prereq?.title ?? edge.prerequisite_concept_id} → {concept.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEdge(edge.id)}
                          className="text-red-600 hover:underline font-medium cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {availablePrereqCandidates.length > 0 && (
                <div className="flex items-center gap-2">
                  <SelectNative
                    value={prereqCandidateId}
                    onChange={(e) => setPrereqCandidateId(e.target.value)}
                  >
                    <option value="">Select prerequisite concept...</option>
                    {availablePrereqCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </SelectNative>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!prereqCandidateId || addingEdge}
                    onClick={handleAddPrereqEdge}
                  >
                    Add Link
                  </Button>
                </div>
              )}

              {edgeError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  {edgeError}
                </div>
              )}
            </div>
          )}

          {/* Lessons Management */}
          {!isRetired && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#0F172A]">
                  Lessons ({concept.lessons.length})
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddLesson((s) => !s)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Lesson</span>
                </Button>
              </div>

              {showAddLesson && (
                <form
                  onSubmit={handleCreateLesson}
                  className="rounded-lg border border-slate-200 bg-[#FAFCFF] p-3 space-y-2.5"
                >
                  <Input
                    required
                    placeholder="Lesson title"
                    value={newLessonTitle}
                    onChange={(e) => setNewLessonTitle(e.target.value)}
                  />
                  <Textarea
                    required
                    placeholder="Lesson body / code examples..."
                    value={newLessonContent}
                    onChange={(e) => setNewLessonContent(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="url"
                      placeholder="Video URL (optional)"
                      value={newLessonVideo}
                      onChange={(e) => setNewLessonVideo(e.target.value)}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={newLessonMins}
                      onChange={(e) => setNewLessonMins(Number(e.target.value))}
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Save New Lesson
                  </Button>
                </form>
              )}

              <div className="space-y-2">
                {concept.lessons.map((l) =>
                  editingLessonId === l.id ? (
                    <form
                      key={l.id}
                      onSubmit={handleSaveEditedLesson}
                      className="rounded-lg border border-blue-200 bg-[#F5F8FF] p-3 space-y-2"
                    >
                      <Input
                        required
                        value={editLessonTitle}
                        onChange={(e) => setEditLessonTitle(e.target.value)}
                      />
                      <Textarea
                        required
                        value={editLessonContent}
                        onChange={(e) => setEditLessonContent(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="url"
                          placeholder="Video URL"
                          value={editLessonVideo}
                          onChange={(e) => setEditLessonVideo(e.target.value)}
                        />
                        <Input
                          type="number"
                          min={1}
                          value={editLessonMins}
                          onChange={(e) => setEditLessonMins(Number(e.target.value))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm">
                          Update Lesson
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingLessonId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-[#0F172A]">{l.title}</p>
                        <p className="text-slate-500 tabular-nums">{l.duration_minutes} min</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLessonId(l.id);
                            setEditLessonTitle(l.title);
                            setEditLessonContent(l.content);
                            setEditLessonVideo(l.video_url ?? '');
                            setEditLessonMins(l.duration_minutes);
                          }}
                          className="text-[#2563EB] hover:underline font-medium cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLesson(l.id)}
                          className="text-red-600 hover:underline font-medium cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {/* Quiz Questions Editor */}
          {!isRetired && concept.quiz && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#0F172A]">
                  Mastery Quiz ({concept.quiz.questions.length} questions · Pass{' '}
                  {concept.quiz.passing_score}%)
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowQuizEditor((s) => !s)}
                >
                  {showQuizEditor ? 'Close Quiz Editor' : 'Edit Quiz Questions'}
                </Button>
              </div>

              {showQuizEditor && (
                <form onSubmit={handleSaveQuiz} className="space-y-3">
                  <div>
                    <Label>Passing Score (%)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={quizPassingScore}
                      onChange={(e) => setQuizPassingScore(Number(e.target.value))}
                    />
                  </div>
                  {questionsDraft.map((q, qIdx) => (
                    <div
                      key={q.id || qIdx}
                      className="rounded-lg border border-slate-200 bg-[#FAFCFF] p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Question {qIdx + 1}</span>
                        {questionsDraft.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setQuestionsDraft((prev) =>
                                prev.filter((_, idx) => idx !== qIdx),
                              )
                            }
                            className="text-red-600 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <Input
                        required
                        placeholder="Question text"
                        value={q.question_text}
                        onChange={(e) =>
                          setQuestionsDraft((prev) =>
                            prev.map((item, idx) =>
                              idx === qIdx ? { ...item, question_text: e.target.value } : item,
                            ),
                          )
                        }
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          required
                          placeholder="Option A"
                          value={q.option_a}
                          onChange={(e) =>
                            setQuestionsDraft((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, option_a: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <Input
                          required
                          placeholder="Option B"
                          value={q.option_b}
                          onChange={(e) =>
                            setQuestionsDraft((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, option_b: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <Input
                          required
                          placeholder="Option C"
                          value={q.option_c}
                          onChange={(e) =>
                            setQuestionsDraft((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, option_c: e.target.value } : item,
                              ),
                            )
                          }
                        />
                        <Input
                          required
                          placeholder="Option D"
                          value={q.option_d}
                          onChange={(e) =>
                            setQuestionsDraft((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, option_d: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <SelectNative
                          value={q.correct_option ?? 'A'}
                          onChange={(e) =>
                            setQuestionsDraft((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx
                                  ? { ...item, correct_option: e.target.value as QuizOptionKey }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="A">Correct: A</option>
                          <option value="B">Correct: B</option>
                          <option value="C">Correct: C</option>
                          <option value="D">Correct: D</option>
                        </SelectNative>
                        <div className="col-span-2">
                          <Input
                            placeholder="Explanation shown after attempt"
                            value={q.explanation ?? ''}
                            onChange={(e) =>
                              setQuestionsDraft((prev) =>
                                prev.map((item, idx) =>
                                  idx === qIdx ? { ...item, explanation: e.target.value } : item,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setQuestionsDraft((prev) => [
                          ...prev,
                          {
                            id: `new-${Date.now()}`,
                            quiz_id: concept.quiz!.id,
                            question_text: '',
                            option_a: '',
                            option_b: '',
                            option_c: '',
                            option_d: '',
                            correct_option: 'A',
                            explanation: '',
                            order_index: prev.length + 1,
                          },
                        ])
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Question</span>
                    </Button>
                    <Button type="submit" size="sm">
                      Save Quiz Changes
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
