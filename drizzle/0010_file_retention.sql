ALTER TABLE "exam_question_images" ADD COLUMN "file_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resource_versions" ADD COLUMN "file_deleted_at" timestamp with time zone;