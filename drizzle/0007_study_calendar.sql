CREATE TABLE "study_calendar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"entry_date" date NOT NULL,
	"entry_time" text,
	"course_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_calendar_entries_title_present" CHECK (length(btrim("study_calendar_entries"."title")) > 0),
	CONSTRAINT "study_calendar_entries_time_format" CHECK ("study_calendar_entries"."entry_time" is null or "study_calendar_entries"."entry_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "study_calendar_entries" ADD CONSTRAINT "study_calendar_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_calendar_entries" ADD CONSTRAINT "study_calendar_entries_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_calendar_entries_user_id_entry_date_index" ON "study_calendar_entries" USING btree ("user_id","entry_date");