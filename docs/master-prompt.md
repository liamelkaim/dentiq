# DentOS: Complete Master Project Prompt

## 1. Your role

Act as my senior software engineer, product architect, UI/UX designer, database engineer, AI engineer, security reviewer, accessibility reviewer, and technical project manager.

Your responsibility is to build **DentOS**, a premium, extensible academic platform initially designed for dentistry students at **Université de Montréal**.

I want a real, functional, secure application, not a mockup or a collection of disconnected demo screens.

I am learning as I build this project. Explain technical decisions in simple language, give me clear instructions, and avoid unnecessary technical jargon.

Work independently on ordinary implementation decisions. Ask questions only when a missing decision materially affects security, privacy, cost, architecture, legal obligations, or product correctness.

Keep the project affordable, maintainable, and easy to expand.

**The long-term vision is DentOS. The immediate priority is to build a reliable, working foundation before adding every planned feature.**

---

## 2. Project location and existing work

The intended project directory is:

`/Users/liamelkaim/Documents/Claude code projects/Adam's Database/DentOS`

Before making any changes:

1. Confirm the actual working directory.
2. Confirm that it is the intended DentOS directory.
3. Inspect the current files and directory structure.
4. Check Git status, repository history, and existing branches.
5. Inspect installed tools, dependencies, configuration, and available test commands.
6. Determine what has already been implemented.
7. Identify any existing uncommitted changes.
8. Present a concise architecture recommendation and implementation plan.

The directory may already contain an initialized Git repository and empty `apps/`, `docs/`, and `packages/` directories.

Do not assume the directory is empty. Verify its actual state.

Preserve all existing files, Git history, configuration, and useful work. Do not delete or recreate the project to obtain a clean starting point.

If the current implementation differs from this specification, inspect the differences and explain how to proceed safely.

Do not overwrite existing work without understanding its purpose.

After inspection and the initial plan, proceed with Phase 1 unless a genuinely critical decision or external authorization is required.

---

## 3. Product vision

DentOS is a shared academic knowledge platform for dentistry students.

It should eventually bring together:

- Student accounts and secure authentication.
- A structured academic course catalog.
- Course outlines and professor information.
- Shared class notes and learning resources.
- Versioned academic documents.
- Shared past exam questions, commonly called **passes**.
- Course-specific AI tutors.
- AI-generated summaries, flashcards, quizzes, and mock exams.
- Anki-compatible flashcard exports.
- Lecture recording and audio uploads.
- Audio transcription and searchable transcripts.
- Personalized dashboards and study planning.
- Course difficulty ratings and student comments.
- Study progress and learning analytics.
- French and English language support.
- Mobile-friendly access and installable PWA functionality.

The application must work on desktop, tablet, and mobile browsers.

Build an installable Progressive Web App where practical. Do not build separate native iOS or Android applications unless we explicitly decide to do so later.

All features must be connected to a coherent application architecture. Avoid building screens that appear functional but have no real underlying behavior.

Clearly distinguish working features, demonstration data, incomplete features, and future plans.

---

## 4. Product identity and visual design

### 4.1 Adam's confirmed design preferences

The design direction is confirmed:

- **Core style:** premium monochrome with subtle dental-inspired details.
- **Appearance:** both light and dark themes, with a visible theme switcher.
- **Accent:** restrained clinical blue.
- **Overall feeling:** premium, modern, precise, calm, and Apple-inspired.
- **Primary goal:** a complete product experience, not a generic dashboard template.

Do not ask me to choose these preferences again.

### 4.2 Visual design principles

Build a consistent design system using:

- Carefully balanced black, white, and neutral gray surfaces.
- A restrained clinical-blue accent for selected interactive elements and important states.
- Consistent typography, font sizes, line heights, and text hierarchy.
- Deliberate spacing and alignment.
- Subtle borders and carefully controlled shadows.
- Consistent component shapes and interaction states.
- Clear visual hierarchy and readable information density.
- Polished loading, empty, success, error, and disabled states.
- Responsive layouts for phones, tablets, and desktop screens.
- Subtle dental-inspired details only when they improve the design.

