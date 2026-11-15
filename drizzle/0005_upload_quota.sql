CREATE TABLE "a11y"."upload_quota" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "upload_quota_project_id_day_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
ALTER TABLE "a11y"."upload_quota" ADD CONSTRAINT "upload_quota_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "a11y"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "a11y"."upload_quota" ENABLE ROW LEVEL SECURITY;
