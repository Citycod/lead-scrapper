# EduPal Backend & Database Architecture Documentation

This document provides a comprehensive overview of the EduPal backend architecture, database schema, and design patterns.

## 1. High-Level Architecture

EduPal utilizes a **Next.js App Router** architecture combined with **Supabase** acting as a backend-as-a-service (BaaS) and primary PostgreSQL database.

*   **Frontend-to-Backend**: The frontend communicates directly with Supabase via the Supabase JS Client for basic CRUD operations (taking advantage of Row Level Security), and uses Next.js API routes (`/api/*`) for customized server-side logic (e.g., integrations, complex queries, email dispatching).
*   **Database**: Supabase PostgreSQL database utilizing advanced concepts like multiple schemas (`public` and `academic`), row-level security (RLS), views, and Postgres triggers.

---

## 2. Database Structure & "Schema Bridging"

The database is designed with a high-fidelity separation of concerns, operating primarily across two schemas: **`public`** and **`academic`**.

### The "Schema Bridging" Design Pattern
One of the most defining characteristics of the EduPal database is **Schema Bridging**.
Because direct access to multiple schemas can sometimes cause PostgREST routing errors (406/400 errors) in Supabase client calls, the system uses **Views in the `public` schema** that act as proxies to the tables in the `academic` schema.

*   **Tables live in `academic`**: e.g., `academic.resources`, `academic.courses`.
*   **Views live in `public`**: e.g., `public.hub_resources`, `public.hub_courses`.
*   **Triggers handle writes**: Because views are generally read-only in Postgres, `INSTEAD OF INSERT` and `INSTEAD OF UPDATE` triggers are attached to the `hub_*` views. When Next.js inserts into `hub_resources`, the trigger intercepts it and safely inserts it into `academic.resources`.

### Core Schemas and Tables

#### 1. `public` Schema (Core Auth & Global Context)
*   **`profiles`**: The central user table, linked 1:1 with `auth.users` via a foreign key on `id`.
    *   *Key Columns*: `email`, `full_name`, `avatar_url`, `institution_id`, `department_id`, `level`.
*   **Hub Views**: `hub_institutions`, `hub_departments`, `hub_courses`, `hub_resources`, `hub_posts`, `hub_student_profiles`. These handle complex standard joins server-side (like merging user names/avatars with resource records) so the frontend doesn''t have to.

#### 2. `academic` Schema (Premium Refinement & Education Data)
*   **`institutions`**: Represents Universities/Colleges.
*   **`departments`**: Belongs to an institution. (Unique by name + institution_id).
*   **`student_profiles`**: Deep academic context for a user, automatically kept in sync with `public.profiles` via the `on_profile_update_sync` trigger.
*   **`courses`**: Academic courses tied to a specific department and level.
*   **`resources`**: Uploaded student materials, past questions, and notes. Linked to courses, institutions, and the uploader.
*   **`posts` & `comments`**: Discussion boards tied to specific courses.
*   **`academic_sessions`**: E.g., "2023/2024".

---

## 3. Authentication & Automated Onboarding Flow

EduPal uses a highly automated onboarding flow driven by Postgres triggers that fire when a user signs up.

1.  **Signup API Route (`/api/auth/signup`)**: Receives the user''s email, password, and metadata (like university name, major, and level). It creates the user in Supabase Auth via the Admin client.
2.  **`handle_new_user()` Trigger**: As soon as the user is inserted into `auth.users`, a database trigger fires automatically.
    *   It looks at the `raw_user_meta_data`.
    *   **Auto-creation**: If the `university` string isn''t in `academic.institutions`, it creates it immediately.
    *   **Auto-creation**: If the `major` string isn''t in `academic.departments` under that university, it creates it.
    *   It then creates the `public.profiles` record, storing the newly resolved `institution_id` and `department_id`.

This completely eliminates the need for manual approval of new schools/departments during signup, driving viral loop onboarding.

---

## 4. Next.js API Route Structure

The Next.js backend (`app/api/`) acts as the secure middle-tier for operations that shouldn''t be exposed to the public client. The folders represent domain-driven features:

*   **`/api/auth`**: Authentication helpers (e.g., signup logic enforcing rate limits and restricted admin names).
*   **`/api/catalog`**: fetching global course catalogs, resolving CCMAS-compliant seed data.
*   **`/api/curriculum`**: Used to generate or fetch rigid standard curriculums.
*   **`/api/premium`**: Handlers for premium tools (like AI project topic generators) that require checking the user''s subscription level or academic level securely.
*   **`/api/study`**: AI-driven study tools (like flashcard generations, study roadmaps, or summarization tools).
*   **`/api/subscribe`**: Payment provider integrations (e.g., Paystack webhooks and checkout sessions).
*   **`/api/resources` & `/api/admin`**: Moderation endpoints, file processing, and advanced metadata extraction.

---

## 5. Security Context (Row Level Security)

Security is strictly enforced at the database level using Supabase RLS (Row Level Security).

*   **Implicit Institution Isolation**: Almost all policies on `academic.*` tables verify that the user querying the data belongs to the same institution.
    *   *Example*: `academic_courses_select_inst` policy ensures a user can only query `academic.courses` if their profile''s `institution_id` matches the course''s department''s `institution_id`.
*   **Super Admin Override**: A PL/pgSQL function `public.is_super_admin()` checks if the user''s role is `super_admin`. Super admins bypass standard institution-level restrictions to moderate global resources.
*   **Ownership Check**: `UPDATE` and `DELETE` queries on resources/posts verify `uploader_id = auth.uid()`.

## 6. Gamification & System Reliability

*   **Stats Engine (`hub_user_stats`)**: Track points, streaks, uploads, and download credits. Gamification triggers automatically update points on certain actions (e.g., `quiz_points_trigger.sql`).
*   **Nightly/Cron Jobs**: Python and Shell scripts like `generate_bio_sql.py` or `.cjs` DB checkers exist to maintain catalog migrations, validate DB consistency, and seed new CCMAS-compliant curriculum structures systematically.