Avoid:

- Excessive blue or a hospital-management-system appearance.
- Bright gradients used merely for decoration.
- Generic AI-generated dashboard layouts.
- Excessive cards nested inside other cards.
- Unnecessary shadows, borders, animations, and rounded containers.
- Oversized headings that waste useful screen space.
- Inconsistent spacing or typography.
- Decorative elements that reduce readability.
- Fake functionality presented as complete functionality.

### 4.3 Light and dark themes

Both themes must be deliberately designed.

Implement:

- A clear theme switcher accessible from the interface.
- A sensible initial theme based on system preferences, where appropriate.
- User-selected theme persistence across reloads.
- Correct colors for text, backgrounds, forms, borders, menus, charts, dialogs, and notifications.
- Accessible contrast in both themes.
- Consistent visual treatment across every implemented page.

Use shared design tokens rather than scattering color values throughout the code.

### 4.4 Brand identity

Use a configurable DentOS wordmark or temporary text-based identity.

Do not invent an official DentOS logo and claim it is official.

If the Université de Montréal logo is eventually used, obtain it from an appropriate source and make it configurable. Otherwise, use a replaceable placeholder.

Never imply official university endorsement or affiliation.

### 4.5 Design quality

Before declaring the UI complete:

- Inspect every implemented page.
- Check desktop and mobile layouts.
- Check both light and dark themes.
- Verify navigation and interactive controls.
- Check keyboard navigation and visible focus states.
- Correct overflow, inconsistent spacing, unreadable text, and broken layouts.
- Remove unnecessary placeholder content and dead controls.

The finished interface should feel coherent, polished, and intentional.

---

## 5. Architecture and technology choices

Choose the simplest reliable architecture that can support the long-term product.

Use maintained, well-supported technologies. Prefer boring, proven solutions over unnecessary complexity.

Consider:

- TypeScript.
- React and a suitable modern build tool.
- A full-stack framework or a simple application structure appropriate to the requirements.
- A relational database, such as PostgreSQL.
- Database migrations.
- Established authentication and authorization.
- Private object storage for uploaded documents and audio.
- Automated tests.
- A modular AI integration layer.
- PWA support.

These are options to evaluate, not a requirement to install every technology.

### 5.1 Keep the architecture simple

Prefer a single application and a small number of dependencies unless there is a documented reason to introduce more services.

Do not automatically create:

- A separate frontend and backend deployment.
- A separate API service.
- A large monorepo.
- Multiple packages with little practical value.
- Microservices.
- Background-processing infrastructure before it is needed.
- A vector database before AI retrieval requires one.
- Complex abstractions for hypothetical future requirements.

A separate API or package is acceptable when it provides a clear, measurable benefit. Explain the benefit and cost before introducing unnecessary complexity.

Keep presentation, business logic, database access, authentication, and external integrations appropriately separated within the chosen architecture.

### 5.2 Authentication evaluation

Evaluate maintained authentication options compatible with the recommended architecture.

Prefer an established solution over custom password hashing, session management, and security-sensitive authentication logic.

Compare relevant options based on:

- Security and maintenance.
- Compatibility with the chosen framework.
- Local development requirements.
- Free-tier limitations and possible future charges.
- Student verification support.
- Session handling and account recovery.
- Database integration.
- Ability to test authentication and authorization.
- Risk of vendor lock-in.

Choose the simplest secure option.

Do not build custom authentication security merely to avoid choosing a library or provider.

If no option can be implemented securely within Phase 1, explain the limitation and implement only the safe, testable foundation that is appropriate.

Never expose secrets in frontend code.

### 5.3 Database

Use a relational database if appropriate for the selected stack.

Plan a data model that can support:

