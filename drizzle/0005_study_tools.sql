CREATE TABLE "study_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"outcome" text NOT NULL,
	"answer_basis" text NOT NULL,
	"response" jsonb NOT NULL,
	"self_rating" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_attempts_scored_needs_verified" CHECK ("study_attempts"."outcome" = 'unscored' or "study_attempts"."answer_basis" = 'verified')
);
--> statement-breakpoint
CREATE TABLE "study_card_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"question_id" uuid,
	"personal_card_id" uuid,
	"rating" text NOT NULL,
	"box_before" integer NOT NULL,
	"box_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_card_reviews_one_kind" CHECK (("study_card_reviews"."question_id" is null) <> ("study_card_reviews"."personal_card_id" is null))
);
--> statement-breakpoint
CREATE TABLE "study_personal_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL,
	"lapse_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_personal_cards_box_range" CHECK ("study_personal_cards"."box" between 0 and 5),
	CONSTRAINT "study_personal_cards_text_present" CHECK (length(trim("study_personal_cards"."front")) > 0 and length(trim("study_personal_cards"."back")) > 0)
);
--> statement-breakpoint
CREATE TABLE "study_question_cards" (
	"user_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL,
	"lapse_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "study_question_cards_user_id_question_id_pk" PRIMARY KEY("user_id","question_id"),
	CONSTRAINT "study_question_cards_box_range" CHECK ("study_question_cards"."box" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "study_question_marks" (
	"user_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"review_later" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_question_marks_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "study_quiz_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"response" jsonb,
	"outcome" text,
	"answer_basis" text,
	"self_rating" text,
	"answered_at" timestamp with time zone,
	CONSTRAINT "study_quiz_items_quizId_position_unique" UNIQUE("quiz_id","position"),
	CONSTRAINT "study_quiz_items_quizId_questionId_unique" UNIQUE("quiz_id","question_id"),
	CONSTRAINT "study_quiz_items_scored_needs_verified" CHECK ("study_quiz_items"."outcome" is null or "study_quiz_items"."outcome" = 'unscored' or "study_quiz_items"."answer_basis" = 'verified')
);
--> statement-breakpoint
CREATE TABLE "study_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid,
	"scope" jsonb NOT NULL,
	"requested_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "study_quizzes_count_positive" CHECK ("study_quizzes"."requested_count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_attempts" ADD CONSTRAINT "study_attempts_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_card_reviews" ADD CONSTRAINT "study_card_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_card_reviews" ADD CONSTRAINT "study_card_reviews_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_card_reviews" ADD CONSTRAINT "study_card_reviews_personal_card_id_study_personal_cards_id_fk" FOREIGN KEY ("personal_card_id") REFERENCES "public"."study_personal_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_personal_cards" ADD CONSTRAINT "study_personal_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_personal_cards" ADD CONSTRAINT "study_personal_cards_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_question_cards" ADD CONSTRAINT "study_question_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_question_cards" ADD CONSTRAINT "study_question_cards_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_question_marks" ADD CONSTRAINT "study_question_marks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_question_marks" ADD CONSTRAINT "study_question_marks_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_quiz_items" ADD CONSTRAINT "study_quiz_items_quiz_id_study_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."study_quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_quiz_items" ADD CONSTRAINT "study_quiz_items_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_quizzes" ADD CONSTRAINT "study_quizzes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_quizzes" ADD CONSTRAINT "study_quizzes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_attempts_user_id_created_at_index" ON "study_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "study_attempts_user_id_question_id_index" ON "study_attempts" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "study_card_reviews_user_id_created_at_index" ON "study_card_reviews" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "study_personal_cards_user_id_due_at_index" ON "study_personal_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "study_question_cards_user_id_due_at_index" ON "study_question_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "study_quizzes_user_id_created_at_index" ON "study_quizzes" USING btree ("user_id","created_at");