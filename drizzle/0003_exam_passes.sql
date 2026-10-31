CREATE TABLE "exam_question_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"proposed_correct" boolean,
	"verified_correct" boolean,
	CONSTRAINT "exam_question_choices_questionId_position_unique" UNIQUE("question_id","position"),
	CONSTRAINT "exam_question_choices_position_range" CHECK ("exam_question_choices"."position" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "exam_question_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"reporter_id" text,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_note" text,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_question_revisions_questionId_revisionNumber_unique" UNIQUE("question_id","revision_number"),
	CONSTRAINT "exam_question_revisions_number_positive" CHECK ("exam_question_revisions"."revision_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"offering_id" uuid,
	"professor_id" uuid,
	"exam_academic_year" text NOT NULL,
	"exam_term" text,
	"topic" text,
	"question_type" text NOT NULL,
	"question_text" text NOT NULL,
	"explanation" text,
	"provenance" text DEFAULT 'recalled' NOT NULL,
	"confidence" text,
	"rights_confirmed" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"answer_status" text DEFAULT 'proposed' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"fingerprint" text NOT NULL,
	"duplicate_of_id" uuid,
	"contributed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_questions_year_valid" CHECK (case when "exam_questions"."exam_academic_year" ~ '^[0-9]{4}-[0-9]{4}$'
            then substr("exam_questions"."exam_academic_year", 6, 4)::int = substr("exam_questions"."exam_academic_year", 1, 4)::int + 1
            else false end),
	CONSTRAINT "exam_questions_rights_confirmed" CHECK ("exam_questions"."rights_confirmed" = true),
	CONSTRAINT "exam_questions_verified_has_date" CHECK ("exam_questions"."answer_status" = 'proposed' or "exam_questions"."verified_at" is not null),
	CONSTRAINT "exam_questions_not_own_duplicate" CHECK ("exam_questions"."duplicate_of_id" is null or "exam_questions"."duplicate_of_id" <> "exam_questions"."id")
);
--> statement-breakpoint
ALTER TABLE "exam_question_choices" ADD CONSTRAINT "exam_question_choices_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_reports" ADD CONSTRAINT "exam_question_reports_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_reports" ADD CONSTRAINT "exam_question_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_reports" ADD CONSTRAINT "exam_question_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_revisions" ADD CONSTRAINT "exam_question_revisions_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_revisions" ADD CONSTRAINT "exam_question_revisions_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_professor_id_professors_id_fk" FOREIGN KEY ("professor_id") REFERENCES "public"."professors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_duplicate_of_id_exam_questions_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."exam_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_contributed_by_user_id_fk" FOREIGN KEY ("contributed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_question_reports_status_index" ON "exam_question_reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_question_reports_one_open_per_reporter" ON "exam_question_reports" USING btree ("question_id","reporter_id") WHERE "exam_question_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "exam_questions_course_id_status_index" ON "exam_questions" USING btree ("course_id","status");--> statement-breakpoint
CREATE INDEX "exam_questions_course_id_exam_academic_year_index" ON "exam_questions" USING btree ("course_id","exam_academic_year");--> statement-breakpoint
CREATE INDEX "exam_questions_course_id_fingerprint_index" ON "exam_questions" USING btree ("course_id","fingerprint");--> statement-breakpoint
CREATE INDEX "exam_questions_offering_id_index" ON "exam_questions" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "exam_questions_contributed_by_index" ON "exam_questions" USING btree ("contributed_by");--> statement-breakpoint
CREATE INDEX "exam_questions_duplicate_of_id_index" ON "exam_questions" USING btree ("duplicate_of_id");