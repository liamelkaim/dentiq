CREATE TABLE "course_note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"change_note" text,
	"restored_from_version" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_note_versions_noteId_versionNumber_unique" UNIQUE("note_id","version_number"),
	CONSTRAINT "course_note_versions_number_positive" CHECK ("course_note_versions"."version_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "course_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"offering_id" uuid,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_notes_title_not_blank" CHECK (length(btrim("course_notes"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "course_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_topics_name_not_blank" CHECK (length(btrim("course_topics"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "note_question_links" (
	"note_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_question_links_note_id_question_id_pk" PRIMARY KEY("note_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "note_topics" (
	"note_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_topics_note_id_topic_id_pk" PRIMARY KEY("note_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "question_topics" (
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_topics_question_id_topic_id_pk" PRIMARY KEY("question_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "resource_question_links" (
	"resource_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_question_links_resource_id_question_id_pk" PRIMARY KEY("resource_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "resource_topics" (
	"resource_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_topics_resource_id_topic_id_pk" PRIMARY KEY("resource_id","topic_id")
);
--> statement-breakpoint
ALTER TABLE "course_note_versions" ADD CONSTRAINT "course_note_versions_note_id_course_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."course_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_note_versions" ADD CONSTRAINT "course_note_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_notes" ADD CONSTRAINT "course_notes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_notes" ADD CONSTRAINT "course_notes_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_notes" ADD CONSTRAINT "course_notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_question_links" ADD CONSTRAINT "note_question_links_note_id_course_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."course_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_question_links" ADD CONSTRAINT "note_question_links_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_question_links" ADD CONSTRAINT "note_question_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_topics" ADD CONSTRAINT "note_topics_note_id_course_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."course_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_topics" ADD CONSTRAINT "note_topics_topic_id_course_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."course_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_topics" ADD CONSTRAINT "note_topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_topic_id_course_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."course_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_question_links" ADD CONSTRAINT "resource_question_links_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_question_links" ADD CONSTRAINT "resource_question_links_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_question_links" ADD CONSTRAINT "resource_question_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_topics" ADD CONSTRAINT "resource_topics_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_topics" ADD CONSTRAINT "resource_topics_topic_id_course_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."course_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_topics" ADD CONSTRAINT "resource_topics_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_notes_owner_id_course_id_index" ON "course_notes" USING btree ("owner_id","course_id");--> statement-breakpoint
CREATE INDEX "course_notes_offering_id_index" ON "course_notes" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "course_topics_course_id_sort_order_index" ON "course_topics" USING btree ("course_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "course_topics_course_name_unique" ON "course_topics" USING btree ("course_id",lower("name"));--> statement-breakpoint
CREATE INDEX "note_question_links_question_id_index" ON "note_question_links" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "note_topics_topic_id_index" ON "note_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "question_topics_topic_id_index" ON "question_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "resource_question_links_question_id_index" ON "resource_question_links" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "resource_topics_topic_id_index" ON "resource_topics" USING btree ("topic_id");