- Users and permissions.
- Academic programs.
- Courses and course offerings.
- Professors and instructor assignments.
- Academic years and semesters.
- Course outlines and document versions.
- Notes and learning resources.
- Exam passes and individual questions.
- Flashcards and quizzes.
- Audio recordings and transcripts.
- Study tasks and learning activity.
- Course difficulty ratings and comments.
- Moderation and audit history.

Use migrations for schema changes.

Add appropriate constraints, relationships, indexes, and validation.

Avoid destructive migrations. Preserve existing data when schemas evolve.

Do not introduce PostgreSQL, a hosted database, or another service without assessing the actual development environment and setup requirements.

Use a local development approach that can be tested reliably. Document any limitations of the local database relative to production.

### 5.4 Storage

Future document and audio uploads must use appropriate storage and access controls.

Evaluate local development storage and affordable private object storage options when needed.

Do not introduce paid storage services during initial development without approval.

Do not expose private recordings or documents through unrestricted public URLs.

Use appropriate file-size limits, file-type validation, authorization checks, and safe download behavior.

### 5.5 Environment and configuration

- Keep secrets out of source control.
- Use environment variables where appropriate.
- Provide an example environment file containing placeholders, never real secrets.
- Validate required configuration at startup.
- Explain which values are required and how to obtain them.
- Avoid requiring external API keys for features that do not need them.
- Keep development and production configuration separate.

---

## 6. Budget and permissions

The initial budget is as close to zero as reasonably possible.

Prioritize local development and suitable free options.

You may create local files, run safe local commands, install reasonable dependencies, and implement the approved phase without requesting permission for every ordinary edit.

However, you must not do any of the following without explicit approval:

- Purchase subscriptions or incur charges.
- Create paid cloud resources.
- Enable paid APIs.
- Create external accounts on my behalf.
- Deploy or publish the application.
- Push code to a remote repository.
- Create a GitHub remote repository.
- Merge branches or pull requests.
- Delete project data.
- Perform destructive database operations.
- Publish private or sensitive information.

Explain potential costs before recommending a service that could charge money.

Do not assume that a free trial or free tier will remain free indefinitely.

---

## 7. Academic database and course catalog

DentOS initially targets dentistry students at Université de Montréal.

I will provide course lists and course information from Ampho Académique, university websites, and other relevant sources.

Do not invent:

- Course codes or names.
- Professors.
- Academic credits or weighting.
- Exam dates.
- Course requirements.
- Official university policies.
- Official course descriptions.

Clearly label demonstration data if it is necessary to test the interface.

### 7.1 Course organization

Support organization by:

- Academic program.
- Academic year.
- Semester or term.
- Course code.
- Course name.
- Professor or instructor.
- Course offering.
- Course outline.
- Topic.
- Learning resources.

Keep the catalog editable and importable so new information can be added without rebuilding the application.

Where possible, preserve the source and date of imported information.

Make official course details distinguishable from student-contributed information.

### 7.2 Course offerings and professor changes

Treat a course and a particular course offering as distinct concepts.

A new professor, semester, or materially different course offering must not automatically inherit old materials as current authoritative content.

Preserve historical notes and resources.

Allow students to access relevant historical materials explicitly when useful.

Keep current and historical course contexts separate so that AI tutors and search results do not mix them by default.

---

## 8. Accounts, permissions, and student verification

Design permissions for:

- Students.
- Moderators.
- Administrators.

Use server-side authorization, not merely hidden buttons or frontend checks.

Students should be able to:

- Browse permitted shared resources.
- Upload permitted materials.
- Search the academic catalog.
- Contribute questions and study resources.
- Report incorrect or inappropriate content.
- Manage their own appropriate account settings.

Moderators should have tools to review reports, manage submitted content, and handle corrections.

Administrators should have appropriate catalog and platform-management capabilities.

Plan for university email verification or another appropriate student-verification process.

Do not assume a university email address alone proves current enrollment unless an appropriate policy has been established.

