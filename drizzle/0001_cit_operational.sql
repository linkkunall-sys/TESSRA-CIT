CREATE TABLE "faculty_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"faculty_id" integer NOT NULL,
	"type" text NOT NULL,
	"day" integer NOT NULL,
	"period" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_availability_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"day" integer NOT NULL,
	"period" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "request_windows" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "requested_room_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "requested_room_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "mandatory_group_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "duration_periods" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "raw_text" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "official_reason" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "lecture_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "tutorial_hours" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "lab_blocks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "course_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "source_day" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "source_session" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "room_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "expected_size" integer;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "allowed_room_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "basket_slot" text;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "needs_accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "allowed_uses" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_sessions" ADD COLUMN "expected_size" integer;--> statement-breakpoint
ALTER TABLE "scheduled_sessions" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_sessions" ADD COLUMN "basket_slot" text;--> statement-breakpoint
ALTER TABLE "student_groups" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "student_groups" ADD COLUMN "needs_accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "max_hours_per_day" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "needs_accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "faculty_preferences" ADD CONSTRAINT "faculty_preferences_faculty_id_users_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_availability_blocks" ADD CONSTRAINT "room_availability_blocks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_preferences_unique" ON "faculty_preferences" USING btree ("faculty_id","type","day","period");--> statement-breakpoint
CREATE UNIQUE INDEX "room_availability_blocks_unique" ON "room_availability_blocks" USING btree ("room_id","day","period");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requested_room_id_rooms_id_fk" FOREIGN KEY ("requested_room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_source_id_unique" UNIQUE("source_id");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_source_id_unique" UNIQUE("source_id");--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_source_id_unique" UNIQUE("source_id");--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_source_id_unique" UNIQUE("source_id");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_source_id_unique" UNIQUE("source_id");--> statement-breakpoint
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_source_id_unique" UNIQUE("source_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_source_id_unique" UNIQUE("source_id");