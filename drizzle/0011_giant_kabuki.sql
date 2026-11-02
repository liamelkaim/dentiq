CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"university_preset" text,
	"program_year" integer,
	"semester" integer,
	"onboarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;