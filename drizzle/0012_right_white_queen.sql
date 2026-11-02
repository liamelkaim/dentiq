CREATE TABLE "academic_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name_fr" text NOT NULL,
	"name_en" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"source_url" text,
	"source_retrieved_on" date,
	CONSTRAINT "academic_periods_order" CHECK ("academic_periods"."start_date" <= "academic_periods"."end_date")
);
--> statement-breakpoint
CREATE TABLE "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution" text NOT NULL,
	"academic_year" text NOT NULL,
	"term" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"source_url" text,
	"source_retrieved_on" date,
	CONSTRAINT "academic_terms_institution_academicYear_term_unique" UNIQUE("institution","academic_year","term"),
	CONSTRAINT "academic_terms_order" CHECK ("academic_terms"."start_date" <= "academic_terms"."end_date")
);
--> statement-breakpoint
CREATE TABLE "user_class_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid,
	"title" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"location" text,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_class_blocks_weekday" CHECK ("user_class_blocks"."weekday" between 1 and 7),
	CONSTRAINT "user_class_blocks_times" CHECK ("user_class_blocks"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "user_class_blocks"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "user_class_blocks"."start_time" < "user_class_blocks"."end_time"),
	CONSTRAINT "user_class_blocks_dates" CHECK ("user_class_blocks"."valid_from" <= "user_class_blocks"."valid_to"),
	CONSTRAINT "user_class_blocks_title" CHECK (length(btrim("user_class_blocks"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "user_courses" (
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_courses_user_id_course_id_pk" PRIMARY KEY("user_id","course_id")
);
--> statement-breakpoint
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_class_blocks" ADD CONSTRAINT "user_class_blocks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_class_blocks" ADD CONSTRAINT "user_class_blocks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_courses" ADD CONSTRAINT "user_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academic_periods_term_id_index" ON "academic_periods" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "user_class_blocks_user_id_index" ON "user_class_blocks" USING btree ("user_id");