Keep student verification policy configurable until we make a final decision.

Implement appropriate audit history for important administrative and moderation actions.

Protect against spam, abuse, unauthorized access, and privilege escalation.

Test permission boundaries.

---

## 9. Notes and academic resources

Build a resource system that can eventually support:

- Course notes.
- Course outlines.
- Study guides.
- Instructor-provided materials where permitted.
- Student-created resources.
- Topic-specific resources.
- Historical course materials.

Organize resources by course, offering, professor, academic year, semester, and topic where relevant.

Support appropriate uploads, metadata, search, and filters.

Include:

- Contributor information where appropriate.
- Upload dates.
- Source attribution.
- Version history.
- Duplicate detection.
- File previews where supported.
- Reporting and moderation.
- Clear historical versus current resource status.

Preserve original materials and their history when a new version is uploaded.

Do not allow a new professor's materials to be silently mixed with the previous professor's content.

Respect copyright and access restrictions. Do not assume that uploading a document gives DentOS permission to redistribute it.

Implement this feature in a later phase, not Phase 1.

---

## 10. Exam passes and question management

Create a shared past-exam-question system in a later phase.

Students should be able to submit individual questions through a structured form.

Potential fields include:

- Course and course offering.
- Exam date or semester.
- Topic.
- Question text.
- Question type.
- Answer choices.
- Student-proposed answer.
- Explanation.
- Source or confidence status.
- Moderation status.

Organize accepted questions into course-specific collections.

Include:

- Search and filtering.
- Duplicate detection and grouping.
- Editing and correction history.
- Reporting and moderation.
- Clear distinction between proposed and verified answers.
- Downloadable collections.
- Anki-compatible exports where supported.

Do not present a student-proposed answer as verified.

Use clear statuses such as submitted, under review, student-proposed, verified, rejected, or corrected as appropriate.

Support two configurable categories representing current-year and previous-year passes. Do not hard-code an interpretation before the intended policy is clarified.

Consider academic integrity, copyright, instructor rules, and applicable university policies before publishing questions.

Do not facilitate access to leaked examinations or unauthorized answer keys.

Implement this feature in a later phase.

---

## 11. Course-specific AI tutors

DentOS should eventually support a specialized AI tutor for each course offering.

Each tutor should use authorized and relevant source material, such as:

- Current course outlines.
- Approved course resources.
- Student notes.
- Authorized historical materials when explicitly appropriate.
- Uploaded recordings and transcripts when available.

Use retrieval-augmented generation (RAG) or another appropriate retrieval method when the source collection justifies it.

Do not introduce a vector database or paid AI provider before it is necessary.

### 11.1 Tutor requirements

Each tutor must:

- Prioritize the active course offering.
- Retrieve relevant source passages when appropriate.
- Cite or link supporting sources where possible.
- Distinguish official course documents from student-created material.
- Explain uncertainty and missing information.
- Never invent professor statements or official requirements.
- Avoid presenting unsupported claims as established course facts.
- Respect the active professor's course context.
- Avoid mixing historical and current materials by default.

If no reliable source supports an answer about a course requirement, the tutor should say so rather than inventing an answer.

Keep the AI provider replaceable through a well-defined integration layer.

Protect API keys and user data.

Account for AI costs, usage limits, rate limits, and privacy.

Do not enable paid AI APIs without approval.

Begin with text-based tutoring. Voice interaction can come later.

---

## 12. Audio recording, uploads, and transcription

Plan for a later audio phase that supports:

- Recording lectures in the browser when permissions allow.
- Uploading existing voice memos.
- Recording duration and processing status.
- Transcription.
- Transcript search.
- Linking relevant transcript passages to notes and AI tutor answers.
- Clear error handling when processing fails.

Optimize for ordinary voice-memo quality rather than studio-quality audio.

Do not assume that every recording is clear enough to transcribe accurately.

Show processing status and uncertainty.

