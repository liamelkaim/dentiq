CREATE TABLE "recording_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"at_seconds" integer,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recording_notes_body_present" CHECK (length(btrim("recording_notes"."body")) > 0),
	CONSTRAINT "recording_notes_position" CHECK ("recording_notes"."at_seconds" is null or "recording_notes"."at_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"course_id" uuid,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"lecturer_name" text,
	"consent_confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordings_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "recordings_title_present" CHECK (length(btrim("recordings"."title")) > 0),
	CONSTRAINT "recordings_size_positive" CHECK ("recordings"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "recording_notes" ADD CONSTRAINT "recording_notes_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_notes" ADD CONSTRAINT "recording_notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recording_notes_recording_id_index" ON "recording_notes" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "recordings_owner_id_created_at_index" ON "recordings" USING btree ("owner_id","created_at");