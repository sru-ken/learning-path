import { useEffect, useState } from 'react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api.ts';
import type {
  ConceptWithProgress,
  CourseStatus,
  CourseSummary,
  DifficultyLevel,
  QuizOptionKey,
} from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import { Input, Label, SelectNative, Textarea } from './ui/input.tsx';

const COURSE_THUMBNAILS = [
  {
    label: 'Python & Graph Foundations',
    url: '/src/assets/images/course_python_programming_1794943596042.jpg',
  },
  {
    label: 'Data Structures & Trees',
    url: '/src/assets/images/course_data_structures_1794943595755.jpg',
  },
  {
    label: 'Applied Machine Learning',
    url: '/src/assets/images/course_applied_ml_1794943596741.jpg',
  },
];

interface CourseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCourse?: CourseSummary | null;
  onSaved: (courseId: string) => Promise<void>;
}

export function CourseFormModal({
  open,
  onOpenChange,
  existingCourse,
  onSaved,
}: CourseFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner');
  const [thumbnailUrl, setThumbnailUrl] = useState(COURSE_THUMBNAILS[0].url);
  const [duration, setDuration] = useState(120);
  const [passingScore, setPassingScore] = useState(75);
  const [status, setStatus] = useState<CourseStatus>('draft');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingCourse) {
      setTitle(existingCourse.title);
      setDescription(existingCourse.description);
      setCategory(existingCourse.category);
      setDifficulty(existingCourse.difficulty);
      setThumbnailUrl(existingCourse.thumbnail_url || COURSE_THUMBNAILS[0].url);
      setDuration(existingCourse.estimated_duration_minutes);
      setPassingScore(existingCourse.default_passing_score);
      setStatus(existingCourse.status);
    } else {
      setTitle('');
      setDescription('');
      setCategory('Computer Science');
      setDifficulty('beginner');
      setThumbnailUrl(COURSE_THUMBNAILS[0].url);
      setDuration(120);
      setPassingScore(75);
      setStatus('published');
    }
  }, [existingCourse, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (existingCourse) {
        await api.updateCourse(existingCourse.id, {
          title,
          description,
          category,
          difficulty,
          thumbnail_url: thumbnailUrl,
          estimated_duration_minutes: duration,
          default_passing_score: passingScore,
          status,
        });
        toast.success('Course settings updated.');
        onOpenChange(false);
        await onSaved(existingCourse.id);
      } else {
        const res = await api.createCourse({
          title,
          description,
          category,
          difficulty,
          thumbnail_url: thumbnailUrl,
          estimated_duration_minutes: duration,
          default_passing_score: passingScore,
          status,
        });
        toast.success('Course created.');
        onOpenChange(false);
        await onSaved(res.course.id);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save course.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingCourse ? 'Edit Course Settings' : 'Create New Course'}</DialogTitle>
          <DialogDescription>
            Configure course metadata, default mastery threshold, and publishing visibility.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="course-title">Course Title</Label>
            <Input
              id="course-title"
              required
              placeholder="e.g., Systems Programming in Rust"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="course-desc">Description</Label>
            <Textarea
              id="course-desc"
              required
              placeholder="Describe the learning outcomes and prerequisite structure..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="course-cat">Category</Label>
              <Input
                id="course-cat"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="course-diff">Difficulty</Label>
              <SelectNative
                id="course-diff"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </SelectNative>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="course-dur">Estimated Duration (min)</Label>
              <Input
                id="course-dur"
                type="number"
                min={10}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="course-pass">Passing Threshold (%)</Label>
              <Input
                id="course-pass"
                type="number"
                min={1}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="course-status">Publish Status</Label>
              <SelectNative
                id="course-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as CourseStatus)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </SelectNative>
            </div>
          </div>

          <div>
            <Label htmlFor="course-thumb">Course Cover Illustration</Label>
            <SelectNative
              id="course-thumb"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
            >
              {COURSE_THUMBNAILS.map((t) => (
                <option key={t.url} value={t.url}>
                  {t.label}
                </option>
              ))}
            </SelectNative>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : existingCourse ? 'Save Changes' : 'Create Course'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface AddConceptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  defaultPassingScore: number;
  onCreated: () => Promise<void>;
}