Use a modular transcription pipeline so providers can be changed later.

Do not make paid transcription services mandatory for the initial release.

### Privacy and consent

Require appropriate user confirmation that recording and sharing comply with applicable law, consent requirements, and university policies.

Provide appropriate privacy information, file-size limits, retention controls, and access restrictions.

Protect recordings and transcripts from unauthorized access.

Do not claim legal compliance without verification.

Implement audio features only after the foundational application and relevant privacy requirements have been addressed.

---

## 13. Study tools and personalized dashboard

The dashboard should eventually help each student organize learning across selected courses.

Potential features include:

- Selected or enrolled courses.
- Recent resources.
- Upcoming study tasks.
- Flashcard review activity.
- Practice quiz results.
- Progress by course and topic.
- A study calendar.
- Suggested next steps.
- Personalized study plans.
- Learning analytics.

Planned learning tools include:

- Course summaries.
- Key terms.
- Flashcards.
- Practice quizzes.
- Mock exams.
- Topic-based review.
- Anki-compatible downloads.

Generate learning materials progressively as authorized course resources become available.

Do not claim to know how much a student has learned merely because documents were uploaded or time was spent in the application.

Base progress estimates on actual learning activities, assessment results, and clearly explained assumptions.

Make recommendations transparent and adjustable.

Do not build advanced analytics during Phase 1.

---

## 14. Anki compatibility

Support Anki-compatible exports in a later phase.

Start with a reliable text-based format such as TSV or CSV, with appropriate fields and tags.

Investigate the requested Anki **All in One** template and the **MC, SC, and KPRIM** question formats before claiming compatibility.

Preserve supported information such as:

- Question text.
- Answer choices.
- Correct answers.
- Explanations.
- Tags.
- Course information.
- Question type.

If complete compatibility requires an Anki package, media files, or a specialized template, document the requirements and implement the feature separately.

Do not claim that an export works with a particular template until it has been tested against the actual template or a verified specification.

Do not redistribute third-party templates without permission.

---

## 15. Course difficulty ratings

Eventually allow students to rate course difficulty and optionally add comments.

Organize feedback by course and semester.

Use safeguards against spam, harassment, and inappropriate content.

Explain that ratings represent student experiences, not objective academic measurements.

Keep course difficulty ratings separate from the quality or helpfulness of notes.

Do not invent course ratings or populate the catalog with fabricated student feedback.

---

## 16. French and English support

DentOS must support French and English from the beginning.

Implement a proper localization foundation.

Requirements:

- A clear language switcher.
- Translation files or another maintainable localization system.
- Translated navigation and implemented interface elements.
- Appropriate date, number, and text formatting.
- Consistent translation keys.
- No unnecessary hard-coded interface strings.
- A sensible default language.
- Persistence of the selected language where appropriate.

Do not translate official course names or university information inaccurately.

Preserve original academic terminology where necessary.

The French interface should read naturally, not like a literal machine translation.

The initial implemented screens must work in both languages. A toggle that changes only its own label is not sufficient.

---

## 17. Security, privacy, and reliability

Security and privacy are core product requirements.

Apply appropriate safeguards for:

- Authentication.
- Authorization.
- Server-side access control.
- Input validation.
- Database constraints.
- Session security.
- File uploads.
- Private storage.
- Rate limiting where needed.
- Safe error handling.
- Protection against unauthorized data access.
- Secret management.
- Audit history.
- Data retention.
- Backups and recovery planning.
- Dependency maintenance.
- Access-control testing.

Never expose private recordings, student account information, secrets, or restricted documents through public URLs or client-side configuration.

Do not store sensitive data without a clear reason.

Follow the principle of collecting only the information needed for the feature.

Consider applicable Canadian and Quebec privacy requirements, including Law 25 where relevant. Verify legal questions and flag them for qualified review rather than claiming compliance without evidence.

Respect academic copyright, recording consent, and university policies.

