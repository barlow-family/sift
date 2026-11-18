# Victor App — System Architecture

**Status:** Confirmed architecture decisions  
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
| Frontend | React + TypeScript + Vite | Confirmed framework |
| Styling | CSS approach to be selected during UI design | Keep presentation independent from data logic |
| Hosting | Netlify | Hosts the built frontend and deploys from GitHub |
| Database | Supabase PostgreSQL | Relational data, constraints, indexes and JSONB for flexible attributes |
| Authentication | Supabase Auth with individual accounts | Confirmed; each user has private data |
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
- A **routine** is a named collection of items that the user can choose at any time; it is not assigned to a weekday or calendar date.
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
| routines | id, dataset_id, name, timestamps | Named exercise collection; no weekday or calendar assignment |
| routine_items | routine_id, item_id, position | Ordered items in a routine |
| item_values | id, item_id, value_key, numeric_value, unit, updated_at | Current named numeric values, stored consistently for conversion |
| item_value_history | id, item_id, value_key, numeric_value, unit, changed_at, changed_by | Dated record of each value change |
| workspace_settings | workspace_id, preferred_weight_unit | Preferred display unit: kg or lb |

Use UUID primary keys, foreign keys, sensible uniqueness constraints and created/updated timestamps. Use database constraints to prevent duplicate category links and invalid relationships.

The items.attributes JSONB column is for flexible domain-specific metadata (for example, notes or equipment). Frequently filtered or numerically compared values should use dedicated relational columns/tables rather than being buried in JSON.

### 4.3 Gym dataset example

- Dataset: gym
- Item: Dumbbell shoulder press
- Categories: Upper body, Shoulders
- Attributes: optional notes, equipment or preference metadata
- Item value: current_weight = 20 kg (canonical stored value)
- Routine: a named collection, for example Push Day
- Routine item: links the exercise to the collection at its chosen position

The same core schema can later represent a books dataset or family-tree dataset by defining different item attributes and categories. Those future domain interfaces are not part of the first release.

### 4.4 Weight progress and units

Dated weight history is required in the first release. `item_values` holds the current value, while `item_value_history` records each change with its timestamp and actor. Updating a weight must update the current value and append its history entry atomically. Incorrect history entries must be correctable or removable.

Users can choose kilograms or pounds as their preferred display unit. Store weight values consistently in kilograms and convert for display and input according to the user's preference. Do not introduce workout-session, set or rep tables to implement this feature.

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

- Routines are named, standalone collections and are not tied to weekdays or calendar dates.
- Users can create multiple routines, choose among them and filter routines/exercises using categories and other supported attributes.
- Routines reference existing items; they do not duplicate exercise records.
- Adding an exercise creates a routine_items relationship; reordering updates its position.
- Removing an exercise from a routine removes the relationship, not the exercise itself.
- Archiving an exercise hides it from normal lists and prevents adding it to new routines, but preserves its history and existing routine links. Archived exercises can be restored.

## 6. Authentication and security

### 6.1 Confirmed access model

Use Supabase Auth with individual user accounts. Each user has a private workspace and their own data. Each workspace has one owner in the initial version. Multi-user sharing and collaboration are out of scope unless separately approved.

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
- The initial app is online-only: an internet connection is required to load, edit and save data. Do not implement offline caching, offline writes or synchronisation.

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

## 11. Responsive design and connectivity

The interface must be responsive across desktop, tablet and mobile screens. Core workflows must remain usable on both small and large screens.

The app is online-only. An internet connection is required for loading and all data operations.

## 12. Confirmed implementation decisions

| Area | Decision |
|---|---|
| Frontend | React + TypeScript + Vite |
| Accounts | Individual Supabase Auth accounts; private user data |
| Weight history | Keep dated weight changes and the current value |
| Routines | Named, standalone exercise collections; no weekday or date assignment |
| Routine selection | Users choose collections and filter them/exercises using available filters |
| Weight units | Support kg and lb with a selectable preferred display unit |
| Exercise removal | Archive; preserve history and existing routine references; allow restoration |
| Offline | Online-only; no offline caching or synchronisation |
| Devices | Responsive desktop, tablet and mobile layout |

## 13. Initial implementation sequence

1. Scaffold the React + TypeScript + Vite frontend and connect it to Netlify.
2. Create the Supabase project and configure environment variables.
3. Implement schema, constraints, dated weight history and RLS policies as migrations.
4. Implement individual authentication and workspace ownership.
5. Implement generic datasets, items and categories.
6. Implement named routines, routine-item ordering and filtering.
7. Implement gym-specific exercise screens, unit preferences and weight history.
8. Implement archive/restore behaviour, validation, error states and tests.
9. Verify responsive behaviour across desktop, tablet and mobile.
10. Deploy to a preview environment, verify security, then promote to production.

## 13. Reference documentation

- [Supabase architecture](https://supabase.com/docs/guides/getting-started/architecture)
- [Supabase database overview](https://supabase.com/docs/guides/database/overview)
- [Supabase Auth architecture](https://supabase.com/docs/guides/auth/architecture)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase JavaScript client installation](https://supabase.com/docs/reference/javascript/installing)
- [Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/)
- [Netlify environment variables](https://docs.netlify.com/build/environment-variables/get-started/)

## Source

This architecture translates docs/victor-app-requirements.md into the confirmed technical design for the initial Netlify and Supabase implementation.