export function AddConceptModal({
  open,
  onOpenChange,
  courseId,
  defaultPassingScore,
  onCreated,
}: AddConceptModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [objectives, setObjectives] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner');
  const [minutes, setMinutes] = useState(25);
  const [passingScore, setPassingScore] = useState(defaultPassingScore);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonContent, setLessonContent] = useState('');
  const [lessonVideoUrl, setLessonVideoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setObjectives('');
      setDifficulty('beginner');
      setMinutes(25);
      setPassingScore(defaultPassingScore);
      setLessonTitle('');
      setLessonContent('');
      setLessonVideoUrl('');
    }
  }, [open, defaultPassingScore]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const objList = objectives
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await api.createConcept(courseId, {
        title,
        description,
        learning_objectives: objList,
        difficulty,
        estimated_minutes: minutes,
        passing_score: passingScore,
        lesson_title: lessonTitle || `${title} Guide`,
        lesson_content: lessonContent || description,
        lesson_video_url: lessonVideoUrl || undefined,
      });

      toast.success(
        `Concept "${title}" added (v${res.versionNumber}, ${res.affectedLearnerCount} learners notified).`,
      );
      onOpenChange(false);
      await onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create concept.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Concept Node</DialogTitle>
          <DialogDescription>
            Creates a new active concept with an initial lesson and mastery quiz.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="concept-title">Concept Title</Label>
            <Input
              id="concept-title"
              required
              placeholder="e.g., Dictionaries & Sets"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="concept-desc">Concept Description</Label>
            <Textarea
              id="concept-desc"
              required
              placeholder="What foundational idea does this concept teach?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="concept-obj">Learning Objectives (one per line)</Label>
            <Textarea
              id="concept-obj"
              placeholder="Lookup values in O(1) average time&#10;Handle missing keys with dict.get()"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="concept-diff">Difficulty</Label>
              <SelectNative
                id="concept-diff"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </SelectNative>
            </div>
            <div>
              <Label htmlFor="concept-mins">Duration (min)</Label>
              <Input
                id="concept-mins"
                type="number"
                min={5}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="concept-pass">Quiz Threshold (%)</Label>
              <Input
                id="concept-pass"
                type="number"
                min={1}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-xs font-semibold text-[#1E293B]">Initial Lesson Material</p>
            <div>
              <Label htmlFor="init-lesson-title">Lesson Title</Label>
              <Input
                id="init-lesson-title"
                placeholder="Optional — defaults to Concept Title Guide"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="init-lesson-content">Lesson Text</Label>
              <Textarea
                id="init-lesson-content"
                placeholder="Write concise explanation and code examples..."
                value={lessonContent}
                onChange={(e) => setLessonContent(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="init-lesson-video">External Video URL (optional)</Label>
              <Input
                id="init-lesson-video"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={lessonVideoUrl}
                onChange={(e) => setLessonVideoUrl(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Create Concept'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SplitConceptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  concept: ConceptWithProgress | null;
  onSplitComplete: (newChildIds: string[]) => Promise<void>;
}

interface ChildDraft {
  title: string;
  description: string;
  estimated_minutes: number;
  passing_score: number;
  lesson_title: string;
  lesson_content: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: QuizOptionKey;
}

export function SplitConceptModal({
  open,
  onOpenChange,
  concept,
  onSplitComplete,
}: SplitConceptModalProps) {
  const [chainSequentially, setChainSequentially] = useState(true);
  const [changeNote, setChangeNote] = useState('');
  const [children, setChildren] = useState<ChildDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (concept && open) {
      const halfMins = Math.max(10, Math.round(concept.estimated_minutes / 2));
      setChainSequentially(true);
      setChangeNote('');
      setChildren([
        {
          title: `${concept.title}: Part 1 (Foundations)`,
          description: `Core principles extracted from ${concept.title}.`,
          estimated_minutes: halfMins,
          passing_score: concept.passing_score,
          lesson_title: `${concept.title} — Part 1 Guide`,
          lesson_content: `Focused introduction and worked examples for Part 1 of ${concept.title}.`,
          question_text: `What is the primary concept covered in ${concept.title}: Part 1?`,
          option_a: 'Foundational syntax and core execution rules.',
          option_b: 'Unrelated hardware assembly directives.',
          option_c: 'Skipping prerequisite verification.',
          option_d: 'Deleting database audit trails.',
          correct_option: 'A',
        },
        {
          title: `${concept.title}: Part 2 (Applied Patterns)`,
          description: `Applied patterns and edge cases extracted from ${concept.title}.`,
          estimated_minutes: halfMins,
          passing_score: concept.passing_score,
          lesson_title: `${concept.title} — Part 2 Guide`,
          lesson_content: `Applied techniques and real-world exercises for Part 2 of ${concept.title}.`,
          question_text: `How does ${concept.title}: Part 2 build upon Part 1?`,
          option_a: 'It extends foundational rules into applied multi-step patterns.',
          option_b: 'It contradicts all syntax from Part 1.',
          option_c: 'It removes the need for loops or conditionals.',
          option_d: 'It executes without any parameters or inputs.',
          correct_option: 'A',
        },
      ]);
    }
  }, [concept, open]);

  if (!concept) return null;

  function updateChild(idx: number, patch: Partial<ChildDraft>) {
    setChildren((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept) return;
    setSubmitting(true);
    try {
      const res = await api.splitConcept(concept.id, {
        chain_sequentially: chainSequentially,
        change_description: changeNote || undefined,
        child_concepts: children.map((c) => ({
          title: c.title,
          description: c.description,
          learning_objectives: [`Master ${c.title}`],
          difficulty: concept.difficulty,
          estimated_minutes: c.estimated_minutes,
          passing_score: c.passing_score,
          lesson_title: c.lesson_title,
          lesson_content: c.lesson_content,
          questions: [
            {
              question_text: c.question_text,
              option_a: c.option_a,
              option_b: c.option_b,
              option_c: c.option_c,
              option_d: c.option_d,
              correct_option: c.correct_option,
              explanation: `Verified answer for ${c.title}.`,
            },
          ],
        })),
      });

      toast.success(
        `Concept split complete (v${res.versionNumber}). Original history preserved and ${res.affectedLearnerCount} learners notified.`,
      );
      onOpenChange(false);
      await onSplitComplete(res.splitConceptIds);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to split concept.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[#7C3AED]" />
            <span>Split Concept: {concept.title}</span>
          </DialogTitle>
          <DialogDescription>
            Retire the original concept while preserving 100% of learner quiz attempts and lesson
            completions. New child concepts require fresh mastery verification and notify all
            enrolled learners.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5 text-xs text-violet-950 space-y-2">
            <p className="font-semibold">Progress Preservation Guarantee</p>
            <p>
              All existing quiz attempts on <strong>{concept.title}</strong> remain permanently
              stored. Mastery is not silently transferred to newly created child concepts.
            </p>
            <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={chainSequentially}
                onChange={(e) => setChainSequentially(e.target.checked)}
                className="accent-[#7C3AED]"
              />
              <span>
                Chain child concepts sequentially (Child 1 → Child 2 → ...) instead of parallel
              </span>
            </label>
          </div>

          <div className="space-y-4">
            {children.map((child, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-[#FAFCFF] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-[#0F172A]">
                    Child Concept {idx + 1}
                  </span>
                  {children.length > 2 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setChildren((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label>Title</Label>
                    <Input
                      required
                      value={child.title}
                      onChange={(e) => updateChild(idx, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Duration (min) / Pass %</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={5}
                        value={child.estimated_minutes}
                        onChange={(e) =>
                          updateChild(idx, { estimated_minutes: Number(e.target.value) })
                        }
                      />
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={child.passing_score}
                        onChange={(e) =>
                          updateChild(idx, { passing_score: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Input
                    required
                    value={child.description}
                    onChange={(e) => updateChild(idx, { description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Lesson Content</Label>
                    <Textarea
                      required
                      value={child.lesson_content}
                      onChange={(e) => updateChild(idx, { lesson_content: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Mastery Quiz Question (Option A Correct by default)</Label>
                    <Input
                      required
                      value={child.question_text}
                      onChange={(e) => updateChild(idx, { question_text: e.target.value })}
                    />
                    <Input
                      required
                      placeholder="Correct Option A"
                      value={child.option_a}
                      onChange={(e) => updateChild(idx, { option_a: e.target.value })}
                    />
                    <Input
                      required
                      placeholder="Distractor Option B"
                      value={child.option_b}
                      onChange={(e) => updateChild(idx, { option_b: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setChildren((prev) => [
                  ...prev,
                  {
                    title: `${concept.title}: Part ${prev.length + 1}`,
                    description: `Focused sub-topic ${prev.length + 1}`,
                    estimated_minutes: 15,
                    passing_score: concept.passing_score,
                    lesson_title: `${concept.title} — Part ${prev.length + 1}`,
                    lesson_content: `Lesson guide for Part ${prev.length + 1}.`,
                    question_text: `Key principle in Part ${prev.length + 1}?`,
                    option_a: 'Correct application of this concept.',
                    option_b: 'Unrelated distractor.',
                    option_c: 'Incorrect statement.',
                    option_d: 'Invalid syntax.',
                    correct_option: 'A',
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Another Child Concept</span>
            </Button>
          </div>

          <div>
            <Label htmlFor="split-note">Change Log Description (optional)</Label>
            <Input
              id="split-note"
              placeholder="Explain why this concept was split for learners and version logs..."
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="violet" disabled={submitting}>
              {submitting ? 'Splitting & Migrating...' : 'Confirm Transactional Split'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