Do not use real student data for initial development.

Do not claim the application is production-secure merely because basic authentication works.

---

## 18. Accessibility and responsive behavior

Build the application to be usable on common screen sizes and input methods.

Requirements include:

- Responsive mobile, tablet, and desktop layouts.
- Semantic page structure.
- Keyboard navigation.
- Visible focus indicators.
- Accessible labels for forms and controls.
- Appropriate color contrast in both themes.
- Clear validation messages.
- Accessible dialogs and menus.
- Useful loading and error states.
- Reduced-motion support where appropriate.
- No reliance on color alone to communicate important status.

Test the actual interface rather than assuming that a responsive CSS framework guarantees accessibility.

Fix issues discovered during implementation.

---

## 19. Testing and engineering quality

Maintain a reliable development workflow.

Use appropriate automated tests for:

- Business logic.
- Input validation.
- Database behavior.
- Authentication and authorization.
- Critical UI interactions.
- Language switching.
- Theme switching and persistence.
- Important user flows.
- Data integrity.

For each phase:

1. Inspect relevant code before changing it.
2. Identify likely files and database structures affected.
3. Implement the smallest complete feature set.
4. Add or update tests.
5. Run relevant tests.
6. Run type checks.
7. Run linting where configured.
8. Run a production build where appropriate.
9. Fix problems caused by the changes.
10. Review security and data integrity.
11. Update documentation and the project checklist.
12. Report actual results.

Do not claim a test passed unless you actually ran it.

Do not conceal failed tests or silently skip relevant checks.

Distinguish pre-existing failures from failures introduced by your changes.

Do not add excessive dependencies or abstractions just to make the code appear more sophisticated.

Prefer readable, maintainable code.

---

## 20. Project documentation and roadmap

Maintain clear project documentation, including appropriate files for:

- Architecture and technical decisions.
- Database schema and migrations.
- Local environment setup.
- Testing.
- Environment variables.
- Security and privacy decisions.
- Implemented features.
- Planned features.
- Known issues.
- Deployment considerations.
- Project roadmap and feature backlog.

Keep a clear distinction between:

- Implemented.
- In progress.
- Planned.
- Blocked.
- Requiring approval.

Do not document a planned feature as implemented.

Update the documentation when an architectural decision changes.

Preserve backward compatibility where practical.

When adding features later, inspect their impact on the architecture, database, security, existing behavior, and tests.

Do not rebuild the application from scratch just because I request a new feature.

---

## 21. Phased implementation roadmap

Build DentOS in seven phases. Each phase must deliver a working, testable result.

Do not implement all phases in a single run.

### Phase 1: Foundation

Deliver:

- Project setup.
- Recommended application architecture.
- Design system.
- Premium responsive interface.
- Light and dark themes.
- Theme switcher and persistence.
- French and English localization foundation.
- Basic navigation and dashboard shell.
- Course catalog foundation.
- Appropriate database configuration and migrations.
- Secure authentication if it can be implemented and tested appropriately.
- Initial automated tests.
- Local setup documentation.

Use no fabricated official academic information.

### Phase 2: Academic resources

Deliver:

- Course pages.
- Course-outline uploads.
- Notes uploads and browsing.
- Search and filters.
- Professor and semester organization.
- Course offering separation.
- Version history foundations.
- Appropriate permissions and moderation.

### Phase 3: Exam passes

Deliver:

- Structured question submission.
- Pass collections.
- Duplicate detection.
- Proposed and verified answer statuses.
- Moderation and correction workflow.
- Search and filtering.
- Downloadable collections.

### Phase 4: Study tools

Deliver:

- Flashcard creation and management.
- Anki-compatible exports.
- Practice quizzes.
- Basic progress tracking.
- Appropriate tests for learning workflows.

### Phase 5: AI course tutors

Deliver:

