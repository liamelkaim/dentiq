CREATE TABLE "tutor_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"course_id" uuid,
	"context_chars" integer DEFAULT 0 NOT NULL,
	"passage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_usage_counts_non_negative" CHECK ("tutor_usage"."context_chars" >= 0 and "tutor_usage"."passage_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_usage" ADD CONSTRAINT "tutor_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_usage" ADD CONSTRAINT "tutor_usage_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_usage_user_id_usage_date_index" ON "tutor_usage" USING btree ("user_id","usage_date");