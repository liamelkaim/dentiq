CREATE TABLE "exam_question_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"alt_text" text,
	"uploaded_by" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_question_images_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "exam_question_images_questionId_position_unique" UNIQUE("question_id","position"),
	CONSTRAINT "exam_question_images_position_range" CHECK ("exam_question_images"."position" between 1 and 20),
	CONSTRAINT "exam_question_images_size_positive" CHECK ("exam_question_images"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_questions" ADD COLUMN "proposed_answer_text" text;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD COLUMN "verified_answer_text" text;--> statement-breakpoint
ALTER TABLE "exam_question_images" ADD CONSTRAINT "exam_question_images_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_images" ADD CONSTRAINT "exam_question_images_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;