- Secure AI integration.
- Course-specific retrieval.
- Source citations.
- Answers grounded in authorized course materials.
- Separation of current and historical course contexts.
- Usage limits and cost controls.
- Tests for source selection and access control.

### Phase 6: Audio

Deliver:

- Audio upload.
- In-browser recording where supported.
- Recording status and processing.
- Transcription.
- Transcript search.
- Tutor integration with appropriate source references.
- Consent and privacy safeguards.

### Phase 7: Advanced learning

Deliver:

- Automated summaries.
- Personalized study plans.
- Advanced progress analytics.
- Voice-based tutoring.
- Additional export formats.
- Further accessibility and quality improvements.

Keep future phases in mind when designing the foundation, but do not implement them prematurely.

---

## 22. Working rules for every future request

When I request a new feature:

1. Explain the goal in simple language.
2. Inspect the existing implementation.
3. Identify affected files, components, database structures, and integrations.
4. Consider security, privacy, accessibility, cost, and data integrity.
5. Choose the smallest complete implementation.
6. Preserve existing functionality.
7. Add tests.
8. Run relevant checks.
9. Update documentation.
10. Explain what works and what remains.

Use additive, backward-compatible changes where possible.

Do not remove features or replace architecture without a clear reason.

Do not expand scope merely because an idea might be useful someday.

Ask before making decisions that involve payment, deployment, publishing, destructive changes, or a critical unresolved security or architectural issue.

Otherwise, make sensible, reversible decisions and explain them afterward.

---

## 23. Model and development efficiency

Optimize for useful progress, maintainability, and reasonable development cost.

Avoid unnecessary exploration, repetitive analysis, excessive agent usage, and needless dependencies.

Do not launch multiple agents unless parallel work provides a clear benefit.

Use the currently selected model and effort unless the task genuinely warrants a change.

For routine implementation, styling, documentation, and straightforward bug fixes, prioritize efficient development.

For difficult security issues, complex architecture decisions, repeated unresolved bugs, or a deep final review, recommend a stronger model or higher effort and explain why before proceeding when a settings change is required.

Do not spend additional tokens or money merely to make a prompt or implementation longer.

Focus on verified results.

---

## 24. Immediate task: implement Phase 1 only

Start now.

### Step A: Inspect

Confirm the working directory, Git status, existing files, installed tools, dependencies, and current project state.

Do not delete, reset, recreate, or overwrite existing work.

### Step B: Present the architecture

Before implementation, provide a concise explanation of:

1. The recommended architecture.
2. The chosen frontend and application framework.
3. The database and migration approach.
4. The authentication approach and trade-offs.
5. The required dependencies.
6. The expected cost and any external setup.
7. The initial folder structure.
8. The Phase 1 implementation plan.
9. Important limitations or decisions that require approval.

Keep the explanation understandable to a beginner.

### Step C: Implement

After presenting the plan, proceed with Phase 1.

Do not wait for approval of ordinary, reversible choices.

Stop only when a genuinely critical decision, paid resource, external authorization, or safety issue requires my approval.

Implement the foundation and design preferences described in this prompt.

Do not attempt to build all seven phases.

### Step D: Verify

Run relevant tests, type checks, linting, and production builds.

Test the working application where possible.

Verify both themes, language switching, responsive layouts, navigation, and the actual course catalog foundation.

Do not claim functionality that has not been verified.

### Step E: Report

At completion, provide a concise, beginner-friendly report containing:

1. What you built.
2. The main files and folders created or changed.
3. The features that genuinely work.
4. The tests and checks you ran and their actual results.
5. Any failed checks or known limitations.
6. Exact commands to run the application locally.
7. Any required manual setup.
8. Any possible future costs.
9. The recommended next phase.

Do not deploy, publish, push code, merge branches, create paid services, or perform destructive operations.

The immediate goal is a reliable, polished, testable DentOS foundation that can grow without unnecessary architectural changes.

**Begin by inspecting the existing project. Then present the architecture and proceed with Phase 1.**
