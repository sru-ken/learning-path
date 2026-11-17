import crypto from 'node:crypto';
import { db, nowIso, withTransaction } from './db.ts';
import { hashPassword } from './auth.ts';
import { snapshotCourseStructure } from './curriculumService.ts';
import type { DifficultyLevel, QuizOptionKey } from '../src/types/learnpath.ts';

interface SeedConcept {
  key: string;
  title: string;
  description: string;
  objectives: string[];
  difficulty: DifficultyLevel;
  estimatedMinutes: number;
  passingScore: number;
  orderIndex: number;
  posX: number;
  posY: number;
  lessons: Array<{
    title: string;
    content: string;
    videoUrl: string;
    durationMinutes: number;
  }>;
  questions: Array<{
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: QuizOptionKey;
    explanation: string;
  }>;
}

export function seedDemoDatabase(): void {
  const existingUserCount = db
    .prepare('SELECT COUNT(*) AS cnt FROM profiles')
    .get() as { cnt: number };

  if (Number(existingUserCount.cnt) > 0) {
    return;
  }

  withTransaction(() => {
    const ts = nowIso();

    const instructorId = 'prof-elena-vance';
    const learnerAlexId = 'learner-alex-rivera';
    const learnerMayaId = 'learner-maya-chen';

    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      instructorId,
      'dr.elena@learnpath.edu',
      hashPassword('Instructor123!'),
      'Dr. Elena Vance',
      'instructor',
      ts,
      ts,
    );

    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      learnerAlexId,
      'alex.rivera@student.edu',
      hashPassword('Learner123!'),
      'Alex Rivera',
      'learner',
      ts,
      ts,
    );

    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      learnerMayaId,
      'maya.chen@student.edu',
      hashPassword('Learner123!'),
      'Maya Chen',
      'learner',
      ts,
      ts,
    );

    // -----------------------------------------------------------------------
    // COURSE 1: Python Programming (Primary Demo Course with 7 concepts)
    // -----------------------------------------------------------------------
    const pythonCourseId = 'course-python-programming';
    db.prepare(
      `INSERT INTO courses (
         id, instructor_id, title, description, category, difficulty,
         thumbnail_url, estimated_duration_minutes, default_passing_score,
         status, current_version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?)`,
    ).run(
      pythonCourseId,
      instructorId,
      'Python Programming',
      'Master Python from core syntax and memory types to control flow, modular functions, collections, and object-oriented design through a verified prerequisite knowledge graph.',
      'Computer Science',
      'beginner',
      '/src/assets/images/course_python_programming_1794943596042.jpg',
      210,
      75,
      ts,
      ts,
    );

    const pythonConcepts: SeedConcept[] = [
      {
        key: 'intro',
        title: 'Introduction to Python',
        description:
          'Understand how the Python interpreter executes scripts, evaluate expressions in the REPL, and write clean readable statements.',
        objectives: [
          'Explain how Python bytecode interpretation works',
          'Run scripts and interactive expressions cleanly',
          'Use print(), comments, and PEP 8 indentation conventions',
        ],
        difficulty: 'beginner',
        estimatedMinutes: 20,
        passingScore: 75,
        orderIndex: 1,
        posX: 60,
        posY: 180,
        lessons: [
          {
            title: 'The Python Execution Model & REPL',
            content:
              'Python is an interpreted, dynamically typed language designed for high readability.\n\nWhen you run a `.py` file, CPython compiles your source code into bytecode and executes it inside the Python Virtual Machine (PVM).\n\nKey practices:\n- Use 4 spaces per indentation level (PEP 8).\n- Keep expressions explicit and readable.\n- Use `print()` to inspect intermediate runtime values.',
            videoUrl: 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
            durationMinutes: 10,
          },
          {
            title: 'Writing Your First Structured Script',
            content:
              'Comments begin with `#` and explain *why* logic exists rather than repeating syntax.\n\nExample:\n```python\n# Calculate total study hours across modules\nprint("Welcome to LearnPath Python!")\n```\n\nAlways verify syntax errors and indentation blocks before moving to variable bindings.',
            videoUrl: 'https://www.youtube.com/watch?v=rfscVS0vtbw',
            durationMinutes: 10,
          },
        ],
        questions: [
          {
            questionText: 'How does CPython execute a Python source file?',
            optionA: 'It compiles source into bytecode executed by the Python Virtual Machine.',
            optionB: 'It requires manual assembly linking before running.',
            optionC: 'It executes only inside a web browser DOM.',
            optionD: 'It translates code directly into SQL queries.',
            correctOption: 'A',
            explanation: 'CPython compiles `.py` source files to `.pyc` bytecode and runs it on the PVM.',
          },
          {
            questionText: 'What is the PEP 8 standard indentation per block level in Python?',
            optionA: '2 tabs',
            optionB: '4 spaces',
            optionC: '1 space',
            optionD: 'Curly braces instead of whitespace',
            correctOption: 'B',
            explanation: 'PEP 8 recommends 4 spaces per indentation level for consistent block readability.',
          },
          {
            questionText: 'Which symbol starts a single-line comment in Python?',
            optionA: '//',
            optionB: '/*',
            optionC: '#',
            optionD: '--',
            correctOption: 'C',
            explanation: 'Python uses `#` for single-line comments.',
          },
          {
            questionText: 'Which built-in function outputs text to standard output?',
            optionA: 'echo()',
            optionB: 'console.log()',
            optionC: 'write()',
            optionD: 'print()',
            correctOption: 'D',
            explanation: '`print()` writes formatted objects to standard output.',
          },
        ],
      },
      {
        key: 'vars',
        title: 'Variables and Data Types',
        description:
          'Bind names to objects in memory and work confidently with integers, floats, strings, booleans, and explicit type conversions.',
        objectives: [
          'Distinguish int, float, str, and bool types',
          'Apply dynamic variable naming and snake_case rules',
          'Convert between types safely using int(), float(), and str()',
        ],
        difficulty: 'beginner',
        estimatedMinutes: 30,
        passingScore: 75,
        orderIndex: 2,
        posX: 340,
        posY: 180,
        lessons: [
          {
            title: 'Object References & Primitive Types',
            content:
              'In Python, variables are labels pointing to objects in memory rather than fixed-size boxes.\n\nCore primitive types:\n- `int`: arbitrary-precision whole numbers (`42`, `-7`)\n- `float`: IEEE 754 floating-point values (`3.1415`)\n- `str`: immutable Unicode text (`"LearnPath"`)\n- `bool`: truth values (`True`, `False`)\n\nUse `type(value)` at any time to inspect the runtime class of an object.',
            videoUrl: 'https://www.youtube.com/watch?v=cQT33yu9pY8',
            durationMinutes: 15,
          },
          {
            title: 'Type Casting & Formatted Strings',
            content:
              'Input values often arrive as strings (`"85"`). Performing arithmetic requires explicit conversion:\n```python\nscore_text = "85"\nscore = int(score_text)\nprint(f"Verified mastery score: {score}%")\n```\n\nF-strings (`f"..."`) evaluate expressions cleanly inside string literals.',
            videoUrl: 'https://www.youtube.com/watch?v=9c9qhIcB3hQ',
            durationMinutes: 15,
          },
        ],
        questions: [
          {
            questionText: 'What is the output of `type(42.0)` in Python?',
            optionA: "<class 'int'>",
            optionB: "<class 'float'>",
            optionC: "<class 'str'>",
            optionD: "<class 'decimal'>",
            correctOption: 'B',
            explanation: 'Any numeric literal containing a decimal point creates a `float` object.',
          },
          {
            questionText: 'Which variable name follows valid Python syntax and PEP 8 convention?',
            optionA: '2nd_score',
            optionB: 'student-score',
            optionC: 'student_score',
            optionD: 'class',
            correctOption: 'C',
            explanation: 'Python variables use snake_case (`student_score`) and cannot start with digits or use reserved keywords.',
          },
          {
            questionText: 'What does `int("19") + 1` evaluate to?',
            optionA: '"191"',
            optionB: 'TypeError',
            optionC: '20',
            optionD: '19.1',
            correctOption: 'C',
            explanation: '`int("19")` converts the string to integer `19`, and `19 + 1` equals `20`.',
          },
          {
            questionText: 'Which data type represents logical truth values?',
            optionA: 'bool',
            optionB: 'char',
            optionC: 'bit',
            optionD: 'flag',
            correctOption: 'A',
            explanation: 'Python uses `bool` with capitalized literals `True` and `False`.',
          },
        ],
      },
      {
        key: 'cond',
        title: 'Conditional Statements',
        description:
          'Branch program execution using comparison operators, boolean logic (and/or/not), and mutually exclusive if/elif/else chains.',
        objectives: [
          'Evaluate comparison and boolean expressions accurately',
          'Construct multi-branch if / elif / else decision trees',
          'Understand truthiness and avoid unreachable branch bugs',
        ],
        difficulty: 'beginner',
        estimatedMinutes: 25,
        passingScore: 75,
        orderIndex: 3,
        posX: 620,
        posY: 80,
        lessons: [
          {
            title: 'Boolean Expressions & Comparison Operators',
            content:
              'Conditionals rely on expressions that evaluate to `True` or `False`.\n\nOperators:\n- Equality: `==`, Inequality: `!=`\n- Ordering: `<`, `<=`, `>`, `>=`\n- Logical combinators: `and`, `or`, `not`\n\nRemember: `=` assigns a value, while `==` compares two values.',
            videoUrl: 'https://www.youtube.com/watch?v=DZwmZ8Usvnk',
            durationMinutes: 12,
          },
          {
            title: 'Structuring if / elif / else Chains',
            content:
              'Python evaluates `if` and `elif` guards from top to bottom and executes ONLY the first matching branch:\n```python\nif score >= 90:\n    grade = "A"\nelif score >= 75:\n    grade = "Pass"\nelse:\n    grade = "Review"\n```',
            videoUrl: 'https://www.youtube.com/watch?v=f4KOjWS_KZs',
            durationMinutes: 13,
          },
        ],
        questions: [
          {
            questionText: 'Which operator tests equality between two values in Python?',
            optionA: '=',
            optionB: '==',
            optionC: ':=',
            optionD: 'equals',
            correctOption: 'B',
            explanation: '`==` checks value equality, whereas `=` performs variable assignment.',
          },
          {
            questionText: 'In an `if / elif / else` block, how many branches can execute during a single evaluation?',
            optionA: 'All branches whose condition is True',
            optionB: 'At most one branch — the first matching condition',
            optionC: 'Both `if` and `else` simultaneously',
            optionD: 'Zero branches even if `else` is present',
            correctOption: 'B',
            explanation: 'Python short-circuits after the first True condition in an `if / elif / else` chain.',
          },
          {
            questionText: 'What does `True and (False or True)` evaluate to?',
            optionA: 'True',
            optionB: 'False',
            optionC: 'None',
            optionD: 'SyntaxError',
            correctOption: 'A',
            explanation: '`(False or True)` is `True`, and `True and True` is `True`.',
          },
          {
            questionText: 'Which value is considered "falsy" in a Python `if` condition?',
            optionA: '1',
            optionB: '"False"',
            optionC: '0',
            optionD: '[0]',
            correctOption: 'C',
            explanation: 'Numeric `0`, empty strings `""`, and empty collections are falsy; non-empty strings like `"False"` are truthy.',
          },
        ],
      },
      {
        key: 'loops',
        title: 'Loops',
        description:
          'Automate repetitive computation cleanly using definite for-loops over ranges/sequences, indefinite while-loops, break, and continue.',
        objectives: [
          'Iterate deterministically with for loops and range()',
          'Guard while loops against infinite execution',
          'Control loop flow using break and continue',
        ],
        difficulty: 'intermediate',
        estimatedMinutes: 35,
        passingScore: 75,
        orderIndex: 4,
        posX: 620,
        posY: 280,
        lessons: [
          {
            title: 'Definite Iteration with for & range()',
            content:
              'A `for` loop steps through each item of an iterable (such as `range(start, stop, step)` or a string).\n\n`range(5)` produces `0, 1, 2, 3, 4` — stopping *before* the upper bound `5`.\n\n```python\ntotal = 0\nfor n in range(1, 6):\n    total += n\n```',
            videoUrl: 'https://www.youtube.com/watch?v=6iF8Xb7Z3wQ',
            durationMinutes: 18,
          },
          {
            title: 'While Loops, Sentinels, and Loop Control',
            content:
              'Use a `while` loop when the iteration count depends on a runtime condition changing inside the loop body.\n\n- `break` exits the enclosing loop immediately.\n- `continue` skips the rest of the current iteration and jumps to the next check.',
            videoUrl: 'https://www.youtube.com/watch?v=OnDr4J2UXSA',
            durationMinutes: 17,
          },
        ],
        questions: [
          {
            questionText: 'What numbers does `range(2, 6)` yield?',
            optionA: '2, 3, 4, 5, 6',
            optionB: '2, 3, 4, 5',
            optionC: '3, 4, 5, 6',
            optionD: '0, 1, 2',
            correctOption: 'B',
            explanation: '`range(start, stop)` includes `start` and excludes `stop`.',
          },
          {
            questionText: 'What does the `continue` keyword do inside a loop?',
            optionA: 'Terminates the entire program',
            optionB: 'Exits the loop immediately',
            optionC: 'Skips the remainder of the current iteration and proceeds to the next',
            optionD: 'Restarts the loop from index 0',
            correctOption: 'C',
            explanation: '`continue` jumps straight to the next iteration without exiting the loop.',
          },
          {
            questionText: 'What causes an infinite `while` loop?',
            optionA: 'Using a `for` loop inside it',
            optionB: 'The loop condition never becomes False and no `break` executes',
            optionC: 'Using `range(10)`',
            optionD: 'Returning a value before the loop',
            correctOption: 'B',
            explanation: 'If the condition remains truthy forever and no `break` runs, the `while` loop never terminates.',
          },
          {
            questionText: 'How many times will `for i in range(3): print(i)` run?',
            optionA: '2 times',
            optionB: '3 times',
            optionC: '4 times',
            optionD: '0 times',
            correctOption: 'B',
            explanation: '`range(3)` yields `0`, `1`, `2` — exactly 3 iterations.',
          },
        ],
      },
      {
        key: 'funcs',
        title: 'Functions',
        description:
          'Encapsulate reusable behavior with def, parameters, return values, default arguments, and lexical variable scoping.',
        objectives: [
          'Define parameterized functions with explicit return values',
          'Distinguish between local and global scope',
          'Use default parameter values and docstrings cleanly',
        ],
        difficulty: 'intermediate',
        estimatedMinutes: 35,
        passingScore: 75,
        orderIndex: 5,
        posX: 900,
        posY: 130,
        lessons: [
          {
            title: 'Defining Functions, Parameters, and Return Values',
            content:
              'Functions break complex logic into testable, reusable units using `def`:\n```python\ndef calculate_mastery(correct: int, total: int) -> float:\n    return (correct / total) * 100\n```\n\nA function without an explicit `return` statement implicitly returns `None`.',
            videoUrl: 'https://www.youtube.com/watch?v=9Os0o3wzS_I',
            durationMinutes: 20,
          },
          {
            title: 'Variable Scope & Default Arguments',
            content:
              'Variables assigned inside a function live in **local scope** and cannot be accessed directly from outside.\n\nDefault parameter values let callers omit optional arguments:\n```python\ndef passed_quiz(score: int, threshold: int = 75) -> bool:\n    return score >= threshold\n```',
            videoUrl: 'https://www.youtube.com/watch?v=u-OmVr_fT4s',
            durationMinutes: 15,
          },
        ],
        questions: [
          {
            questionText: 'What does a Python function return if it has no `return` statement?',
            optionA: '0',
            optionB: 'False',
            optionC: 'None',
            optionD: 'Empty string ""',
            correctOption: 'C',
            explanation: 'Functions without an explicit `return` expression always evaluate to `None`.',
          },
          {
            questionText: 'Which keyword defines a function in Python?',
            optionA: 'function',
            optionB: 'fn',
            optionC: 'def',
            optionD: 'lambda_def',
            correctOption: 'C',
            explanation: '`def` introduces a named function definition in Python.',
          },
          {
            questionText: 'Where can a variable created inside a function be accessed by default?',
            optionA: 'Anywhere in the module',
            optionB: 'Only inside that function’s local scope',
            optionC: 'Only inside `while` loops',
            optionD: 'Across all imported files',
            correctOption: 'B',
            explanation: 'Variables assigned inside a function are local to that function call frame.',
          },
          {
            questionText: 'In `def greet(name="Learner"):`, what happens when calling `greet()`?',
            optionA: 'Raises TypeError for missing argument',
            optionB: 'Uses the default value "Learner" for `name`',
            optionC: 'Sets `name` to None',
            optionD: 'Returns the function object without running',
            correctOption: 'B',
            explanation: 'Default argument values supply a fallback when the caller omits that parameter.',
          },
        ],
      },
      {
        key: 'lists',
        title: 'Lists and Tuples',
        description:
          'Store ordered collections of elements, slice sequences, mutate lists safely, and use immutable tuples for fixed records.',
        objectives: [
          'Index and slice ordered sequences in Python',
          'Use list methods (append, pop, sort) and list comprehensions',
          'Explain when to prefer immutable tuples over mutable lists',
        ],
        difficulty: 'intermediate',
        estimatedMinutes: 30,
        passingScore: 75,
        orderIndex: 6,
        posX: 900,
        posY: 310,
        lessons: [
          {
            title: 'Indexing, Slicing, and List Operations',
            content:
              'Lists (`[...]`) are ordered, mutable collections supporting zero-based indexing and negative indexing (`items[-1]` is the last element).\n\nSlicing `items[1:4]` returns elements at indices `1, 2, 3`.\nList comprehensions offer concise transformation:\n```python\nsquares = [x * x for x in range(1, 6)]\n```',
            videoUrl: 'https://www.youtube.com/watch?v=W8KRzm-HUcc',
            durationMinutes: 15,
          },
          {
            title: 'Immutable Tuples & Unpacking',
            content:
              'Tuples (`(...)`) are ordered sequences that cannot be modified in place after creation.\n\nThey are ideal for fixed coordinate pairs or returning multiple values from a function:\n```python\nx, y = (120, 240)\n```',
            videoUrl: 'https://www.youtube.com/watch?v=NI26dqhs2Rk',
            durationMinutes: 15,
          },
        ],
        questions: [
          {
            questionText: 'What is the key difference between a Python list and a tuple?',
            optionA: 'Lists are mutable; tuples are immutable.',
            optionB: 'Tuples can only store integers.',
            optionC: 'Lists cannot be indexed by position.',
            optionD: 'Tuples automatically remove duplicates.',
            correctOption: 'A',
            explanation: 'Lists support in-place mutation (`append`, item assignment), whereas tuples are immutable.',
          },
          {
            questionText: 'Given `nums = [10, 20, 30, 40]`, what does `nums[-1]` return?',
            optionA: '10',
            optionB: '30',
            optionC: '40',
            optionD: 'IndexError',
            correctOption: 'C',
            explanation: 'Negative index `-1` accesses the final element of a sequence.',
          },
          {
            questionText: 'What does `[1, 2, 3][0:2]` evaluate to?',
            optionA: '[1, 2]',
            optionB: '[1, 2, 3]',
            optionC: '[2, 3]',
            optionD: '[1]',
            correctOption: 'A',
            explanation: 'Slicing `[start:stop]` includes `start` (`0`) and excludes `stop` (`2`).',
          },
          {
            questionText: 'Which list method adds a single item to the end of a list?',
            optionA: 'push()',
            optionB: 'insert_end()',
            optionC: 'append()',
            optionD: 'concat()',
            correctOption: 'C',
            explanation: '`list.append(item)` appends one element to the end of the list in place.',
          },
        ],
      },
      {
        key: 'oop',
        title: 'Object-Oriented Programming',
        description:
          'Model domain entities using classes, __init__ constructors, instance methods, encapsulation, and inheritance.',
        objectives: [
          'Design Python classes with __init__ and instance attributes',
          'Implement cohesive methods operating on self state',
          'Apply inheritance and method overriding cleanly',
        ],
        difficulty: 'advanced',
        estimatedMinutes: 40,
        passingScore: 75,
        orderIndex: 7,
        posX: 1180,
        posY: 210,
        lessons: [
          {
            title: 'Classes, Instances, and __init__',
            content:
              'Classes bundle state (attributes) and behavior (methods) into reusable blueprints.\n\n```python\nclass ConceptNode:\n    def __init__(self, title: str, passing_score: int = 75):\n        self.title = title\n        self.passing_score = passing_score\n\n    def is_passing(self, score: int) -> bool:\n        return score >= self.passing_score\n```\n`self` always refers to the current instance.',
            videoUrl: 'https://www.youtube.com/watch?v=ZDa-Z5JzLYM',
            durationMinutes: 20,
          },
          {
            title: 'Inheritance & Polymorphic Behavior',
            content:
              'Subclasses inherit attributes and methods from a parent class and can extend or override behavior using `super()`.\n\nFavor clear single-responsibility classes so components remain easy to test and evolve.',
            videoUrl: 'https://www.youtube.com/watch?v=RSl87lqOXDE',
            durationMinutes: 20,
          },
        ],
        questions: [
          {
            questionText: 'What is the purpose of `__init__` in a Python class?',
            optionA: 'It deletes an object from memory.',
            optionB: 'It initializes instance attributes when a new object is created.',
            optionC: 'It converts a class into a tuple.',
            optionD: 'It imports external modules automatically.',
            correctOption: 'B',
            explanation: '`__init__` is Python’s instance initializer called automatically right after object allocation.',
          },
          {
            questionText: 'What does the `self` parameter represent inside an instance method?',
            optionA: 'The class definition itself',
            optionB: 'The specific instance on which the method was called',
            optionC: 'A global dictionary',
            optionD: 'The parent module name',
            correctOption: 'B',
            explanation: '`self` binds to the receiving object instance when calling `obj.method()`.',
          },
          {
            questionText: 'Which built-in function allows a subclass to invoke a method on its parent class?',
            optionA: 'parent()',
            optionB: 'base()',
            optionC: 'super()',
            optionD: 'extend()',
            correctOption: 'C',
            explanation: '`super()` returns a proxy object delegating method calls to a parent/sibling class in MRO.',
          },
          {
            questionText: 'In OOP, what does encapsulation primarily promote?',
            optionA: 'Bundling data with the methods that operate on it behind a clean interface',
            optionB: 'Exposing all internal state as global variables',
            optionC: 'Eliminating functions from a codebase',
            optionD: 'Preventing loops from executing',
            correctOption: 'A',
            explanation: 'Encapsulation groups state and behavior together while hiding internal invariants.',
          },
        ],
      },
    ];

    const pythonConceptIdMap = new Map<string, string>();
    for (const c of pythonConcepts) {
      const cid = `py-${c.key}`;
      pythonConceptIdMap.set(c.key, cid);

      db.prepare(
        `INSERT INTO concepts (
           id, course_id, title, description, learning_objectives_json, difficulty,
           estimated_minutes, passing_score, order_index, pos_x, pos_y, status,
           split_from_concept_id, split_into_concept_ids_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, '[]', ?, ?)`,
      ).run(
        cid,
        pythonCourseId,
        c.title,
        c.description,
        JSON.stringify(c.objectives),
        c.difficulty,
        c.estimatedMinutes,
        c.passingScore,
        c.orderIndex,
        c.posX,
        c.posY,
        ts,
        ts,
      );

      c.lessons.forEach((l, lIdx) => {
        db.prepare(
          `INSERT INTO lessons (
             id, concept_id, title, content, video_url, duration_minutes, order_index, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `lesson-${cid}-${lIdx + 1}`,
          cid,
          l.title,
          l.content,
          l.videoUrl,
          l.durationMinutes,
          lIdx + 1,
          ts,
          ts,
        );
      });

      const quizId = `quiz-${cid}`;
      db.prepare(
        `INSERT INTO quizzes (id, concept_id, title, passing_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(quizId, cid, `${c.title} Mastery Quiz`, c.passingScore, ts, ts);

      c.questions.forEach((q, qIdx) => {
        db.prepare(
          `INSERT INTO quiz_questions (
             id, quiz_id, question_text, option_a, option_b, option_c, option_d,
             correct_option, explanation, order_index
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `qq-${cid}-${qIdx + 1}`,
          quizId,
          q.questionText,
          q.optionA,
          q.optionB,
          q.optionC,
          q.optionD,
          q.correctOption,
          q.explanation,
          qIdx + 1,
        );
      });
    }

    // Meaningful DAG edges for Python Programming
    // Note: Functions requires BOTH Variables and Data Types AND Loops!
    const pythonEdges: Array<[string, string]> = [
      ['intro', 'vars'],
      ['vars', 'cond'],
      ['cond', 'loops'],
      ['vars', 'funcs'],
      ['loops', 'funcs'],
      ['loops', 'lists'],
      ['funcs', 'oop'],
      ['lists', 'oop'],
    ];

    for (const [fromKey, toKey] of pythonEdges) {
      db.prepare(
        `INSERT INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        `edge-py-${fromKey}-${toKey}`,
        pythonCourseId,
        pythonConceptIdMap.get(fromKey)!,
        pythonConceptIdMap.get(toKey)!,
        ts,
      );
    }

    // Initial Curriculum Version v1 for Python Programming
    const pySnap = snapshotCourseStructure(pythonCourseId);
    const v1Id = 'ver-py-v1';
    db.prepare(
      `INSERT INTO curriculum_versions (id, course_id, version_number, summary, snapshot_json, created_by, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?)`,
    ).run(
      v1Id,
      pythonCourseId,
      'Initial published knowledge graph with 7 foundational Python concepts.',
      JSON.stringify(pySnap),
      instructorId,
      ts,
    );

    db.prepare(
      `INSERT INTO curriculum_change_logs (
         id, course_id, version_id, change_type, description,
         affected_concept_ids_json, affected_learner_count,
         previous_structure_json, new_structure_json, changed_by, created_at
       ) VALUES (?, ?, ?, 'course_published', ?, ?, 0, '{}', ?, ?, ?)`,
    ).run(
      'log-py-v1',
      pythonCourseId,
      v1Id,
      'Published initial Python Programming curriculum DAG (v1).',
      JSON.stringify(Array.from(pythonConceptIdMap.values())),
      JSON.stringify(pySnap),
      instructorId,
      ts,
    );

    // Enroll Maya Chen in Python Programming with partial progress so Instructor Analytics has rich real data,
    // while keeping Alex Rivera ready to enroll and run through the full demo scenario!
    db.prepare(
      `INSERT INTO course_enrollments (id, course_id, learner_id, enrolled_at, last_active_concept_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('enr-maya-py', pythonCourseId, learnerMayaId, ts, 'py-cond', ts);

    for (const masteredCid of ['py-intro', 'py-vars']) {
      db.prepare(
        `INSERT INTO concept_mastery (id, concept_id, course_id, learner_id, mastered, best_score, mastered_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 100, ?, ?)`,
      ).run(`cm-maya-${masteredCid}`, masteredCid, pythonCourseId, learnerMayaId, ts, ts);

      db.prepare(
        `INSERT INTO quiz_attempts (id, quiz_id, concept_id, course_id, learner_id, answers_json, score, correct_count, total_count, passed, attempted_at)
         VALUES (?, ?, ?, ?, ?, ?, 100, 4, 4, 1, ?)`,
      ).run(
        `qa-maya-${masteredCid}`,
        `quiz-${masteredCid}`,
        masteredCid,
        pythonCourseId,
        learnerMayaId,
        JSON.stringify({}),
        ts,
      );
    }

    // -----------------------------------------------------------------------
    // COURSE 2: Data Structures & Algorithms (Catalog Course)
    // -----------------------------------------------------------------------
    const dsaCourseId = 'course-data-structures';
    db.prepare(
      `INSERT INTO courses (
         id, instructor_id, title, description, category, difficulty,
         thumbnail_url, estimated_duration_minutes, default_passing_score,
         status, current_version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?)`,
    ).run(
      dsaCourseId,
      instructorId,
      'Data Structures & Algorithms',
      'Build algorithmic intuition across asymptotic complexity, linked structures, recursion, trees, and directed graph traversals.',
      'Algorithms',
      'intermediate',
      '/src/assets/images/course_data_structures_1794943595755.jpg',
      160,
      75,
      ts,
      ts,
    );

    const dsaConcepts = [
      {
        key: 'bigo',
        title: 'Asymptotic Complexity (Big-O)',
        description: 'Analyze worst-case time and space scaling for iterative and recursive algorithms.',
        orderIndex: 1,
        x: 80,
        y: 160,
        mins: 30,
      },
      {
        key: 'arrays',
        title: 'Dynamic Arrays & Hash Maps',
        description: 'Understand amortized resizing, hash collisions, and O(1) average lookup tables.',
        orderIndex: 2,
        x: 360,
        y: 80,
        mins: 35,
      },
      {
        key: 'recursion',
        title: 'Recursion & Call Stacks',
        description: 'Trace base cases, recursive invariants, and call-stack memory frames.',
        orderIndex: 3,
        x: 360,
        y: 250,
        mins: 30,
      },
      {
        key: 'trees',
        title: 'Binary Trees & Heaps',
        description: 'Traverse hierarchical trees via BFS/DFS and maintain priority queues.',
        orderIndex: 4,
        x: 660,
        y: 160,
        mins: 35,
      },
      {
        key: 'graphs',
        title: 'Graph Traversals & Topological Sort',
        description: 'Detect cycles, compute shortest paths, and order DAG dependencies.',
        orderIndex: 5,
        x: 940,
        y: 160,
        mins: 30,
      },
    ];

    for (const c of dsaConcepts) {
      const cid = `dsa-${c.key}`;
      db.prepare(
        `INSERT INTO concepts (
           id, course_id, title, description, learning_objectives_json, difficulty,
           estimated_minutes, passing_score, order_index, pos_x, pos_y, status,
           split_from_concept_id, split_into_concept_ids_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'intermediate', ?, 75, ?, ?, ?, 'active', NULL, '[]', ?, ?)`,
      ).run(
        cid,
        dsaCourseId,
        c.title,
        c.description,
        JSON.stringify([`Master ${c.title}`]),
        c.mins,
        c.orderIndex,
        c.x,
        c.y,
        ts,
        ts,
      );

      db.prepare(
        `INSERT INTO lessons (id, concept_id, title, content, video_url, duration_minutes, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        `lesson-${cid}-1`,
        cid,
        `${c.title} Foundations`,
        `${c.description}\n\nFocus on time-space trade-offs and invariant reasoning before attempting the mastery quiz.`,
        'https://www.youtube.com/watch?v=8hly31xKli0',
        c.mins,
        ts,
        ts,
      );

      const qid = `quiz-${cid}`;
      db.prepare(
        `INSERT INTO quizzes (id, concept_id, title, passing_score, created_at, updated_at)
         VALUES (?, ?, ?, 75, ?, ?)`,
      ).run(qid, cid, `${c.title} Quiz`, ts, ts);

      db.prepare(
        `INSERT INTO quiz_questions (id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'A', ?, 1)`,
      ).run(
        `qq-${cid}-1`,
        qid,
        `Which statement accurately applies to ${c.title}?`,
        `${c.description}`,
        'It guarantees O(1) worst-case complexity for every problem.',
        'It eliminates the need for base cases or termination conditions.',
        'It only works on unsorted string literals.',
        `Correct — ${c.description}`,
      );
    }

    const dsaEdges: Array<[string, string]> = [
      ['bigo', 'arrays'],
      ['bigo', 'recursion'],
      ['arrays', 'trees'],
      ['recursion', 'trees'],
      ['trees', 'graphs'],
    ];
    for (const [u, v] of dsaEdges) {
      db.prepare(
        `INSERT INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(`edge-dsa-${u}-${v}`, dsaCourseId, `dsa-${u}`, `dsa-${v}`, ts);
    }

    const dsaSnap = snapshotCourseStructure(dsaCourseId);
    db.prepare(
      `INSERT INTO curriculum_versions (id, course_id, version_number, summary, snapshot_json, created_by, created_at)
       VALUES (?, ?, 1, 'Initial published DSA curriculum.', ?, ?, ?)`,
    ).run('ver-dsa-v1', dsaCourseId, JSON.stringify(dsaSnap), instructorId, ts);

    // -----------------------------------------------------------------------
    // COURSE 3: Applied Machine Learning Foundations (Catalog Course)
    // -----------------------------------------------------------------------
    const mlCourseId = 'course-applied-ml';
    db.prepare(
      `INSERT INTO courses (
         id, instructor_id, title, description, category, difficulty,
         thumbnail_url, estimated_duration_minutes, default_passing_score,
         status, current_version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?)`,
    ).run(
      mlCourseId,
      instructorId,
      'Applied Machine Learning Foundations',
      'Progress from linear algebra vectors and loss functions to gradient descent and regularized classification pipelines.',
      'Machine Learning',
      'advanced',
      '/src/assets/images/course_applied_ml_1794943596741.jpg',
      140,
      80,
      ts,
      ts,
    );

    const mlConcepts = [
      {
        key: 'vectors',
        title: 'Linear Algebra for ML',
        description: 'Represent datasets as matrices and compute dot products and projections.',
        orderIndex: 1,
        x: 90,
        y: 160,
        mins: 35,
      },
      {
        key: 'loss',
        title: 'Loss Functions & Optimization',
        description: 'Formulate MSE and cross-entropy objectives for supervised training.',
        orderIndex: 2,
        x: 380,
        y: 160,
        mins: 35,
      },
      {
        key: 'gd',
        title: 'Gradient Descent Dynamics',
        description: 'Update model weights iteratively using learning rates and partial derivatives.',
        orderIndex: 3,
        x: 670,
        y: 160,
        mins: 35,
      },
      {
        key: 'eval',
        title: 'Generalization & Cross-Validation',
        description: 'Detect overfitting with train/validation splits and precision-recall metrics.',
        orderIndex: 4,
        x: 960,
        y: 160,
        mins: 35,
      },
    ];

    for (const c of mlConcepts) {
      const cid = `ml-${c.key}`;
      db.prepare(
        `INSERT INTO concepts (
           id, course_id, title, description, learning_objectives_json, difficulty,
           estimated_minutes, passing_score, order_index, pos_x, pos_y, status,
           split_from_concept_id, split_into_concept_ids_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'advanced', ?, 80, ?, ?, ?, 'active', NULL, '[]', ?, ?)`,
      ).run(
        cid,
        mlCourseId,
        c.title,
        c.description,
        JSON.stringify([`Apply ${c.title}`]),
        c.mins,
        c.orderIndex,
        c.x,
        c.y,
        ts,
        ts,
      );

      db.prepare(
        `INSERT INTO lessons (id, concept_id, title, content, video_url, duration_minutes, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        `lesson-${cid}-1`,
        cid,
        `${c.title} Brief`,
        `${c.description}\n\nVerify algebraic assumptions and edge cases before taking the mastery check.`,
        'https://www.youtube.com/watch?v=aircAruvnKk',
        c.mins,
        ts,
        ts,
      );

      const qid = `quiz-${cid}`;
      db.prepare(
        `INSERT INTO quizzes (id, concept_id, title, passing_score, created_at, updated_at)
         VALUES (?, ?, ?, 80, ?, ?)`,
      ).run(qid, cid, `${c.title} Mastery Check`, ts, ts);

      db.prepare(
        `INSERT INTO quiz_questions (id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'A', ?, 1)`,
      ).run(
        `qq-${cid}-1`,
        qid,
        `What is the primary purpose of ${c.title}?`,
        c.description,
        'To discard all validation data during training.',
        'To replace feature vectors with random strings.',
        'To avoid measuring model error.',
        `Correct — ${c.description}`,
      );
    }

    const mlEdges: Array<[string, string]> = [
      ['vectors', 'loss'],
      ['loss', 'gd'],
      ['gd', 'eval'],
    ];
    for (const [u, v] of mlEdges) {
      db.prepare(
        `INSERT INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(`edge-ml-${u}-${v}`, mlCourseId, `ml-${u}`, `ml-${v}`, ts);
    }

    const mlSnap = snapshotCourseStructure(mlCourseId);
    db.prepare(
      `INSERT INTO curriculum_versions (id, course_id, version_number, summary, snapshot_json, created_by, created_at)
       VALUES (?, ?, 1, 'Initial published ML Foundations curriculum.', ?, ?, ?)`,
    ).run('ver-ml-v1', mlCourseId, JSON.stringify(mlSnap), instructorId, ts);
  });
}
