# Victor App — System Architecture

**Status:** Proposed architecture  
**Hosting:** Netlify  
**Backend:** Supabase  
**Initial domain:** Gym exercise and routine tracking  
**Principle:** A reusable, data-driven core with gym-specific behaviour kept in a separate domain layer.

## 1. Architecture overview

The application is a browser-based web app deployed by Netlify. Supabase provides PostgreSQL, authentication and its generated data API.

The initial version should use the Supabase JavaScript client in the browser to communicate directly with Supabase. Netlify hosts the frontend; a custom API server is not required for ordinary create, read, update and delete operations. PostgreSQL permissions and Row Level Security (RLS) enforce access.

### System flow

    Developer -> GitHub repository -> Netlify build and deploy
                                         |
    User browser -> Netlify-hosted frontend
                         |
                         | Supabase client + authenticated session
                         v
                   Supabase API gateway
                      |           |
                 Supabase Auth   PostgreSQL
                                    |
                              RLS policies
                                    |
                         authorised data only

### Component responsibilities

| Component | Responsibility |
|---|---|
| Web application | Screens, navigation, filtering, forms, client-side state and validation |
| Netlify | Build, deploy, host static assets, HTTPS and deploy previews |
| Supabase Auth | User identity and session management |
| Supabase PostgreSQL | Store datasets, items, categories, routines and item values |
| Supabase Data API | Database access through the Supabase client |
| PostgreSQL RLS | Enforce user/workspace data boundaries |
| GitHub | Source control and deployment source |

A Netlify Function is not required for the initial CRUD workflow. Add server-side functions only when a real requirement needs privileged operations, external secrets, scheduled work or third-party integrations.

## 2. Technology decisions

| Area | Proposed choice | Reason |
|---|---|---|
| Frontend | React + TypeScript + Vite | Component-based UI, typed code and straightforward static build |
| Styling | CSS approach to be selected during UI design | Keep presentation independent from data logic |
| Hosting | Netlify | Hosts the built frontend and deploys from GitHub |
| Database | Supabase PostgreSQL | Relational data, constraints, indexes and JSONB for flexible attributes |
| Authentication | Supabase Auth | Provides user identity for private, cross-device data |
| Database access | @supabase/supabase-js | Official JavaScript client |
| Schema changes | SQL migrations committed to Git | Repeatable, reviewable database changes |
| Tests | Unit and browser-level integration tests | Verify domain logic, permissions and workflows |

These are recommendations, not claims that the repository already uses this stack. Confirm the frontend framework before scaffolding the app.

## 3. Application layers

Keep responsibilities separated so the gym interface does not become the data model.

    src/
      app/                 Entry point, routing and providers
      components/          Reusable UI components
      features/
        datasets/           Dataset selection and management
        items/              Generic item catalogue and editing
        categories/         Category management and filters
        routines/           Routine lists and ordering
        gym/                Gym-specific screens and exercise rules
        progress/           Current values and progress presentation
      lib/
        supabase/           Supabase client and generated database types
      services/             Data-access functions
      domain/
        core/               Domain-independent types and rules
        gym/                Gym-specific types and rules
      styles/

### Layer rules

1. UI components call feature services or hooks; they do not contain raw SQL or duplicate database access logic.
2. Services encapsulate Supabase queries and mutations.
3. Core domain code must not depend on gym-specific concepts.
4. Gym features may use the core item, category and routine capabilities.
5. Filtering is represented as explicit filter state and translated into database queries where practical.
6. Database types should be generated from the Supabase schema where supported, rather than maintained as unrelated hand-written copies.

## 4. Data architecture

### 4.1 Data model principles

- A **workspace** is the ownership and access boundary for a user's data.
- A **dataset** is a collection of records for one purpose, such as Gym.
- An **item** is a generic record in a dataset. In the gym dataset, an item represents an exercise.
- An **attribute** stores flexible item-specific information without adding gym-only columns to the generic item table.
- A **category** classifies items. An item may belong to multiple categories.
- A **routine** is an ordered list of items, such as a Tuesday workout.
- A **routine item** links an existing item to a routine and stores its position.
- An **item value** stores a current named numeric value, such as an exercise's current working weight.

### 4.2 Proposed relational schema

