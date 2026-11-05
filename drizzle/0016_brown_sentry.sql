CREATE TABLE "content_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"appellant_id" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_appeals_message_present" CHECK (length(btrim("content_appeals"."message")) > 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_consents" ADD COLUMN "locale" text DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_appeals" ADD CONSTRAINT "content_appeals_appellant_id_user_id_fk" FOREIGN KEY ("appellant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_appeals" ADD CONSTRAINT "content_appeals_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_appeals_status_created_at_index" ON "content_appeals" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_appeals_one_open" ON "content_appeals" USING btree ("entity_type","entity_id","appellant_id") WHERE "content_appeals"."status" = 'open';