| Table | Important columns | Purpose |
|---|---|---|
| workspaces | id, owner_id, name, timestamps | User-owned data boundary |
| datasets | id, workspace_id, key, name, domain | Separates collections/use cases |
| items | id, dataset_id, name, description, attributes JSONB, archived_at, timestamps | Generic records |
| categories | id, dataset_id, name, category_type | User-defined classification |
| item_categories | item_id, category_id | Many-to-many item/category relationship |
| routines | id, dataset_id, name, day_key, timestamps | Named routine or day-specific list |
| routine_items | routine_id, item_id, position | Ordered items in a routine |
| item_values | id, item_id, value_key, numeric_value, unit, updated_at | Current named numeric values |

Use UUID primary keys, foreign keys, sensible uniqueness constraints and created/updated timestamps. Use database constraints to prevent duplicate category links and invalid relationships.

The items.attributes JSONB column is for flexible domain-specific metadata (for example, notes or equipment). Frequently filtered or numerically compared values should use dedicated relational columns/tables rather than being buried in JSON.

### 4.3 Gym dataset example

- Dataset: gym
- Item: Dumbbell shoulder press
- Categories: Upper body, Shoulders
- Attributes: optional notes, equipment or preference metadata
- Item value: current_weight = 20, unit = kg
- Routine: Tuesday
- Routine item: links the exercise to Tuesday at its chosen position

The same core schema can later represent a books dataset or family-tree dataset by defining different item attributes and categories. Those future domain interfaces are not part of the first release.

### 4.4 Weight progress decision

The discussion prioritises current weight over workout-session history. The first implementation should therefore treat item_values as the authoritative current value.

Dated value history is an optional extension and remains an open product decision. If approved, add an item_value_history table containing the item value key, previous/new value, unit, change timestamp and actor. Do not introduce workout-session, set or rep tables to implement this feature.

## 5. Data access and application flows

### 5.1 Loading the gym view

1. The user opens the app.
2. The app restores or checks the Supabase Auth session.
3. The app requests the user's permitted workspace and gym dataset.
4. The app loads exercises, categories, routines and current values.
5. The UI renders the selected routine or catalogue.
6. User-selected filters are applied through service queries and reflected in the view.

### 5.2 Updating an exercise's current weight

1. The user edits the current weight field on an exercise.
2. The UI validates that the value is a valid non-negative number and has a supported unit.
3. The service updates the matching item_values row.
4. Supabase checks the caller's JWT and database RLS policies.
5. The UI refreshes the displayed current value and reports success or failure.

This operation does not create a workout-session record.

### 5.3 Editing routines

- Routines reference existing items; they do not duplicate exercise records.
- Adding an exercise creates a routine_items relationship.
- Reordering exercises updates their position values.
- Removing an exercise from a routine removes the relationship, not the exercise itself.
- Deleting or archiving an exercise must have an explicit, confirmed behaviour for its routine links.

## 6. Authentication and security

### 6.1 Recommended access model

The requirements leave account support unresolved. This architecture recommends Supabase Auth from the beginning because user identity is needed for private data and reliable cross-device access.

Each workspace has one owner in the initial version. Multi-user sharing and collaboration are out of scope unless separately approved.

### 6.2 Row Level Security

Enable RLS on every table exposed through the Supabase Data API. Policies must ensure that a signed-in user can access a row only when it belongs to a workspace they own. Apply the same ownership rule consistently through related datasets, items, categories, routines and values.

Do not rely on frontend filtering or hidden UI controls as security. Test both allowed and denied access paths.

### 6.3 API keys and secrets

- The browser may use the Supabase project URL and publishable key.
- These values are configuration, not a security boundary; RLS is what protects data.
- Never place a Supabase secret/service-role key in frontend code, Vite-exposed variables, Git or a public build.
- Store any server-only secrets in Netlify's environment-variable settings and access them only from server-side functions.
- Keep local .env files out of Git using .gitignore.

Suggested frontend environment variable names:

    VITE_SUPABASE_URL=
    VITE_SUPABASE_PUBLISHABLE_KEY=

The exact key label should match the key type shown in the Supabase project dashboard.

## 7. Netlify deployment architecture

### 7.1 Deployment flow

1. Source code and SQL migrations are committed to the GitHub repository.
2. Netlify watches the configured production branch.
3. Netlify installs dependencies and runs the frontend build.
4. Netlify publishes the generated static output directory.
5. A successful deployment becomes available over HTTPS.
6. Pull requests or non-production branches can use deploy previews where configured.

### 7.2 Initial build configuration

For a Vite application, the expected defaults are:

| Setting | Value |
|---|---|
| Build command | npm run build |
| Publish directory | dist |
| Production branch | main |
| Environment | Set the two frontend Supabase variables in Netlify |

A netlify.toml file can hold non-secret build and routing configuration. Do not put secret values in it.

If using client-side routing, configure a single-page-app fallback so application routes serve the frontend entry point. Add security headers after the app's routing and hosting behaviour is confirmed.

## 8. Database migrations and environments

Keep schema changes in the repository:

    supabase/
      migrations/
        YYYYMMDDHHMMSS_initial_schema.sql
      seed.sql                 Optional development data

- Migrations are the source of truth for database structure.
- Apply migrations to a development Supabase project first.
- Verify policies and constraints before applying to production.
- Do not make undocumented manual production schema changes.
- Keep development and production Supabase projects separate where practical.
- Use fictional/sample exercise data in development and tests.

## 9. Error handling and reliability

- Show loading, empty, success and error states for data-dependent screens.
- Distinguish network errors, authentication errors, validation errors and permission errors.
- Do not silently discard failed updates.
- Prevent duplicate submissions while a mutation is in progress.
- Confirm destructive actions.
- Use database constraints as the final integrity safeguard, even when the UI validates inputs.
- Avoid adding realtime subscriptions or offline write queues until a concrete requirement justifies their complexity.

## 10. Testing strategy

### Unit tests
- Generic item and category validation.
- Filter composition and query-state behaviour.
- Routine ordering logic.
- Weight value parsing and unit validation.

### Database/security tests
- RLS prevents one user from reading another user's workspace.
- RLS prevents unauthorised inserts, updates and deletes.
- Foreign keys prevent invalid routine/category relationships.
- Duplicate item/category links are rejected.
- Deleting or archiving records follows the chosen relationship rules.

### End-to-end tests
- Sign in and load the gym dataset.
- Create and edit an exercise.
- Assign multiple categories to an exercise.
- Create a routine and add/reorder exercises.
- Filter the routine by category.
- Update current exercise weight.
- Correct or delete an incorrect value.
- Verify that no set, rep or workout-session entry is required.

## 11. Initial implementation sequence

1. Confirm framework, authentication and unresolved product decisions.
2. Scaffold the frontend and connect it to Netlify.
3. Create the Supabase project and configure environment variables.
4. Implement the initial schema, constraints and RLS policies as migrations.
5. Implement authentication and workspace ownership.
6. Implement generic datasets, items and categories.
7. Implement routines and routine-item ordering.
8. Implement gym-specific exercise screens and current weight values.
9. Implement filtering, validation, error states and tests.
10. Deploy to a preview environment, verify security, then promote to production.

## 12. Decisions still requiring confirmation

These points were not settled in the source requirements and should be confirmed before implementation:

- [ ] Confirm React + TypeScript + Vite, or select another frontend framework.
- [ ] Confirm that Supabase Auth and individual user accounts are required for the first release.
- [ ] Confirm whether dated weight history is required now or only current values.
- [ ] Confirm routine model: reusable weekday templates, date-specific routines, or both.
- [ ] Confirm supported weight units (kg only initially or user-selectable).
- [ ] Confirm exercise deletion behaviour when the exercise is already in routines.
- [ ] Confirm whether offline use is required.
- [ ] Confirm whether the initial UI must support both mobile and desktop layouts.

## 13. Reference documentation

- [Supabase architecture](https://supabase.com/docs/guides/getting-started/architecture)
- [Supabase database overview](https://supabase.com/docs/guides/database/overview)
- [Supabase Auth architecture](https://supabase.com/docs/guides/auth/architecture)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase JavaScript client installation](https://supabase.com/docs/reference/javascript/installing)
- [Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/)
- [Netlify environment variables](https://docs.netlify.com/build/environment-variables/get-started/)

## Source

This architecture translates docs/victor-app-requirements.md into a proposed technical design for Netlify and Supabase. Product decisions that were not made in the discussion are marked for confirmation rather than treated as settled requirements.
